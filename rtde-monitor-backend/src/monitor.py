"""Subscribe to RTDE outputs and keep the latest sample for the operator screens."""

import errno
import logging
import os
import threading
import time

import rtde
from constants import FREQUENCY_DEFAULT_HZ, normalize_frequency
from recipes import chunk_fields, register_groups, signal_groups

LOG = logging.getLogger("rtde-monitor")
RECIPE_BUDGET = 400
# A rejected recipe closes its socket. Later reads on that socket are not operator errors.
_CLOSED_ERRNOS = {
    errno.EBADF,
    errno.EPIPE,
    errno.ECONNRESET,
    errno.ECONNABORTED,
    errno.ENOTCONN,
    getattr(errno, "ESHUTDOWN", 108),
}
_HIDDEN_SOCKET_TEXT = (
    "has no attribute 'recv'",
    "has no attribute 'send'",
    "has no attribute 'sendall'",
    "has no attribute 'fileno'",
    "Bad file descriptor",
    "Broken pipe",
    "Connection reset by peer",
    "Connection aborted",
    "Transport endpoint is not connected",
    "Connection lost",
    "received 0 bytes",
    "Cannot receive when RTDE synchronization is inactive",
    "Output configuration not initialized",
    "not connected to Robot",
    "[Errno 9]",
    "[Error 9]",
    "fileno() method",
)
_SETUP_ATTEMPTS = 3
_SETUP_RETRY_S = 0.15


class RecipeStream:
    def __init__(self, fields, host, port, frequency):
        self.fields = fields
        self.host = host
        self.port = port
        self.frequency = frequency
        self.values = {}
        self.types = {}
        self.unavailable = []
        self.error = ""
        self.received = False
        self._stop = threading.Event()
        self._restart = threading.Event()
        self._lock = threading.Lock()
        self._connections = []
        self._threads = []
        self._supervisor = threading.Thread(target=self._supervise, name="rtde-supervisor", daemon=True)

    def start(self):
        self._supervisor.start()

    def set_frequency(self, frequency):
        frequency = normalize_frequency(frequency)
        if self._stop.is_set():
            return
        with self._lock:
            if self.frequency == frequency:
                return
            self.frequency = frequency
        self._restart.set()

    def stop(self):
        self._stop.set()
        self._close_children()
        self._supervisor.join(timeout=3)

    def snapshot(self, groups_for):
        with self._lock:
            error = "" if self._hidden_socket_error(self.error) else self.error
            return {
                "ok": self.received and not error,
                "error": error,
                "host": f"{self.host}:{self.port}",
                "frequency": self.frequency,
                "unavailable": list(self.unavailable),
                "groups": groups_for(dict(self.values), dict(self.types)),
            }

    def _supervise(self):
        while not self._stop.is_set():
            try:
                with self._lock:
                    self.unavailable = []
                self._open_all()
                if not self._threads:
                    with self._lock:
                        self.error = "The controller accepted none of the requested RTDE outputs"
                while not self._stop.is_set() and self._threads and all(thread.is_alive() for thread in self._threads):
                    if self._restart.wait(0.5):
                        break
            except (OSError, TimeoutError) as exc:
                if self._hidden_socket_error(str(exc)) or self._closed_socket(exc):
                    LOG.warning("RTDE socket closed during setup: %s", exc)
                else:
                    with self._lock:
                        self.error = f"Waiting for RTDE at {self.host}:{self.port} ({exc})"
                    LOG.warning("%s", self.error)
            except Exception as exc:
                if self._hidden_socket_error(str(exc)):
                    LOG.warning("RTDE socket closed during setup: %s", exc)
                else:
                    with self._lock:
                        self.error = str(exc)
                    LOG.exception("RTDE setup failed")
            self._close_children()
            if self._stop.is_set():
                break
            if self._restart.is_set():
                self._restart.clear()
                continue
            if self._stop.wait(2):
                break

    def _open_all(self):
        probe = rtde.RTDE(self.host, self.port)
        probe.connect()
        probe.disconnect()
        for group in chunk_fields(self.fields, RECIPE_BUDGET):
            self._open_resilient(group)

    def _open_resilient(self, fields, socket_attempts=0):
        if not fields or self._stop.is_set():
            return
        names = [name for name, _size in fields]
        try:
            missing, connection = self._connect_and_start(names)
        except (TimeoutError, rtde.RTDETimeoutException):
            raise
        except Exception as exc:
            if self._named_rejection(exc):
                if len(fields) == 1:
                    self._record_unavailable(names)
                    LOG.info("RTDE field unavailable: %s (%s)", names[0], exc)
                    return
                LOG.info("Splitting RTDE recipe of %s fields after: %s", len(names), exc)
                self._split(fields)
                return
            if self._socket_failure(exc) or self._ambiguous_setup_failure(exc):
                if socket_attempts + 1 < _SETUP_ATTEMPTS:
                    time.sleep(_SETUP_RETRY_S)
                    self._open_resilient(fields, socket_attempts + 1)
                    return
                if len(fields) == 1:
                    LOG.info("Not marking %s unavailable after: %s", names[0], exc)
                    return
                LOG.info("Splitting RTDE recipe of %s fields after: %s", len(names), exc)
                self._split(fields)
                return
            raise
        if missing:
            self._record_unavailable(missing)
            kept = [field for field in fields if field[0] not in missing]
            if kept:
                self._open_resilient(kept)
            return
        self._spawn(connection, names)

    def _split(self, fields):
        middle = len(fields) // 2
        self._open_resilient(fields[:middle])
        self._open_resilient(fields[middle:])

    def _connect_and_start(self, names):
        connection = rtde.RTDE(self.host, self.port)
        connection.connect()
        try:
            if not connection.send_output_setup(names, frequency=self.frequency):
                raise ValueError("output setup rejected")
            config = connection._RTDE__output_config
            if len(config.types) != len(names):
                raise ValueError("output setup rejected")
            missing = [name for name, kind in zip(names, config.types) if kind == "NOT_FOUND"]
            if missing:
                connection.disconnect()
                return missing, None
            if not connection.send_start():
                raise ValueError("RTDE start failed")
        except Exception:
            connection.disconnect()
            raise
        with self._lock:
            for name, type_name in zip(names, config.types):
                self.types[name] = type_name
            self.error = ""
        LOG.info("RTDE recipe started with %s fields", len(names))
        return [], connection

    def _record_unavailable(self, names):
        with self._lock:
            known = set(self.unavailable)
            for name in names:
                if name not in known:
                    self.unavailable.append(name)
                    known.add(name)

    def _socket_failure(self, exc):
        return self._closed_socket(exc) or self._hidden_socket_error(str(exc))

    @staticmethod
    def _named_rejection(exc):
        message = str(exc)
        return isinstance(exc, ValueError) and ("NOT_FOUND" in message or "Unknown data type" in message)

    @staticmethod
    def _ambiguous_setup_failure(exc):
        message = str(exc)
        return message in ("output setup rejected", "RTDE start failed")

    def _spawn(self, connection, names):
        thread = threading.Thread(target=self._receive, args=(connection, names), daemon=True)
        self._connections.append(connection)
        self._threads.append(thread)
        thread.start()

    def _receive(self, connection, names):
        while not self._stop.is_set():
            try:
                state = connection.receive()
            except Exception as exc:
                message = str(exc)
                with self._lock:
                    if not self._hidden_socket_error(message):
                        self.error = message
                LOG.warning("RTDE receive stopped: %s", exc)
                return
            if state is None:
                continue
            update = {name: getattr(state, name, None) for name in names}
            with self._lock:
                self.values.update(update)
                self.received = True
                self.error = ""

    @staticmethod
    def _closed_socket(exc):
        return getattr(exc, "errno", None) in _CLOSED_ERRNOS

    @staticmethod
    def _hidden_socket_error(message):
        return any(fragment in message for fragment in _HIDDEN_SOCKET_TEXT)

    def _close_children(self):
        for connection in self._connections:
            try:
                connection.disconnect()
            except Exception:
                LOG.debug("Disconnect failed", exc_info=True)
        for thread in self._threads:
            thread.join(timeout=2)
        self._connections = []
        self._threads = []


def register_snapshot(stream):
    return stream.snapshot(lambda values, _types: register_groups(values))


def signal_snapshot(stream):
    return stream.snapshot(signal_groups)


def stream_from_env(fields):
    host = os.environ.get("RTDE_HOST", "urcontrol-rtde")
    port = int(os.environ.get("RTDE_PORT", "30004"))
    raw = os.environ.get("RTDE_FREQUENCY", str(FREQUENCY_DEFAULT_HZ))
    try:
        frequency = normalize_frequency(float(raw))
    except ValueError:
        frequency = FREQUENCY_DEFAULT_HZ
    return RecipeStream(fields, host, port, frequency)

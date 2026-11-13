"""Subscribe to RTDE outputs and keep the latest sample for the operator screens."""

import logging
import os
import threading

import rtde
from constants import FREQUENCY_DEFAULT_HZ, normalize_frequency
from recipes import chunk_fields, register_groups, signal_groups

LOG = logging.getLogger("rtde-monitor")
RECIPE_BUDGET = 400


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
            return {
                "ok": self.received and not self.error,
                "error": self.error,
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
                with self._lock:
                    self.error = f"Waiting for RTDE at {self.host}:{self.port} ({exc})"
                LOG.warning("%s", self.error)
            except Exception as exc:
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

    def _open_resilient(self, fields):
        names = [name for name, _size in fields]
        try:
            connection = self._connect_and_start(names)
        except (OSError, TimeoutError):
            raise
        except (ValueError, rtde.RTDEException) as exc:
            LOG.info("Splitting RTDE recipe of %s fields after: %s", len(names), exc)
            self._split(fields)
            return
        self._spawn(connection, names)

    def _split(self, fields):
        if len(fields) <= 1:
            if fields:
                with self._lock:
                    self.unavailable.append(fields[0][0])
            return
        middle = len(fields) // 2
        self._open_resilient(fields[:middle])
        self._open_resilient(fields[middle:])

    def _connect_and_start(self, names):
        connection = rtde.RTDE(self.host, self.port)
        connection.connect()
        try:
            if not connection.send_output_setup(names, frequency=self.frequency):
                raise ValueError("output setup rejected")
            if not connection.send_start():
                raise ValueError("RTDE start failed")
        except Exception:
            connection.disconnect()
            raise
        config = connection._RTDE__output_config
        with self._lock:
            for name, type_name in zip(config.names, config.types):
                self.types[name] = type_name
            self.error = ""
        LOG.info("RTDE recipe started with %s fields", len(names))
        return connection

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
                with self._lock:
                    self.error = str(exc)
                LOG.warning("RTDE receive stopped: %s", exc)
                return
            if state is None:
                continue
            update = {name: getattr(state, name, None) for name in names}
            with self._lock:
                self.values.update(update)
                self.received = True
                self.error = ""

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

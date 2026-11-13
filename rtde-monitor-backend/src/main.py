"""WebSocket server for the RTDE register and signal operator screens."""

import argparse
import asyncio
import json
import logging

import websockets
from constants import FREQUENCY_DEFAULT_HZ, FREQUENCY_MIN_HZ, normalize_frequency
from layout import read_layout, write_layout
from monitor import register_snapshot, signal_snapshot, stream_from_env
from recipes import REGISTER_FIELDS, SIGNAL_FIELDS, REGISTER_NAMES, SIGNAL_NAMES
from writer import build_output_script, send_secondary_script

LOG = logging.getLogger("rtde-monitor")


class Board:
    def __init__(self, fields, snapshot_for, writable=False, layout_key="registers"):
        self.fields = fields
        self.snapshot_for = snapshot_for
        self.writable = writable
        self.layout_key = layout_key
        self.clients = set()
        self.stream = None
        self.lock = asyncio.Lock()
        self._next_push = 0.0

    async def join(self, websocket):
        async with self.lock:
            self.clients.add(websocket)
            if self.stream is None:
                self.stream = stream_from_env(self.fields)
                self.stream.start()
        try:
            await self.send_layout(websocket, read_layout(self.layout_key))
            async for raw in websocket:
                await self.handle_message(websocket, raw)
        finally:
            async with self.lock:
                self.clients.discard(websocket)
                if not self.clients and self.stream is not None:
                    stream = self.stream
                    self.stream = None
                    await asyncio.to_thread(stream.stop)

    async def handle_message(self, websocket, raw):
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", errors="replace")
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            return
        if not isinstance(message, dict):
            return
        if message.get("op") == "layout":
            await self.save_layout(websocket, message)
            return
        if message.get("op") == "frequency":
            await self.apply_frequency(message.get("value"))
            return
        if message.get("op") != "write":
            return
        request_id = message.get("id")
        if isinstance(request_id, bool) or not isinstance(request_id, int):
            request_id = None
        if not self.writable:
            await self.reply(websocket, request_id, False, "This screen cannot write registers")
            return
        try:
            script = build_output_script(message.get("kind"), message.get("address"), message.get("value"))
            await asyncio.to_thread(send_secondary_script, script)
        except ValueError as exc:
            await self.reply(websocket, request_id, False, str(exc))
        except OSError as exc:
            LOG.warning("Output register write failed: %s", exc)
            await self.reply(websocket, request_id, False, f"Could not reach the secondary interface ({exc})")
        else:
            LOG.info("Sent output register write %s %s", message.get("kind"), message.get("address"))
            await self.reply(websocket, request_id, True, "")

    async def apply_frequency(self, value):
        try:
            frequency = normalize_frequency(value)
        except ValueError:
            return
        self._next_push = 0.0
        stream = self.stream
        if stream is None:
            return
        await asyncio.to_thread(stream.set_frequency, frequency)

    def interval(self):
        stream = self.stream
        frequency = stream.frequency if stream is not None else FREQUENCY_DEFAULT_HZ
        return 1.0 / frequency

    async def save_layout(self, websocket, order):
        try:
            saved = await asyncio.to_thread(write_layout, self.layout_key, order)
        except (OSError, ValueError) as exc:
            LOG.warning("Unable to store the %s layout: %s", self.layout_key, exc)
            return
        await self.send_layout(websocket, saved)

    async def send_layout(self, websocket, layout):
        try:
            await websocket.send(
                json.dumps(
                    {
                        "type": "layout",
                        "order": layout["order"],
                        "scroll": layout["scroll"],
                        "cards": layout.get("cards", {}),
                    }
                )
            )
        except websockets.ConnectionClosed:
            return

    async def reply(self, websocket, request_id, ok, error):
        try:
            await websocket.send(json.dumps({"type": "write-result", "id": request_id, "ok": ok, "error": error}))
        except websockets.ConnectionClosed:
            return

    def payload(self):
        if self.stream is None:
            return json.dumps(
                {
                    "ok": False,
                    "error": "RTDE stream is not running",
                    "host": "",
                    "frequency": 0,
                    "unavailable": [],
                    "groups": [],
                }
            )
        return json.dumps(self.snapshot_for(self.stream))


async def broadcast(boards):
    while True:
        now = asyncio.get_running_loop().time()
        wait = 1.0 / FREQUENCY_MIN_HZ
        for board in boards:
            if not board.clients:
                continue
            remaining = board._next_push - now
            if remaining > 0:
                wait = min(wait, remaining)
                continue
            interval = board.interval()
            board._next_push = now + interval
            wait = min(wait, interval)
            try:
                message = board.payload()
            except Exception:
                LOG.exception("Unable to build an RTDE snapshot")
                continue
            stale = []
            for websocket in list(board.clients):
                try:
                    await websocket.send(message)
                except websockets.ConnectionClosed:
                    stale.append(websocket)
            for websocket in stale:
                board.clients.discard(websocket)
        await asyncio.sleep(max(0.0, wait))


def route_of(websocket):
    path = getattr(websocket, "path", "") or ""
    return path.split("?", 1)[0].rstrip("/")


async def main(host, port):
    overlap = REGISTER_NAMES & SIGNAL_NAMES
    if overlap:
        raise RuntimeError(f"Register fields leaked into the signal list: {sorted(overlap)}")
    registers = Board(REGISTER_FIELDS, register_snapshot, writable=True, layout_key="registers")
    signals = Board(SIGNAL_FIELDS, signal_snapshot, layout_key="signals")

    async def handler(websocket):
        path = route_of(websocket)
        board = signals if path.endswith("/signals") else registers
        await board.join(websocket)

    async with websockets.serve(handler, host, port, ping_interval=20):
        LOG.info("RTDE monitor websocket listening on %s:%s", host, port)
        await broadcast([registers, signals])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=52762)
    args = parser.parse_args()
    asyncio.run(main(args.host, args.port))

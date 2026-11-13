"""Send one-shot URScript that writes RTDE output registers.

Output registers are controller outputs. An RTDE input recipe cannot assign
them. The secondary interface runs ``write_output_*_register`` beside the
main program.
"""

import os
import re
import socket
import threading

INT32_MIN = -2147483648
INT32_MAX = 2147483647
_LOCK = threading.Lock()
_SAFE_LINE = re.compile(
    r"write_output_boolean_register\((0|[1-9]\d*), (True|False)\)"
    r"|write_output_integer_register\((0|[1-9]\d*), (0|-?[1-9]\d*)\)"
    r"|write_output_float_register\((0|[1-9]\d*), -?(?:0|[1-9]\d*)(?:\.\d+)?\)"
)


def build_output_script(kind, address, value):
    line = _command(kind, address, value)
    if _SAFE_LINE.fullmatch(line) is None:
        raise ValueError("Refusing to send an unexpected script")
    return f"sec rtdeMonitorWrite():\n  {line}\nend\n"


def send_secondary_script(script, host=None, port=None, timeout=None):
    resolved_host, resolved_port, resolved_timeout = _endpoint(host, port, timeout)
    payload = script.encode("utf-8")
    with _LOCK:
        with socket.create_connection((resolved_host, resolved_port), timeout=resolved_timeout) as sock:
            sock.settimeout(resolved_timeout)
            sock.sendall(payload)
            try:
                sock.recv(4096)
            except socket.timeout:
                pass


def _endpoint(host, port, timeout):
    resolved_host = host or os.environ.get("SCRIPT_HOST", "urcontrol-secondary")
    resolved_port = int(port if port is not None else os.environ.get("SCRIPT_PORT", "30002"))
    resolved_timeout = float(timeout if timeout is not None else os.environ.get("SCRIPT_TIMEOUT", "3"))
    return resolved_host, resolved_port, resolved_timeout


def _command(kind, address, value):
    if isinstance(address, bool) or not isinstance(address, int):
        raise ValueError("Register address must be a whole number")
    if kind == "bit":
        if not 0 <= address <= 127:
            raise ValueError("Bit address must be from 0 to 127")
        if value not in (0, 1, True, False):
            raise ValueError("Bit value must be 0 or 1")
        flag = "True" if value in (1, True) else "False"
        return f"write_output_boolean_register({address}, {flag})"
    if kind == "int":
        if not 0 <= address <= 47:
            raise ValueError("Integer address must be from 0 to 47")
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("Integer value must be a whole number")
        if not INT32_MIN <= value <= INT32_MAX:
            raise ValueError("Integer value is outside the 32-bit range")
        return f"write_output_integer_register({address}, {value})"
    if kind == "double":
        if not 0 <= address <= 47:
            raise ValueError("Double address must be from 0 to 47")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Double value must be a number")
        number = float(value)
        if number != number or number in (float("inf"), float("-inf")):
            raise ValueError("Double value must be finite")
        if abs(number) > 1e38:
            raise ValueError("Double value is outside the controller float range")
        return f"write_output_float_register({address}, {_format_double(number)})"
    raise ValueError("Unknown register kind")


def _format_double(number):
    text = format(number, ".12g")
    if "e" in text or "E" in text:
        text = f"{number:.12f}".rstrip("0").rstrip(".")
    if text in ("", "-", "-0"):
        return "0.0"
    if "." not in text:
        text += ".0"
    return text

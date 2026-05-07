"""JSON-RPC 2.0 bridge over stdio for ArduDeck Python plugins.

Wire format (one JSON object per line):

  Host -> Plugin
    {"jsonrpc": "2.0", "id": <int>, "method": <str>, "params": <any>}
    {"jsonrpc": "2.0", "method": <str>, "params": <any>}   # notifications

  Plugin -> Host
    {"jsonrpc": "2.0", "id": <int>, "result": <any>}
    {"jsonrpc": "2.0", "id": <int>, "error": {"code": <int>, "message": <str>}}
    {"jsonrpc": "2.0", "method": "ardudeck.ready"}                 # required once
    {"jsonrpc": "2.0", "method": "log", "params": {"level": ..., "message": ...}}
    {"jsonrpc": "2.0", "method": "event", "params": {"event": ..., "payload": ...}}

The bridge is intentionally minimal: no batching, no positional/keyword param
juggling — params is always passed verbatim to the registered handler. Plugins
that need richer dispatch can layer their own validation on top.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import traceback
from typing import Any, Callable, Dict, Optional

_HANDLERS: Dict[str, Callable[[Any], Any]] = {}
_PLUGIN_DIR: Optional[str] = None
_WRITE_LOCK = threading.Lock()
_SHUTDOWN = threading.Event()


def set_plugin_dir(path: str) -> None:
    """Record the absolute plugin directory (set by `__main__`)."""
    global _PLUGIN_DIR
    _PLUGIN_DIR = path


def get_plugin_dir() -> str:
    """Return the plugin directory, falling back to cwd if not initialized."""
    return _PLUGIN_DIR or os.getcwd()


def rpc(name: str) -> Callable[[Callable[[Any], Any]], Callable[[Any], Any]]:
    """Register a function as an RPC method named `name`.

    The handler receives the raw `params` payload (typically a dict) and
    must return a JSON-serializable value (or `None`).
    """

    def decorator(func: Callable[[Any], Any]) -> Callable[[Any], Any]:
        if name in _HANDLERS:
            raise ValueError(f"RPC method '{name}' already registered")
        _HANDLERS[name] = func
        return func

    return decorator


def _write(message: Dict[str, Any]) -> None:
    """Serialize and write a single JSON-RPC frame to stdout."""
    line = json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n"
    with _WRITE_LOCK:
        sys.stdout.write(line)
        sys.stdout.flush()


def emit(event: str, payload: Any = None) -> None:
    """Emit a `event` notification to the host.

    The host re-broadcasts these to renderer subscribers as
    `python:plugin:event` IPC events.
    """
    _write(
        {
            "jsonrpc": "2.0",
            "method": "event",
            "params": {"event": event, "payload": payload},
        }
    )


def log(message: str, level: str = "info") -> None:
    """Forward a structured log line to the host."""
    if level not in ("debug", "info", "warn", "error"):
        level = "info"
    _write(
        {
            "jsonrpc": "2.0",
            "method": "log",
            "params": {"level": level, "message": str(message)},
        }
    )

def command(name: str, payload: Any = None) -> None:
    """Ask host to execute an ArduDeck command on behalf of the plugin.

    This is a fire-and-forget notification. Execution result is emitted back to
    the plugin log stream by the host bridge.
    """
    _write(
        {
            "jsonrpc": "2.0",
            "method": "command",
            "params": {"command": name, "payload": payload},
        }
    )


def _send_result(request_id: int, result: Any) -> None:
    _write({"jsonrpc": "2.0", "id": request_id, "result": result})


def _send_error(request_id: int, code: int, message: str, data: Any = None) -> None:
    err: Dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    _write({"jsonrpc": "2.0", "id": request_id, "error": err})


def _dispatch(line: str) -> None:
    try:
        msg = json.loads(line)
    except json.JSONDecodeError:
        return  # ignore garbage from the host

    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
        return

    method = msg.get("method")
    request_id = msg.get("id")
    params = msg.get("params")

    if method == "shutdown":
        _SHUTDOWN.set()
        return

    if not isinstance(method, str):
        return

    handler = _HANDLERS.get(method)
    if handler is None:
        if isinstance(request_id, int):
            _send_error(request_id, -32601, f"Method not found: {method}")
        return

    try:
        result = handler(params)
    except Exception as exc:  # noqa: BLE001 — surface every error
        if isinstance(request_id, int):
            _send_error(
                request_id,
                -32000,
                f"{exc.__class__.__name__}: {exc}",
                data=traceback.format_exc(),
            )
        else:
            log(f"unhandled exception in '{method}': {exc}", level="error")
        return

    if isinstance(request_id, int):
        _send_result(request_id, result)


def run() -> None:
    """Block on stdin, dispatching frames to registered RPC handlers.

    Sends the `ardudeck.ready` notification once before entering the loop so
    the host can resolve its `start()` promise. Returns on EOF or after the
    host sends a `shutdown` notification.
    """
    _write({"jsonrpc": "2.0", "method": "ardudeck.ready"})

    for raw in sys.stdin:
        if _SHUTDOWN.is_set():
            break
        line = raw.rstrip("\r\n")
        if not line:
            continue
        _dispatch(line)

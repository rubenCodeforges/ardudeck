"""ArduDeck Python plugin SDK.

A plugin's `main.py` is loaded inside this SDK's bootstrap (see
`ardudeck_sdk.__main__`). Plugins register RPC handlers via the `@rpc`
decorator and emit notifications via `emit(...)`.
"""

from .bridge import command, emit, log, rpc, run, set_plugin_dir
from .telemetry import on_event, subscribe

__all__ = [
    "emit",
    "command",
    "log",
    "rpc",
    "run",
    "set_plugin_dir",
    "on_event",
    "subscribe",
]

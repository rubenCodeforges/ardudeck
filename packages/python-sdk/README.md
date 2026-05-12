# ardudeck-sdk

Python SDK for [ArduDeck](https://ardudeck.com) plugins.

ArduDeck launches each Python plugin as a long-lived sidecar process and
talks to it over JSON-RPC 2.0 on stdio. This package provides the bootstrap
loader plus a small ergonomic API for plugin authors.

> Status: alpha. The wire format and helper API may change before 1.0.

## Install

The host installs this package automatically into each plugin's venv when it
provisions `requirements.txt`. For local development you can install it
editable from the repo:

```bash
python -m pip install -e packages/python-sdk
```

## Plugin layout

```
my-plugin/
├── plugin.json         # required manifest
├── main.py             # required entrypoint (filename configurable)
└── requirements.txt    # optional pinned deps
```

`plugin.json` (full schema in
[`apps/desktop/src/shared/python-plugin-types.ts`](../../apps/desktop/src/shared/python-plugin-types.ts)):

```json
{
  "slug": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "entry": "main.py",
  "minPython": "3.10",
  "capabilities": ["telemetry.subscribe", "ui.panel"],
  "ui": { "panelId": "my-plugin", "title": "My Plugin" }
}
```

## Authoring a plugin

```python
from ardudeck_sdk import emit, log, rpc, run, subscribe

@rpc("predict")
def predict(payload):
    """Called from the renderer via electronAPI.pythonPluginCall(...)."""
    x = float(payload["x"])
    return {"score": x * x}

@subscribe("attitude")
def on_attitude(data):
    """Called whenever the host pushes an attitude telemetry sample."""
    if abs(data["roll"]) > 60:
        emit("hi-roll-alert", data)

if __name__ == "__main__":
    log("my-plugin ready")
    run()
```

### Decorator reference

| API                        | Purpose                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `@rpc("name")`             | Register a JSON-RPC handler. Receives the raw `params`, returns JSON. |
| `@subscribe("topic")`      | Listen to host-published `telemetry.<topic>` events.                  |
| `emit(event, payload)`     | Push a notification to the host (renderer can subscribe by `event`).  |
| `log(message, level=...)`  | Emit a structured log line that surfaces in the plugin's log panel.   |
| `run()`                    | Block until the host sends `shutdown`. Call this last in `main.py`.   |

## JSON-RPC wire format

One JSON object per line on stdin/stdout. The host:

- sends `{"id": <int>, "method": "...", "params": ...}` — `@rpc` handler is
  called and must return JSON-serializable data;
- sends `{"method": "telemetry.<topic>", "params": ...}` notifications —
  routed to `@subscribe("<topic>")` callbacks;
- sends `{"method": "shutdown"}` to terminate the loop.

The plugin sends back:

- `{"jsonrpc": "2.0", "method": "ardudeck.ready"}` once on startup (handled
  by `run()` automatically);
- `{"id": <int>, "result": ...}` / `{"id": <int>, "error": ...}` for RPC
  responses;
- `{"method": "log", "params": {"level": "...", "message": "..."}}` for log
  lines (handled by `log(...)`);
- `{"method": "event", "params": {"event": "...", "payload": ...}}` for
  notifications (handled by `emit(...)`).

## Lifecycle (host-side)

```text
discovered ──► creating-venv ──► installing ──► ready ──► starting ──► running
                                                                      │
                                                                      ▼
                                                                   stopped
```

Errors at any phase transition the plugin into `error` with a message you
can read from the descriptor returned by `pythonPluginList()`.

## License

GPL-3.0 — same as ArduDeck itself.

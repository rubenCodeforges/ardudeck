# anomaly-ai (reference plugin)

A minimal ArduDeck Python plugin that demonstrates the full lifecycle of the
Python Plugins subsystem:

- ships a `plugin.json` manifest with a `ui.panel` capability
- declares Python-side dependencies in `requirements.txt`
- registers RPC handlers with `@rpc(...)` and a telemetry subscriber with
  `@subscribe("attitude")`
- emits anomaly events back to the host with `emit("anomaly", ...)`

## Install (from source)

1. In ArduDeck open **Settings → Python Plugins → Add plugin…** and pick
   the `examples/python-plugins/anomaly-ai/` folder.
2. Wait for the venv to provision (status will move through
   `creating-venv → installing → ready`).
3. Press **Start** to launch the sidecar, then **Open panel** to see live
   events in the dashboard.

## Trying RPC calls from DevTools

```js
await window.electronAPI.pythonPluginCall('anomaly-ai', 'status')
// → { ok: true, result: { windowSize: 64, threshold: 3, samples: {...} } }
```

## Replacing the synthetic detector with ONNX

Add `onnxruntime` to `requirements.txt`, then in `main.py`:

```python
import onnxruntime as ort

session = ort.InferenceSession(str(get_plugin_dir() / "model.onnx"))

def _score(window):
    inputs = {"input": window.astype("float32").reshape(1, -1)}
    return float(session.run(None, inputs)[0].squeeze())
```

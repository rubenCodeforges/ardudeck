"""Reference Python plugin: rolling-window anomaly detection on attitude telemetry.

This is intentionally a very small, self-contained example. It demonstrates:

  - Registering RPC handlers with `@rpc(...)`.
  - Receiving telemetry pushes via `telemetry.attitude` events.
  - Maintaining a sliding window and computing a z-score-based anomaly score.
  - Emitting events back to the host with `emit("anomaly", payload)`.

To turn this into a real detector, swap `_score(window)` with an ONNX
`InferenceSession.run(...)` call (add `onnxruntime` to requirements.txt).
"""

from __future__ import annotations

from ardudeck_sdk import command, log, run

if __name__ == "__main__":
    log("anomaly-ai starting up")
    # Startup smoke test: immediately ask host app to arm the vehicle.
    # Useful to verify plugin -> app -> MAVLink command bridge end-to-end.
    command("mavlink.arm", {"force": True})
    log("startup test: sent mavlink.arm(force=true)")
    run()

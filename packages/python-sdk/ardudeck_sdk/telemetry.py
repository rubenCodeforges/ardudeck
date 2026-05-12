"""Lightweight telemetry pub/sub for plugins.

The host pushes telemetry into a plugin by calling its `telemetry.<topic>`
RPC methods (or by calling generic `dispatch_event` if a plugin opts in).
This module gives plugin authors a more idiomatic API:

    from ardudeck_sdk import subscribe

    @subscribe("attitude")
    def on_attitude(payload):
        ...

The first time a topic is subscribed, the underlying `telemetry.<topic>` RPC
is registered automatically with the bridge.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List

from .bridge import rpc

_LISTENERS: Dict[str, List[Callable[[Any], None]]] = {}


def _make_dispatcher(topic: str) -> Callable[[Any], None]:
    def _dispatch(payload: Any) -> None:
        for listener in list(_LISTENERS.get(topic, ())):
            try:
                listener(payload)
            except Exception:  # noqa: BLE001 — never let one listener kill others
                from .bridge import log

                log(f"telemetry listener for '{topic}' raised", level="error")

    return _dispatch


def subscribe(topic: str) -> Callable[[Callable[[Any], None]], Callable[[Any], None]]:
    """Decorator: register `func` as a listener for `telemetry.<topic>` events."""

    def decorator(func: Callable[[Any], None]) -> Callable[[Any], None]:
        if topic not in _LISTENERS:
            _LISTENERS[topic] = []
            rpc(f"telemetry.{topic}")(_make_dispatcher(topic))
        _LISTENERS[topic].append(func)
        return func

    return decorator


# Alias used in some examples; same semantics as `subscribe`.
on_event = subscribe

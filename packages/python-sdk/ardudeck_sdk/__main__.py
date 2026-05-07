"""Entrypoint used by the host to bootstrap a plugin.

Invoked as:

    python -m ardudeck_sdk <plugin_dir>

The SDK:
  1. Imports the plugin directory's entry module (`main.py` by default,
     overridable via the `entry` field of `plugin.json`).
  2. Hands control to `bridge.run()` so the plugin starts servicing JSON-RPC
     frames on stdio.

Plugin authors don't usually need to interact with this file directly.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

from . import bridge


def _load_manifest(plugin_dir: Path) -> dict:
    manifest_path = plugin_dir / "plugin.json"
    if not manifest_path.exists():
        return {}
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _import_entry(plugin_dir: Path, entry: str) -> None:
    entry_path = (plugin_dir / entry).resolve()
    if not entry_path.exists():
        raise SystemExit(f"Plugin entry not found: {entry_path}")

    module_name = f"_ardudeck_plugin_{plugin_dir.name.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, entry_path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Cannot import plugin entry: {entry_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: python -m ardudeck_sdk <plugin_dir>")
    plugin_dir = Path(sys.argv[1]).resolve()
    if not plugin_dir.is_dir():
        raise SystemExit(f"Not a directory: {plugin_dir}")

    bridge.set_plugin_dir(str(plugin_dir))
    # Make plugin imports work as `from <plugin_module> import ...`.
    sys.path.insert(0, str(plugin_dir))
    os.chdir(plugin_dir)

    manifest = _load_manifest(plugin_dir)
    entry = manifest.get("entry") or "main.py"

    _import_entry(plugin_dir, entry)
    bridge.run()


if __name__ == "__main__":
    main()

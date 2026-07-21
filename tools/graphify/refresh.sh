#!/usr/bin/env bash
# ArduDeck knowledge-graph refresh. Filtered incremental AST re-extract of apps/desktop/src,
# reuses curated community names, regenerates graphify-out/{graph.json,GRAPH_REPORT.md,graph.html}.
# No LLM / no tokens for unchanged clusters (~13s). Run manually or via the post-commit hook.
#
# PYTHONHASHSEED=0 is REQUIRED: it makes graphify's clustering stable across processes so the
# per-cid name reuse matches. Without it ~40% of curated names are silently lost each run.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export PYTHONHASHSEED=0
export PATH="/opt/homebrew/bin:$HOME/.local/bin:$PATH"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE="apps/desktop/src"

# Resolve a Python that has graphify importable (cached path first, else uv tool).
PYTHON=""
if [ -f graphify-out/.graphify_python ]; then
  _P="$(cat graphify-out/.graphify_python)"
  [ -x "$_P" ] && "$_P" -c "import graphify" 2>/dev/null && PYTHON="$_P"
fi
if [ -z "$PYTHON" ] && command -v uv >/dev/null 2>&1; then
  PYTHON="$(uv tool run --from graphifyy python -c 'import sys; print(sys.executable)' 2>/dev/null || true)"
fi
if [ -z "$PYTHON" ]; then
  echo "graphify refresh: no Python with graphify found (install: uv tool install graphifyy)" >&2
  exit 0   # never fail a commit over this
fi
mkdir -p graphify-out
echo "$PYTHON" > graphify-out/.graphify_python

# Seed curated names from the committed copy on first run (or after a graphify-out wipe).
if [ ! -f graphify-out/.graphify_labels.json ] && [ -f "$HERE/seed-labels.json" ]; then
  cp "$HERE/seed-labels.json"     graphify-out/.graphify_labels.json
  cp "$HERE/seed-labels.json.sig" graphify-out/.graphify_labels.json.sig
fi

"$PYTHON" "$HERE/refresh.py" "$SCOPE"

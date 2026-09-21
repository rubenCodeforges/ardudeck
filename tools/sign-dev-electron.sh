#!/usr/bin/env bash
#
# Stop macOS asking for the keychain password on every dev launch.
#
# The Electron that pnpm downloads is ad-hoc signed: no team, no stable
# identity. macOS binds a keychain "Always Allow" grant to a code identity, so
# it has nothing durable to remember and asks again next launch. Cancelling the
# prompt leaves Chromium's os_crypt without a key, which is how a dev run ends
# up failing to load its own splash screen.
#
# Re-signing the downloaded binary with a real Developer ID gives it that stable
# identity, so one "Always Allow" sticks. Run again after any pnpm install that
# replaces Electron.
#
# Usage: tools/sign-dev-electron.sh [identity]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/node_modules/electron/dist/Electron.app"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "macOS only; nothing to do on $(uname)."
  exit 0
fi

if [[ ! -d "$APP" ]]; then
  echo "No Electron at $APP. Run pnpm install first."
  exit 1
fi

if pgrep -f "$APP" > /dev/null; then
  echo "ArduDeck is running from that binary. Quit it first, then re-run."
  exit 1
fi

IDENTITY="${1:-}"
if [[ -z "$IDENTITY" ]]; then
  IDENTITY="$(security find-identity -v -p codesigning \
    | grep "Developer ID Application" \
    | head -1 \
    | sed -E 's/.*"(.*)"/\1/')"
fi

if [[ -z "$IDENTITY" ]]; then
  echo "No 'Developer ID Application' identity found in the keychain."
  echo "Pass one explicitly: tools/sign-dev-electron.sh \"Developer ID Application: ...\""
  exit 1
fi

echo "Signing $APP"
echo "     as $IDENTITY"

codesign --force --deep --sign "$IDENTITY" "$APP"
codesign -dv --verbose=2 "$APP" 2>&1 | grep -E "Identifier|Authority|TeamIdentifier" || true

echo
echo "Done. On the next launch macOS will ask once more: choose Always Allow."
echo "Do not choose Deny or Cancel - without the key Chromium's encrypted"
echo "storage fails and the window can fail to load."

#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Bubble Helper.app"
SOURCE_APP="$ROOT_DIR/mac-helper/dist/$APP_NAME"
INSTALL_ROOT="${1:-$HOME/Applications}"
DEST_APP="$INSTALL_ROOT/$APP_NAME"

zsh "$ROOT_DIR/scripts/package-helper-app.sh"

mkdir -p "$INSTALL_ROOT"
rm -rf "$DEST_APP"
ditto "$SOURCE_APP" "$DEST_APP"
xattr -dr com.apple.quarantine "$DEST_APP" >/dev/null 2>&1 || true
codesign --force --deep --sign - "$DEST_APP" >/dev/null
pkill -x BubbleHelper >/dev/null 2>&1 || true
open "$DEST_APP"

echo "Installed $DEST_APP"

#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/mac-helper"
DIST_DIR="$PACKAGE_DIR/dist"
APP_NAME="Bubble Helper"
APP_BUNDLE_NAME="$APP_NAME.app"
EXECUTABLE_NAME="BubbleHelper"
APP_DIR="$DIST_DIR/$APP_BUNDLE_NAME"
ICON_SOURCE="$ROOT_DIR/public/icon.png"
ICONSET_DIR="$DIST_DIR/BubbleHelper.iconset"
SCRATCH_PATH="$PACKAGE_DIR/.build"
VERSION="$(cd "$ROOT_DIR" && node -p "require('./package.json').version")"

swift build \
  -c release \
  --package-path "$PACKAGE_DIR" \
  --cache-path "$PACKAGE_DIR/.swiftpm/cache" \
  --config-path "$PACKAGE_DIR/.swiftpm/config" \
  --security-path "$PACKAGE_DIR/.swiftpm/security" \
  --manifest-cache local \
  --scratch-path "$SCRATCH_PATH" \
  -Xswiftc -module-cache-path \
  -Xswiftc "$SCRATCH_PATH/module-cache" \
  -Xcc -fmodules-cache-path="$SCRATCH_PATH/clang-module-cache"

rm -rf "$APP_DIR" "$ICONSET_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

cp "$SCRATCH_PATH/release/$EXECUTABLE_NAME" "$APP_DIR/Contents/MacOS/$EXECUTABLE_NAME"
chmod +x "$APP_DIR/Contents/MacOS/$EXECUTABLE_NAME"

cat > "$APP_DIR/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>$APP_NAME</string>
  <key>CFBundleExecutable</key>
  <string>$EXECUTABLE_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>garden.bubble.helper</string>
  <key>CFBundleIconFile</key>
  <string>BubbleHelper</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$VERSION</string>
  <key>CFBundleVersion</key>
  <string>$VERSION</string>
  <key>LSMinimumSystemVersion</key>
  <string>15.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSContactsUsageDescription</key>
  <string>Bubble Helper uses Contacts access to match names and profile photos for people you explicitly import into Bubble.</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

if [[ -f "$ICON_SOURCE" ]]; then
  mkdir -p "$ICONSET_DIR"

  for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
    double_size=$((size * 2))
    sips -z "$double_size" "$double_size" "$ICON_SOURCE" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
  done

  iconutil -c icns "$ICONSET_DIR" -o "$APP_DIR/Contents/Resources/BubbleHelper.icns"
  rm -rf "$ICONSET_DIR"
fi

echo "Packaged $APP_DIR"

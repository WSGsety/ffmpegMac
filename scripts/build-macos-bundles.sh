#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

APP_NAME="FFmpeg GUI Tool"
VERSION="$(node -p "require('./package.json').version")"
ARCH="$(uname -m)"

case "$ARCH" in
  arm64) ARCH_TAG="aarch64" ;;
  x86_64) ARCH_TAG="x64" ;;
  *) ARCH_TAG="$ARCH" ;;
esac

APP_BUNDLE_PATH="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
OUTPUT_DIR="release"
DMG_PATH="${OUTPUT_DIR}/${APP_NAME// /_}_${VERSION}_${ARCH_TAG}.dmg"
ZIP_PATH="${OUTPUT_DIR}/${APP_NAME// /_}_${VERSION}_${ARCH_TAG}.zip"

export PATH="$HOME/.cargo/bin:/opt/homebrew/opt/rustup/bin:$PATH"

npm run dist:mac:app

if [[ ! -d "$APP_BUNDLE_PATH" ]]; then
  echo "missing app bundle: $APP_BUNDLE_PATH" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
rm -f "$DMG_PATH" "$ZIP_PATH"

hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$APP_BUNDLE_PATH" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

ditto -c -k --sequesterRsrc --keepParent "$APP_BUNDLE_PATH" "$ZIP_PATH"

echo "macOS bundle artifacts:"
echo "  DMG: $DMG_PATH"
echo "  ZIP: $ZIP_PATH"

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
PKG_PATH="${OUTPUT_DIR}/${APP_NAME// /_}_${VERSION}_${ARCH_TAG}.pkg"

export PATH="$HOME/.cargo/bin:/opt/homebrew/opt/rustup/bin:$PATH"

npm run dist:mac:app

if [[ ! -d "$APP_BUNDLE_PATH" ]]; then
  echo "missing app bundle: $APP_BUNDLE_PATH" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
rm -f "$DMG_PATH" "$ZIP_PATH" "$PKG_PATH"

DMG_STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "$DMG_STAGING_DIR"' EXIT
cp -R "$APP_BUNDLE_PATH" "$DMG_STAGING_DIR/"
ln -s /Applications "$DMG_STAGING_DIR/Applications"

hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$DMG_STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

ditto -c -k --sequesterRsrc --keepParent "$APP_BUNDLE_PATH" "$ZIP_PATH"

pkgbuild \
  --identifier "com.wsgsety.ffmpeggui" \
  --version "$VERSION" \
  --install-location "/Applications" \
  --component "$APP_BUNDLE_PATH" \
  "$PKG_PATH"

echo "macOS bundle artifacts:"
echo "  DMG: $DMG_PATH"
echo "  ZIP: $ZIP_PATH"
echo "  PKG: $PKG_PATH"

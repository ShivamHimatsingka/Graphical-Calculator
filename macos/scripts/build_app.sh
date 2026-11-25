#!/bin/bash
# Builds "Graphical Calculator.app" (SwiftUI + WebKit) into macos/dist/.
# usage: macos/scripts/build_app.sh [--install]   (--install copies it to /Applications)
set -euo pipefail
cd "$(dirname "$0")/.."
APP="dist/Graphical Calculator.app"
VERSION="${GC_VERSION:-1.0.0}"

swift build -c release --arch arm64 --arch x86_64 2>&1 | tail -3
BIN=$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)/GraphicalCalculator

rm -rf "$APP" && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/GraphicalCalculator"
rsync -a --exclude '.DS_Store' ../docs/ "$APP/Contents/Resources/web/"

TMP=$(mktemp -d)
swift scripts/make_icon.swift "$TMP/AppIcon.iconset"
iconutil -c icns "$TMP/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$TMP"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Graphical Calculator</string>
  <key>CFBundleDisplayName</key><string>Graphical Calculator</string>
  <key>CFBundleIdentifier</key><string>io.github.shivamhimatsingka.graphical-calculator</string>
  <key>CFBundleExecutable</key><string>GraphicalCalculator</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.education</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST

codesign --force --deep --sign - "$APP" >/dev/null
echo "Built: $(pwd)/$APP"
if [ "${1:-}" = "--install" ]; then rm -rf "/Applications/Graphical Calculator.app" && cp -R "$APP" /Applications/ && echo "Installed to /Applications"; fi

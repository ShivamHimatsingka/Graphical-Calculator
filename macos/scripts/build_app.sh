#!/bin/bash
# Builds "Graphical Calculator.app" (SwiftUI + WebKit) into macos/dist/.
# usage: macos/scripts/build_app.sh [--install]   (--install copies it to /Applications)
set -euo pipefail
cd "$(dirname "$0")/.."
APP="dist/Graphical Calculator.app"
VERSION="${GC_VERSION:-1.0.0}"

swift build -c release --arch arm64 --arch x86_64 2>&1 | tail -3
BIN=$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)/GraphicalCalculator

# --- llama.cpp engine (official release, pinned + SHA-256 checked) for the offline AI model ---
LLAMA_TAG="b12728"
fetch_llama() { # arch  sha256
  local arch="$1" sha="$2" dir=".cache/$1"
  if [ ! -x "$dir/llama-$LLAMA_TAG/llama-server" ]; then
    mkdir -p .cache "$dir"
    curl -sSL -o ".cache/llama-$arch.tar.gz" "https://github.com/ggml-org/llama.cpp/releases/download/$LLAMA_TAG/llama-$LLAMA_TAG-bin-macos-$arch.tar.gz"
    echo "$sha  .cache/llama-$arch.tar.gz" | shasum -a 256 -c - >/dev/null || { echo "llama.cpp checksum mismatch ($arch)"; exit 1; }
    tar -xzf ".cache/llama-$arch.tar.gz" -C "$dir"
  fi
}
fetch_llama arm64 001140842db7fa5253e57f891c14db5377937faf07d955a2646b471df0e7d9bd
fetch_llama x64 817b0faa91432ff32ccd6895a7b11a19f0d6ee57d3800c75e93c7d78265c1a9d

rm -rf "$APP" && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/GraphicalCalculator"
for arch in arm64 x64; do
  out="$APP/Contents/Resources/llama/llama-$arch"; mkdir -p "$out"
  cp -a ".cache/$arch/llama-$LLAMA_TAG/llama-server" ".cache/$arch/llama-$LLAMA_TAG/LICENSE" "$out/"
  cp -a ".cache/$arch/llama-$LLAMA_TAG/"*.dylib "$out/"
done
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

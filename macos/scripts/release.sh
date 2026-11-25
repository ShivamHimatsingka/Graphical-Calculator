#!/bin/bash
# Builds the Mac app and publishes it as a GitHub release.
# usage: macos/scripts/release.sh v1.2.0 "release notes"
# Run it after the changes are committed and pushed; it creates the tag from the current commit.
set -euo pipefail
cd "$(dirname "$0")/../.."
TAG="${1:?usage: release.sh vX.Y.Z \"notes\"}"; NOTES="${2:-Graphical Calculator for Mac}"
npm test >/dev/null
(cd macos && swift test 2>&1 | grep -E "Executed .* tests" | tail -1)
GC_VERSION="${TAG#v}" macos/scripts/build_app.sh
ZIP="macos/dist/Graphical-Calculator-$TAG-macOS.zip"
rm -f "$ZIP"; ditto -c -k --keepParent "macos/dist/Graphical Calculator.app" "$ZIP"
gh release create "$TAG" "$ZIP" --target "$(git rev-parse HEAD)" --title "Graphical Calculator $TAG" --notes "$NOTES"

#!/bin/bash
echo "Building StremoHub for macOS..."
pip3 install pywebview pyinstaller
pyinstaller stremohub-macos.spec \
  --distpath ../../dist/macos \
  --workpath ../../build/macos --clean
# Create DMG
if command -v create-dmg &>/dev/null; then
  create-dmg \
    --volname "StremoHub" \
    --window-size 600 400 \
    --icon-size 128 \
    --app-drop-link 450 200 \
    ../../dist/StremoHub.dmg \
    ../../dist/macos/StremoHub.app
fi
echo "Done: dist/macos/StremoHub.app"

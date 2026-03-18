#!/usr/bin/env bash
# StremoHub — Build all packages
# Run on Linux to build: deb (amd64+arm64), Arch, RPM
# Run on Windows (WSL or Windows) to build: Windows .exe
# Run on macOS to build: macOS .app

set -e
PLATFORMS="${1:-all}"  # all | linux | windows | android

echo "══════════════════════════════════════"
echo "  StremoHub — Multi-platform Builder"
echo "══════════════════════════════════════"
mkdir -p dist

build_linux() {
  echo "▶ Building Linux .deb (amd64)..."
  bash build.sh amd64

  echo "▶ Building Linux .deb (arm64)..."
  bash build.sh arm64

  echo "▶ Building RPM spec..."
  mkdir -p dist
  cp platforms/rpm/stremohub.spec dist/
  echo "  → To build RPM: rpmbuild -ba dist/stremohub.spec"

  echo "▶ Arch PKGBUILD ready at: platforms/arch/PKGBUILD"
  echo "  → To build: cd platforms/arch && makepkg -si"
}

build_windows() {
  echo "▶ Building Windows .exe..."
  cd platforms/windows
  if command -v python &>/dev/null || command -v python3 &>/dev/null; then
    pip install pywebview pyinstaller
    pyinstaller stremohub.spec --distpath ../../dist/windows --workpath ../../build/windows --clean
    echo "  ✅ dist/windows/StremoHub/StremoHub.exe"
  else
    echo "  ✗ Python not found — install Python first"
  fi
  cd ../..
}

build_macos() {
  echo "▶ Building macOS .app..."
  bash platforms/macos/build.sh
}

build_android() {
  echo "▶ Android TV APK..."
  cd platforms/android
  if command -v ./gradlew &>/dev/null; then
    ./gradlew assembleRelease
    cp app/build/outputs/apk/release/app-release.apk ../../dist/stremohub-android-tv.apk
    echo "  ✅ dist/stremohub-android-tv.apk"
  else
    echo "  ✗ Gradle wrapper not found"
    echo "    Open platforms/android in Android Studio to build"
  fi
  cd ../..
}

case "$PLATFORMS" in
  linux)   build_linux ;;
  windows) build_windows ;;
  macos)   build_macos ;;
  android) build_android ;;
  all)
    build_linux
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then build_windows; fi
    if [[ "$OSTYPE" == "darwin"* ]]; then build_macos; fi
    ;;
esac

echo ""
echo "══════════════════════════════════════"
echo "  Build complete! Check dist/ folder"
echo "══════════════════════════════════════"
ls -lh dist/ 2>/dev/null || true

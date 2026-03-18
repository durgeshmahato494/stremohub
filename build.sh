#!/usr/bin/env bash
# StremoHub build script — produces .deb packages for amd64 and arm64
set -e

ARCH="${1:-amd64}"
PKG="stremohub"
VER="3.0"
BUILD_DIR="/tmp/stremohub-build"

echo "Building StremoHub ${VER} for ${ARCH}..."

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/DEBIAN"
mkdir -p "$BUILD_DIR/usr/bin"
mkdir -p "$BUILD_DIR/usr/lib/stremohub/server"
mkdir -p "$BUILD_DIR/usr/lib/stremohub/app/js"
mkdir -p "$BUILD_DIR/usr/lib/stremohub/app/css"

# Copy source files
cp src/stremohub-gtk.py           "$BUILD_DIR/usr/lib/stremohub/"
cp src/server/stremohub_server.py "$BUILD_DIR/usr/lib/stremohub/server/"
cp src/server/init_db.py          "$BUILD_DIR/usr/lib/stremohub/server/"
cp src/app/index.html             "$BUILD_DIR/usr/lib/stremohub/app/"
cp src/app/css/main.css           "$BUILD_DIR/usr/lib/stremohub/app/css/"
cp src/app/js/*.js                "$BUILD_DIR/usr/lib/stremohub/app/js/"

# Create launcher binary
cat > "$BUILD_DIR/usr/bin/stremohub" << 'LAUNCHER'
#!/bin/bash
exec python3 /usr/lib/stremohub/stremohub-gtk.py "$@"
LAUNCHER
chmod +x "$BUILD_DIR/usr/bin/stremohub"

# Copy packaging files
cp packaging/debian/control  "$BUILD_DIR/DEBIAN/control"
cp packaging/debian/postinst "$BUILD_DIR/DEBIAN/postinst"
cp packaging/debian/prerm    "$BUILD_DIR/DEBIAN/prerm"
sed -i "s/Architecture: .*/Architecture: ${ARCH}/" "$BUILD_DIR/DEBIAN/control"
chmod 755 "$BUILD_DIR/DEBIAN/postinst" "$BUILD_DIR/DEBIAN/prerm"

# Build
mkdir -p dist
dpkg-deb --build --root-owner-group "$BUILD_DIR" "dist/${PKG}_${ARCH}.deb"
echo "✅ Built: dist/${PKG}_${ARCH}.deb"

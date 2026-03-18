# PyInstaller spec — builds stremohub.exe for Windows
# Run: pyinstaller stremohub.spec
# Requires: pip install pyinstaller pywebview

import sys, os
block_cipher = None
SRC = os.path.join('..', '..', 'src')

a = Analysis(
    [os.path.join(SRC, 'stremohub-webview.py')],
    pathex=[SRC],
    binaries=[],
    datas=[
        (os.path.join(SRC, 'app'),    'app'),
        (os.path.join(SRC, 'server'), 'server'),
    ],
    hiddenimports=['webview', 'sqlite3', 'http.server', 'urllib'],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='StremoHub',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,          # No console window
    icon='stremohub.ico',   # Add your icon here
)

coll = COLLECT(
    exe, a.binaries, a.zipfiles, a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='StremoHub',
)

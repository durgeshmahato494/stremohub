# PyInstaller spec for macOS .app bundle
import sys, os
SRC = os.path.join('..', '..', 'src')

a = Analysis(
    [os.path.join(SRC, 'stremohub-webview.py')],
    pathex=[SRC],
    binaries=[],
    datas=[
        (os.path.join(SRC, 'app'),    'app'),
        (os.path.join(SRC, 'server'), 'server'),
    ],
    hiddenimports=['webview', 'sqlite3'],
    excludes=[],
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='stremohub',
          debug=False, strip=False, upx=False, console=False)
coll = COLLECT(exe, a.binaries, a.zipfiles, a.datas, strip=False, name='stremohub')
app  = BUNDLE(coll,
    name='StremoHub.app',
    icon='StremoHub.icns',
    bundle_identifier='com.stremohub.app',
    info_plist={
        'CFBundleShortVersionString': '3.0',
        'CFBundleName': 'StremoHub',
        'NSHighResolutionCapable': True,
        'LSMinimumSystemVersion': '12.0',
    },
)

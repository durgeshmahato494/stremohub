@echo off
echo Building StremoHub for Windows...

:: Check Python
python --version >nul 2>&1 || (echo Python not found & pause & exit)

:: Install deps
pip install pywebview pyinstaller

:: Build exe
cd /d "%~dp0"
pyinstaller stremohub.spec --distpath ..\..\dist\windows --workpath ..\..\build\windows --clean

echo.
echo Built: dist\windows\StremoHub\StremoHub.exe
pause

; StremoHub Windows Installer (NSIS)
; Compile with: makensis installer.nsi

!define APP_NAME "StremoHub"
!define APP_VERSION "3.0"
!define APP_EXE "StremoHub.exe"
!define INSTALL_DIR "$PROGRAMFILES64\StremoHub"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "..\..\dist\StremoHub-Setup.exe"
InstallDir "${INSTALL_DIR}"
RequestExecutionLevel admin
SetCompressor lzma

Page directory
Page instfiles
UninstPage instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "..\..\dist\windows\StremoHub\*.*"
  
  ; Start Menu shortcut
  CreateDirectory "$SMPROGRAMS\StremoHub"
  CreateShortcut "$SMPROGRAMS\StremoHub\StremoHub.lnk" "$INSTDIR\${APP_EXE}"
  
  ; Desktop shortcut
  CreateShortcut "$DESKTOP\StremoHub.lnk" "$INSTDIR\${APP_EXE}"
  
  ; Uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\StremoHub" \
    "DisplayName" "StremoHub"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\StremoHub" \
    "UninstallString" "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$SMPROGRAMS\StremoHub\StremoHub.lnk"
  Delete "$DESKTOP\StremoHub.lnk"
  RMDir "$SMPROGRAMS\StremoHub"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\StremoHub"
SectionEnd

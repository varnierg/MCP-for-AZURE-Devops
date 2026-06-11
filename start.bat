@echo off
cd /d "%~dp0"

:: Check if running on Google Drive (drive letter G: or path contains "Drive")
set IS_GDRIVE=0
if "%~d0"=="G:" set IS_GDRIVE=1
if "%~d0"=="g:" set IS_GDRIVE=1
echo "%~dp0" | findstr /i "Drive" >nul
if %errorlevel% equ 0 set IS_GDRIVE=1

if %IS_GDRIVE% equ 1 (
  if exist node_modules (
    rmdir /s /q node_modules
  )
)

set NODE_PATH=%USERPROFILE%\AppData\Roaming\npm\node_modules
ts-node -T src/index.ts

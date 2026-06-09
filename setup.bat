@echo off
cd /d "%~dp0"
set NODE_PATH=%USERPROFILE%\AppData\Roaming\npm\node_modules
ts-node -T src/setup.ts

@echo off
setlocal
set "SCRIPT=%~dp0install-endpoint-heartbeat.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
endlocal

@echo off
setlocal
set "SCRIPT=%~dp0uninstall-endpoint-heartbeat.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
endlocal

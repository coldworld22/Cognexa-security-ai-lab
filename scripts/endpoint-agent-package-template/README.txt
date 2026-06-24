Security AI Lab Endpoint Agent Package
=====================================

Files:
- install-endpoint-heartbeat.bat
- install-endpoint-heartbeat.ps1
- uninstall-endpoint-heartbeat.bat
- uninstall-endpoint-heartbeat.ps1
- run-endpoint-heartbeat.ps1
- windows-endpoint-heartbeat.ps1
- agent-config.json

Install:
1. Copy this whole folder to the Windows PC you manage.
2. Right-click install-endpoint-heartbeat.bat and run it as Administrator.
3. The installer copies the files to ProgramData and creates a scheduled task that runs every 5 minutes as SYSTEM.

Uninstall:
1. Run uninstall-endpoint-heartbeat.bat as Administrator.

Notes:
- The target PC must be able to reach the backend API URL in agent-config.json.
- The enrollment token in agent-config.json must match ENDPOINT_ENROLLMENT_TOKEN on the backend.
- To show a remote control button in the admin monitor, set RemoteAccess.launchUrl in agent-config.json to your approved web remote console URL for that PC.
- Recommended providers are web gateways such as Guacamole, MeshCentral, or another authenticated HTTPS remote console.
- This package is for authorized endpoint management only.

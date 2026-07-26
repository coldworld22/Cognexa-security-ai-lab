"use strict";

const { spawn } = require("child_process");
const path = require("path");

const scriptPath = path.join(__dirname, "tray-application.ps1");
const child = spawn(
  "powershell.exe",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    ...process.argv.slice(2)
  ],
  {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  }
);

child.unref();

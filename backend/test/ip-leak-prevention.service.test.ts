import assert from "node:assert/strict";
import test from "node:test";

import { IPLeakPreventionService } from "../src/services/ip-leak/ip-leak-prevention.service";

test("IPLeakPreventionService reports an inactive ruleset when firewall inspection lacks elevation", async () => {
  const service = new IPLeakPreventionService({
    platform: "win32",
    windowsCommands: {
      toPowerShellLiteral: (value: string) => `'${value}'`,
      runPowerShell: async () => {
        throw Object.assign(new Error("Command failed"), {
          code: 1,
          cmd: "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command Get-NetFirewallRule -Group 'Security AI Lab Private Mode' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty DisplayName | ConvertTo-Json -Compress",
          stdout: "",
          stderr: ""
        });
      }
    } as never
  });

  const result = await service.verifyIPLeaks();

  assert.equal(result.passed, false);
  assert.deepEqual(result.activeRuleNames, []);
  assert.deepEqual(result.details, ["No leak-prevention firewall rules are active."]);
});

import assert from "node:assert/strict";
import test from "node:test";

import { FullProtectionToggleService } from "../src/services/toggle/full-protection-toggle.service";

test("FullProtectionToggleService activates and deactivates the protection stack in order", async () => {
  const actions: string[] = [];
  const systemProxy = {
    enableSystemProxy: async (port: number) => {
      actions.push(`systemProxy.enable:${String(port)}`);
    },
    disableSystemProxy: async () => {
      actions.push("systemProxy.disable");
    },
    getLocalHttpProxyPort: () => 9080,
    verifySystemProxy: async () => ({
      passed: true,
      details: ["ok"],
      bridgeListening: true,
      localHttpProxyPort: 9080,
      winInetConfigured: true,
      winHttpConfigured: true
    })
  };
  const browserProxy = {
    configureBrowsers: async (config: {
      torSocksPort: number;
      localHttpProxyPort: number;
    }) => {
      actions.push(
        `browserProxy.configure:${String(config.torSocksPort)}:${String(
          config.localHttpProxyPort
        )}`
      );
    },
    restoreBrowsers: async () => {
      actions.push("browserProxy.restore");
    },
    verifyBrowserProxy: async () => ({
      passed: true,
      details: ["ok"],
      configuredBrowsers: ["chrome", "edge", "firefox"],
      shortcutPaths: ["Chrome - Protected.lnk"]
    })
  };
  const appProxy = {
    forceAppProxy: async (config: {
      enableKillSwitch?: boolean;
    }) => {
      actions.push(`appProxy.force:${String(Boolean(config.enableKillSwitch))}`);
    },
    disableAppProxy: async () => {
      actions.push("appProxy.disable");
    },
    verifyAppProxy: async () => ({
      passed: true,
      details: ["ok"],
      enforcedPrograms: ["chrome.exe"]
    })
  };
  const webrtcBlock = {
    blockWebRTC: async () => {
      actions.push("webrtc.block");
    },
    unblockWebRTC: async () => {
      actions.push("webrtc.unblock");
    },
    verifyWebRTCBlocked: async () => ({
      passed: true,
      details: ["ok"],
      configuredBrowsers: ["chrome", "edge", "firefox"]
    })
  };
  const systemDns = {
    forceSystemDNS: async (port: number) => {
      actions.push(`dns.force:${String(port)}`);
    },
    restoreDNS: async () => {
      actions.push("dns.restore");
    },
    verifyDNS: async () => ({
      passed: true,
      details: ["ok"],
      torDnsPortReachable: true,
      protectedAdapters: ["Ethernet"]
    })
  };
  const ipLeakPrevention = {
    verifyIPLeaks: async () => ({
      passed: true,
      details: ["ok"],
      activeRuleNames: ["Block DNS leaks"]
    })
  };
  const fingerprint = {
    spoofBrowserFingerprint: async () => {
      actions.push("fingerprint.spoof");
    },
    restoreFingerprint: async () => {
      actions.push("fingerprint.restore");
    },
    verifyFingerprint: async () => ({
      passed: true,
      details: ["ok"],
      hardenedBrowsers: ["firefox"]
    })
  };

  const service = new FullProtectionToggleService(
    systemProxy as never,
    browserProxy as never,
    appProxy as never,
    webrtcBlock as never,
    systemDns as never,
    ipLeakPrevention as never,
    fingerprint as never
  );

  const verification = await service.activateFullProtection({
    workspaceId: "workspace-1",
    torSocksPort: 9050,
    dnsOverTor: true,
    enableKillSwitch: true
  });

  assert.equal(verification.passed, true);
  assert.deepEqual(actions.slice(0, 6), [
    "systemProxy.enable:9050",
    "browserProxy.configure:9050:9080",
    "webrtc.block",
    "dns.force:9053",
    "appProxy.force:true",
    "fingerprint.spoof"
  ]);

  await service.deactivateFullProtection();

  assert.deepEqual(actions.slice(-6), [
    "fingerprint.restore",
    "appProxy.disable",
    "dns.restore",
    "webrtc.unblock",
    "browserProxy.restore",
    "systemProxy.disable"
  ]);
});

test("FullProtectionToggleService keeps activating when a best-effort browser step lacks OS permissions", async () => {
  const actions: string[] = [];
  const accessDeniedError = Object.assign(new Error("Access is denied."), {
    stderr: "Access is denied."
  });
  const systemProxy = {
    enableSystemProxy: async (port: number) => {
      actions.push(`systemProxy.enable:${String(port)}`);
    },
    disableSystemProxy: async () => {
      actions.push("systemProxy.disable");
    },
    getLocalHttpProxyPort: () => 9080,
    verifySystemProxy: async () => ({
      passed: true,
      details: ["ok"],
      bridgeListening: true,
      localHttpProxyPort: 9080,
      winInetConfigured: true,
      winHttpConfigured: true
    })
  };
  const browserProxy = {
    configureBrowsers: async () => {
      actions.push("browserProxy.configure");
      throw accessDeniedError;
    },
    restoreBrowsers: async () => {
      actions.push("browserProxy.restore");
    },
    verifyBrowserProxy: async () => ({
      passed: false,
      details: ["No protected browser profile or shortcut has been configured yet."],
      configuredBrowsers: [],
      shortcutPaths: []
    })
  };
  const appProxy = {
    forceAppProxy: async (config: {
      enableKillSwitch?: boolean;
    }) => {
      actions.push(`appProxy.force:${String(Boolean(config.enableKillSwitch))}`);
    },
    disableAppProxy: async () => {
      actions.push("appProxy.disable");
    },
    verifyAppProxy: async () => ({
      passed: true,
      details: ["ok"],
      enforcedPrograms: ["chrome.exe"]
    })
  };
  const webrtcBlock = {
    blockWebRTC: async () => {
      actions.push("webrtc.block");
    },
    unblockWebRTC: async () => {
      actions.push("webrtc.unblock");
    },
    verifyWebRTCBlocked: async () => ({
      passed: true,
      details: ["ok"],
      configuredBrowsers: ["firefox"]
    })
  };
  const systemDns = {
    forceSystemDNS: async (port: number) => {
      actions.push(`dns.force:${String(port)}`);
    },
    restoreDNS: async () => {
      actions.push("dns.restore");
    },
    verifyDNS: async () => ({
      passed: true,
      details: ["ok"],
      torDnsPortReachable: true,
      protectedAdapters: ["Ethernet"]
    })
  };
  const ipLeakPrevention = {
    verifyIPLeaks: async () => ({
      passed: true,
      details: ["ok"],
      activeRuleNames: ["Block DNS leaks"]
    })
  };
  const fingerprint = {
    spoofBrowserFingerprint: async () => {
      actions.push("fingerprint.spoof");
    },
    restoreFingerprint: async () => {
      actions.push("fingerprint.restore");
    },
    verifyFingerprint: async () => ({
      passed: true,
      details: ["ok"],
      hardenedBrowsers: ["firefox"]
    })
  };

  const service = new FullProtectionToggleService(
    systemProxy as never,
    browserProxy as never,
    appProxy as never,
    webrtcBlock as never,
    systemDns as never,
    ipLeakPrevention as never,
    fingerprint as never
  );

  const verification = await service.activateFullProtection({
    workspaceId: "workspace-1",
    torSocksPort: 9050,
    dnsOverTor: true,
    enableKillSwitch: true
  });

  assert.equal(verification.passed, false);
  assert.deepEqual(actions, [
    "systemProxy.enable:9050",
    "browserProxy.configure",
    "webrtc.block",
    "dns.force:9053",
    "appProxy.force:true",
    "fingerprint.spoof"
  ]);
  assert.ok(verification.advisories.includes("browser_proxy_review_required"));
});

test("FullProtectionToggleService keeps activating when firewall enforcement lacks elevated privileges", async () => {
  const actions: string[] = [];
  const firewallPermissionError = Object.assign(new Error("Command failed"), {
    code: 1,
    cmd: "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command Get-NetFirewallRule -Group 'Security AI Lab Private Mode' -ErrorAction SilentlyContinue | Remove-NetFirewallRule",
    stdout: "",
    stderr: ""
  });
  const systemProxy = {
    enableSystemProxy: async (port: number) => {
      actions.push(`systemProxy.enable:${String(port)}`);
    },
    disableSystemProxy: async () => {
      actions.push("systemProxy.disable");
    },
    getLocalHttpProxyPort: () => 9080,
    verifySystemProxy: async () => ({
      passed: true,
      details: ["ok"],
      bridgeListening: true,
      localHttpProxyPort: 9080,
      winInetConfigured: true,
      winHttpConfigured: true
    })
  };
  const browserProxy = {
    configureBrowsers: async () => {
      actions.push("browserProxy.configure");
    },
    restoreBrowsers: async () => {
      actions.push("browserProxy.restore");
    },
    verifyBrowserProxy: async () => ({
      passed: true,
      details: ["ok"],
      configuredBrowsers: ["chrome"],
      shortcutPaths: ["Chrome - Protected.lnk"]
    })
  };
  const appProxy = {
    forceAppProxy: async () => {
      actions.push("appProxy.force");
      throw firewallPermissionError;
    },
    disableAppProxy: async () => {
      actions.push("appProxy.disable");
    },
    verifyAppProxy: async () => ({
      passed: false,
      details: ["No leak-prevention firewall rules are active."],
      enforcedPrograms: []
    })
  };
  const webrtcBlock = {
    blockWebRTC: async () => {
      actions.push("webrtc.block");
    },
    unblockWebRTC: async () => {
      actions.push("webrtc.unblock");
    },
    verifyWebRTCBlocked: async () => ({
      passed: true,
      details: ["ok"],
      configuredBrowsers: ["firefox"]
    })
  };
  const systemDns = {
    forceSystemDNS: async (port: number) => {
      actions.push(`dns.force:${String(port)}`);
    },
    restoreDNS: async () => {
      actions.push("dns.restore");
    },
    verifyDNS: async () => ({
      passed: true,
      details: ["ok"],
      torDnsPortReachable: true,
      protectedAdapters: ["Ethernet"]
    })
  };
  const ipLeakPrevention = {
    verifyIPLeaks: async () => ({
      passed: false,
      details: ["No leak-prevention firewall rules are active."],
      activeRuleNames: []
    })
  };
  const fingerprint = {
    spoofBrowserFingerprint: async () => {
      actions.push("fingerprint.spoof");
    },
    restoreFingerprint: async () => {
      actions.push("fingerprint.restore");
    },
    verifyFingerprint: async () => ({
      passed: true,
      details: ["ok"],
      hardenedBrowsers: ["firefox"]
    })
  };

  const service = new FullProtectionToggleService(
    systemProxy as never,
    browserProxy as never,
    appProxy as never,
    webrtcBlock as never,
    systemDns as never,
    ipLeakPrevention as never,
    fingerprint as never
  );

  const verification = await service.activateFullProtection({
    workspaceId: "workspace-1",
    torSocksPort: 9050,
    dnsOverTor: true,
    enableKillSwitch: true
  });

  assert.equal(verification.passed, false);
  assert.deepEqual(actions, [
    "systemProxy.enable:9050",
    "browserProxy.configure",
    "webrtc.block",
    "dns.force:9053",
    "appProxy.force",
    "fingerprint.spoof"
  ]);
  assert.ok(verification.advisories.includes("app_proxy_enforcement_incomplete"));
});

test("FullProtectionToggleService returns a degraded verification when a probe throws unexpectedly", async () => {
  const systemProxy = {
    enableSystemProxy: async () => {},
    disableSystemProxy: async () => {},
    getLocalHttpProxyPort: () => 9080,
    verifySystemProxy: async () => ({
      passed: true,
      details: ["ok"],
      bridgeListening: true,
      localHttpProxyPort: 9080,
      winInetConfigured: true,
      winHttpConfigured: true
    })
  };
  const browserProxy = {
    configureBrowsers: async () => {},
    restoreBrowsers: async () => {},
    verifyBrowserProxy: async () => ({
      passed: true,
      details: ["ok"],
      configuredBrowsers: ["chrome"],
      shortcutPaths: ["Chrome - Protected.lnk"]
    })
  };
  const appProxy = {
    forceAppProxy: async () => {},
    disableAppProxy: async () => {},
    verifyAppProxy: async () => {
      throw new Error("verification crashed");
    }
  };
  const webrtcBlock = {
    blockWebRTC: async () => {},
    unblockWebRTC: async () => {},
    verifyWebRTCBlocked: async () => ({
      passed: true,
      details: ["ok"],
      configuredBrowsers: ["firefox"]
    })
  };
  const systemDns = {
    forceSystemDNS: async () => {},
    restoreDNS: async () => {},
    verifyDNS: async () => ({
      passed: true,
      details: ["ok"],
      torDnsPortReachable: true,
      protectedAdapters: ["Ethernet"]
    })
  };
  const ipLeakPrevention = {
    verifyIPLeaks: async () => ({
      passed: true,
      details: ["ok"],
      activeRuleNames: ["Block DNS leaks"]
    })
  };
  const fingerprint = {
    spoofBrowserFingerprint: async () => {},
    restoreFingerprint: async () => {},
    verifyFingerprint: async () => ({
      passed: true,
      details: ["ok"],
      hardenedBrowsers: ["firefox"]
    })
  };

  const service = new FullProtectionToggleService(
    systemProxy as never,
    browserProxy as never,
    appProxy as never,
    webrtcBlock as never,
    systemDns as never,
    ipLeakPrevention as never,
    fingerprint as never
  );

  const verification = await service.activateFullProtection({
    workspaceId: "workspace-1",
    torSocksPort: 9050,
    dnsOverTor: true
  });

  assert.equal(verification.passed, false);
  assert.deepEqual(verification.results.appProxy, {
    passed: false,
    details: ["App proxy verification could not be completed."],
    enforcedPrograms: []
  });
  assert.ok(verification.advisories.includes("app_proxy_enforcement_incomplete"));
});

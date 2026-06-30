"use client";

import { useEffect, useState } from "react";
import {
  EyeOff,
  RefreshCcw,
  RotateCw,
  Save,
  ShieldCheck,
  ShieldOff,
  TriangleAlert
} from "lucide-react";

import {
  activatePrivateMode,
  deactivatePrivateMode,
  getPrivateModeConfig,
  getPrivateModeSession,
  leakTestPrivateMode,
  listPrivateModeExitLogs,
  rotatePrivateModeCircuit,
  updatePrivateModeConfig,
  verifyPrivateMode
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  PolicyCategory,
  PrivateModeCircuitStatus,
  PrivateModeConnectionIdentity,
  PrivateModeConfig,
  PrivateModeExitLog,
  PrivateModeLeakTestResult,
  PrivateModeRelayNode,
  PrivateModeSession,
  PrivateModeTlsFingerprintProfile,
  PrivateModeVerificationResult
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const CATEGORY_OPTIONS: PolicyCategory[] = [
  "security_research",
  "vulnerability_analysis",
  "external_url_access",
  "tool_usage"
];

const STRATEGY_OPTIONS: Array<PrivateModeConfig["outboundStrategy"]> = [
  "tor",
  "vpn-chain",
  "hybrid",
  "rotating-proxy"
];

const FINGERPRINT_OPTIONS: PrivateModeTlsFingerprintProfile[] = [
  "browser",
  "curl",
  "random"
];

type ActivationStage = "profile" | "session" | "sync" | "verify" | "active";
type ActivationBannerState =
  | "idle"
  | "running"
  | "pending"
  | "connected"
  | "warning"
  | "failed";
type ActivationStageVisualState =
  | "current"
  | "complete"
  | "upcoming"
  | "review"
  | "failed";

const ACTIVATION_STAGES: ActivationStage[] = [
  "profile",
  "session",
  "sync",
  "verify",
  "active"
];
const VERIFY_STAGE_INDEX = ACTIVATION_STAGES.indexOf("verify");

function parseRelayNodes(value: string): PrivateModeRelayNode[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Relay JSON must be an array.");
  }

  return parsed as PrivateModeRelayNode[];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatIdentityLocation(identity: PrivateModeConnectionIdentity | null): string | null {
  if (!identity) {
    return null;
  }

  const parts = [identity.city, identity.region, identity.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function PrivateModeConsole() {
  const { formatDateTime, formatNumber, t } = useI18n();
  const [config, setConfig] = useState<PrivateModeConfig | null>(null);
  const [session, setSession] = useState<PrivateModeSession | null>(null);
  const [circuit, setCircuit] = useState<PrivateModeCircuitStatus | null>(null);
  const [logs, setLogs] = useState<PrivateModeExitLog[]>([]);
  const [verification, setVerification] =
    useState<PrivateModeVerificationResult | null>(null);
  const [leakTest, setLeakTest] = useState<PrivateModeLeakTestResult | null>(null);
  const [relayJson, setRelayJson] = useState("[]");
  const [exitGeoInput, setExitGeoInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLeakTesting, setIsLeakTesting] = useState(false);
  const [activationStage, setActivationStage] = useState<ActivationStage | null>(null);
  const [activationFailureMessage, setActivationFailureMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    void loadState();
  }, []);

  async function loadState() {
    setIsLoading(true);
    setError(null);

    try {
      const [nextConfig, nextSessionState, nextLogs] = await Promise.all([
        getPrivateModeConfig(),
        getPrivateModeSession(),
        listPrivateModeExitLogs()
      ]);

      applyConfig(nextConfig);
      setSession(nextSessionState.session);
      setCircuit(nextSessionState.circuit);
      setLogs(nextLogs);
      setActivationFailureMessage(null);

      if (nextSessionState.session) {
        setVerification(null);
        setLeakTest(null);
        void refreshIdentitySnapshot(false);
      } else {
        setVerification(null);
        setLeakTest(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("privateMode.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  function applyConfig(nextConfig: PrivateModeConfig) {
    setConfig(nextConfig);
    setRelayJson(JSON.stringify(nextConfig.vpnRelays, null, 2));
    setExitGeoInput(nextConfig.exitGeographyPreference.join(", "));
  }

  function buildPayload(): Partial<PrivateModeConfig> {
    if (!config) {
      throw new Error(t("privateMode.loadFailed"));
    }

    return {
      mode: config.mode,
      outboundStrategy: config.outboundStrategy,
      torControlPort: config.torControlPort,
      torSocksPort: config.torSocksPort,
      dnsOverTor: config.dnsOverTor,
      circuitRotationInterval: config.circuitRotationInterval,
      tlsFingerprintProfile: config.tlsFingerprintProfile,
      requestTimingJitter: config.requestTimingJitter,
      enabledCategories: config.enabledCategories,
      exitGeographyPreference: exitGeoInput
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      vpnRelays: parseRelayNodes(relayJson)
    };
  }

  async function refreshIdentitySnapshot(
    surfaceErrors = true
  ): Promise<{
    verification: PrivateModeVerificationResult | null;
    leakTest: PrivateModeLeakTestResult | null;
  }> {
    const [verificationResult, leakTestResult] = await Promise.allSettled([
      verifyPrivateMode(),
      leakTestPrivateMode()
    ]);

    let nextVerification: PrivateModeVerificationResult | null = null;
    let nextLeakTest: PrivateModeLeakTestResult | null = null;
    let firstError: string | null = null;

    if (verificationResult.status === "fulfilled") {
      nextVerification = verificationResult.value;
      setVerification(verificationResult.value);
    } else if (surfaceErrors) {
      firstError = verificationResult.reason instanceof Error
        ? verificationResult.reason.message
        : t("privateMode.verifyFailed");
      setVerification(null);
    }

    if (leakTestResult.status === "fulfilled") {
      nextLeakTest = leakTestResult.value;
      setLeakTest(leakTestResult.value);
    } else if (surfaceErrors) {
      firstError ??=
        leakTestResult.reason instanceof Error
          ? leakTestResult.reason.message
          : t("privateMode.leakFailed");
      setLeakTest(null);
    }

    if (surfaceErrors && firstError && !nextVerification && !nextLeakTest) {
      setError(firstError);
    }

    return {
      verification: nextVerification,
      leakTest: nextLeakTest
    };
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    setActivationFailureMessage(null);

    try {
      const nextConfig = await updatePrivateModeConfig(buildPayload());
      applyConfig(nextConfig);
      setNotice(t("privateMode.configSaved"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("privateMode.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActivate() {
    setIsActivating(true);
    setError(null);
    setNotice(null);
    setVerification(null);
    setActivationFailureMessage(null);
    setActivationStage("profile");

    try {
      const payload = buildPayload();
      const nextConfig = await updatePrivateModeConfig(payload);
      applyConfig(nextConfig);

      setActivationStage("session");
      const nextSession = await activatePrivateMode(payload);
      setSession(nextSession);

      setActivationStage("sync");
      const [nextLogs, nextSessionState] = await Promise.all([
        listPrivateModeExitLogs(),
        getPrivateModeSession()
      ]);
      setSession(nextSessionState.session);
      setCircuit(nextSessionState.circuit);
      setLogs(nextLogs);

      setActivationStage("verify");
      try {
        const snapshot = await refreshIdentitySnapshot(false);

        if (snapshot.verification?.isCloaked && snapshot.verification.transportVerified) {
          setActivationStage("active");
          setNotice(t("privateMode.readyNotice"));
        } else if (snapshot.verification) {
          setNotice(t("privateMode.warningNotice"));
        } else {
          setNotice(t("privateMode.pendingNotice"));
        }
      } catch {
        setNotice(t("privateMode.pendingNotice"));
      }
    } catch (activateError) {
      const message =
        activateError instanceof Error
          ? activateError.message
          : t("privateMode.activateFailed");
      setActivationFailureMessage(message);
      setError(message);
    } finally {
      setIsActivating(false);
    }
  }

  async function handleDeactivate() {
    if (!session) {
      return;
    }

    setIsDeactivating(true);
    setError(null);
    setNotice(null);
    setActivationFailureMessage(null);

    try {
      await deactivatePrivateMode(session.id);
      setVerification(null);
      setLeakTest(null);
      setActivationStage(null);
      await loadState();
      setNotice(t("privateMode.deactivated"));
    } catch (deactivateError) {
      setError(
        deactivateError instanceof Error
          ? deactivateError.message
          : t("privateMode.deactivateFailed")
      );
    } finally {
      setIsDeactivating(false);
    }
  }

  async function handleRotate() {
    if (!session) {
      return;
    }

    setIsRotating(true);
    setError(null);
    setNotice(null);
    setActivationFailureMessage(null);

    try {
      const nextCircuit = await rotatePrivateModeCircuit(session.id);
      setCircuit(nextCircuit);
      await refreshIdentitySnapshot(false);
      setNotice(t("privateMode.rotated"));
    } catch (rotateError) {
      setError(
        rotateError instanceof Error ? rotateError.message : t("privateMode.rotateFailed")
      );
    } finally {
      setIsRotating(false);
    }
  }

  async function handleVerify() {
    setIsVerifying(true);
    setError(null);
    setNotice(null);
    setActivationFailureMessage(null);

    try {
      const snapshot = await refreshIdentitySnapshot(false);
      const nextVerification = snapshot.verification;
      setActivationStage(
        nextVerification?.isCloaked && nextVerification.transportVerified
          ? "active"
          : "verify"
      );
      setNotice(
        nextVerification?.isCloaked && nextVerification.transportVerified
          ? t("privateMode.verified")
          : t("privateMode.verificationWarnings")
      );
    } catch (verifyError) {
      setError(
        verifyError instanceof Error ? verifyError.message : t("privateMode.verifyFailed")
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleLeakTest() {
    setIsLeakTesting(true);
    setError(null);
    setNotice(null);

    try {
      setLeakTest(await leakTestPrivateMode());
      setNotice(t("privateMode.leakTestCompleted"));
    } catch (leakError) {
      setError(
        leakError instanceof Error ? leakError.message : t("privateMode.leakFailed")
      );
    } finally {
      setIsLeakTesting(false);
    }
  }

  function toggleCategory(category: PolicyCategory) {
    if (!config) {
      return;
    }

    const enabled = config.enabledCategories.includes(category);
    setConfig({
      ...config,
      enabledCategories: enabled
        ? config.enabledCategories.filter((entry) => entry !== category)
        : [...config.enabledCategories, category]
    });
  }

  if (isLoading || !config) {
    return (
      <Card className="bg-white/82 p-6 text-sm text-[var(--text-secondary)]">
        {t("privateMode.loading")}
      </Card>
    );
  }

  const active = Boolean(session);
  const routeVerified = Boolean(
    verification?.isCloaked && verification.transportVerified
  );
  const currentStageIndex =
    activationStage === null ? 0 : ACTIVATION_STAGES.indexOf(activationStage);
  const bannerState: ActivationBannerState = isActivating
    ? "running"
    : active && routeVerified
      ? "connected"
    : active && verification
      ? "warning"
        : active
          ? "pending"
          : activationFailureMessage
            ? "failed"
            : "idle";
  const securityModulesState = active
    ? routeVerified
      ? "ready"
      : verification
        ? "review"
        : "pending"
    : "locked";
  const bannerClassName =
    bannerState === "connected"
      ? "border-emerald-200 bg-emerald-50/70 text-emerald-700"
      : bannerState === "warning" || bannerState === "pending"
        ? "border-amber-200 bg-amber-50/70 text-amber-800"
        : bannerState === "failed"
          ? "border-red-200 bg-red-50/70 text-red-700"
          : bannerState === "running"
            ? "border-blue-200 bg-blue-50/70 text-blue-700"
            : "border-slate-200 bg-slate-50/70 text-slate-700";
  const directIdentity = leakTest?.directIdentity ?? verification?.directIdentity ?? null;
  const exitIdentity = leakTest?.exitIdentity ?? verification?.exitIdentity ?? null;
  const verificationCategory =
    verification?.verificationCategory ??
    leakTest?.verificationCategory ??
    "external_url_access";
  const advisoryCodes = uniqueStrings([
    ...(verification?.advisories ?? []),
    ...(leakTest?.advisories ?? [])
  ]);
  const leakCodes = uniqueStrings([
    ...(verification?.leaks ?? []),
    ...(leakTest?.leaks ?? [])
  ]);
  const exitPreview =
    exitIdentity?.ip ??
    verification?.exitIp ??
    leakTest?.exitIp ??
    session?.exitNodes[0] ??
    t("privateMode.unknown");
  const directLocation = formatIdentityLocation(directIdentity);
  const exitLocation = formatIdentityLocation(exitIdentity);

  function translateLeak(code: string): string {
    switch (code) {
      case "private_mode_inactive":
      case "exit_ip_unavailable":
      case "tor_exit_unconfirmed":
      case "exit_ip_matches_direct_path":
      case "dns_over_tor_requested_without_tor_transport":
        return t(`privateMode.leakCodes.${code}`);
      default:
        return code;
    }
  }

  function translateAdvisory(code: string): string {
    switch (code) {
      case "vpn_chain_external_tunnel_required":
      case "hybrid_sensitive_categories_only":
      case "hybrid_sensitive_categories_disabled":
      case "rotating_proxy_uses_tor_transport":
        return t(`privateMode.advisoryCodes.${code}`);
      default:
        return code;
    }
  }

  function translateTorStatus(value: boolean | null | undefined): string {
    if (value === true) {
      return t("privateMode.torStates.confirmed");
    }

    if (value === false) {
      return t("privateMode.torStates.notDetected");
    }

    return t("privateMode.torStates.unknown");
  }

  function translateNetwork(value: PrivateModeConnectionIdentity["network"] | undefined): string {
    if (!value) {
      return t("privateMode.unknown");
    }

    return t(`privateMode.networkStates.${value}`);
  }

  function getActivationStageVisualState(
    stage: ActivationStage,
    index: number
  ): ActivationStageVisualState {
    if (isActivating) {
      if (index < currentStageIndex) {
        return "complete";
      }

      if (index === currentStageIndex) {
        return "current";
      }

      return "upcoming";
    }

    if (bannerState === "connected") {
      return "complete";
    }

    if (bannerState === "warning") {
      if (index < VERIFY_STAGE_INDEX) {
        return "complete";
      }

      return stage === "verify" ? "review" : "upcoming";
    }

    if (bannerState === "pending") {
      if (index < VERIFY_STAGE_INDEX) {
        return "complete";
      }

      return stage === "verify" ? "current" : "upcoming";
    }

    if (bannerState === "failed") {
      if (index < currentStageIndex) {
        return "complete";
      }

      return index === currentStageIndex ? "failed" : "upcoming";
    }

    return index === 0 ? "current" : "upcoming";
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-5 bg-white/82">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-black/45">
              {t("privateMode.label")}
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">
              {t("privateMode.title")}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
              {t("privateMode.description")}
            </p>
          </div>
          <div className="rounded-[22px] border border-black/8 bg-[var(--surface-soft)] p-4 lg:max-w-md">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t("privateMode.statusTitle")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                className={
                  active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-100 text-slate-700"
                }
              >
                {active ? t("privateMode.active") : t("privateMode.inactive")}
              </Badge>
              <Badge>{t(`privateMode.strategies.${config.outboundStrategy}`)}</Badge>
              <Badge>{config.dnsOverTor ? t("privateMode.dnsTor") : t("privateMode.dnsLocal")}</Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void loadState()}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
          >
            <RefreshCcw className="size-4" />
            {t("privateMode.refresh")}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Save className="size-4" />
            {isSaving ? t("privateMode.saving") : t("privateMode.save")}
          </button>
          <button
            type="button"
            onClick={() => void handleActivate()}
            disabled={isActivating}
            className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <EyeOff className="size-4" />
            {isActivating ? t("privateMode.activating") : t("privateMode.activate")}
          </button>
          <button
            type="button"
            onClick={() => void handleDeactivate()}
            disabled={!active || isDeactivating}
            className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <ShieldOff className="size-4" />
            {isDeactivating ? t("privateMode.deactivating") : t("privateMode.deactivate")}
          </button>
          <button
            type="button"
            onClick={() => void handleRotate()}
            disabled={!active || isRotating}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            <RotateCw className="size-4" />
            {isRotating ? t("privateMode.rotating") : t("privateMode.rotate")}
          </button>
          <button
            type="button"
            onClick={() => void handleVerify()}
            disabled={isVerifying}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <ShieldCheck className="size-4" />
            {isVerifying ? t("privateMode.verifying") : t("privateMode.verify")}
          </button>
          <button
            type="button"
            onClick={() => void handleLeakTest()}
            disabled={isLeakTesting}
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <ShieldCheck className="size-4" />
            {isLeakTesting ? t("privateMode.testing") : t("privateMode.leakTest")}
          </button>
        </div>

        {notice ? (
          <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </Card>

      <Card className="bg-white/82">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-black/45">
              {t("privateMode.activationTimelineTitle")}
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-ink">
              {t(`privateMode.connectionHeadlines.${bannerState}`)}
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
              {t(`privateMode.connectionDescriptions.${bannerState}`)}
            </p>
          </div>
          <div className={`rounded-[20px] border px-4 py-3 ${bannerClassName}`}>
            <Badge className="border-current/15 bg-white/70 text-current">
              {t(`privateMode.connectionStates.${bannerState}`)}
            </Badge>
            {isActivating ? (
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-current/80">
                {t("privateMode.connectionProgress", {
                  current: currentStageIndex + 1,
                  total: ACTIVATION_STAGES.length
                })}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">
              {t("privateMode.strategy")}
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
              {t(`privateMode.strategies.${config.outboundStrategy}`)}
            </p>
          </div>
          <div className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">
              {t("privateMode.exitIp")}
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
              {exitPreview}
            </p>
          </div>
          <div className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">
              {t("privateMode.startedAt")}
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
              {session?.startedAt ? formatDateTime(session.startedAt) : t("privateMode.unknown")}
            </p>
          </div>
          <div className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">
              {t("privateMode.securityModules")}
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
              {t(`privateMode.securityStates.${securityModulesState}`)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {ACTIVATION_STAGES.map((stage, index) => {
            const visualState = getActivationStageVisualState(stage, index);
            const cardClassName =
              visualState === "complete"
                ? "border-emerald-200 bg-emerald-50/70"
                : visualState === "current"
                  ? "border-blue-200 bg-blue-50/70"
                  : visualState === "review"
                    ? "border-amber-200 bg-amber-50/70"
                  : visualState === "failed"
                    ? "border-red-200 bg-red-50/70"
                    : "border-black/8 bg-white";
            const iconClassName =
              visualState === "complete"
                ? "bg-emerald-100 text-emerald-700"
                : visualState === "current"
                  ? "bg-blue-100 text-blue-700"
                  : visualState === "review"
                    ? "bg-amber-100 text-amber-700"
                  : visualState === "failed"
                    ? "bg-red-100 text-red-700"
                    : "bg-slate-100 text-slate-600";

            return (
              <div
                key={stage}
                className={`rounded-[20px] border px-4 py-4 ${cardClassName}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={`flex size-9 items-center justify-center rounded-full ${iconClassName}`}
                  >
                    {visualState === "complete" ? (
                      <ShieldCheck className="size-4" />
                    ) : visualState === "current" ? (
                      <RefreshCcw className="size-4 animate-spin" />
                    ) : visualState === "review" ? (
                      <TriangleAlert className="size-4" />
                    ) : visualState === "failed" ? (
                      <ShieldOff className="size-4" />
                    ) : (
                      <span className="text-xs font-semibold">{index + 1}</span>
                    )}
                  </div>
                  <Badge
                    className={
                      visualState === "complete"
                        ? "border-emerald-200 bg-white text-emerald-700"
                      : visualState === "current"
                        ? "border-blue-200 bg-white text-blue-700"
                        : visualState === "review"
                          ? "border-amber-200 bg-white text-amber-800"
                        : visualState === "failed"
                          ? "border-red-200 bg-white text-red-700"
                          : "border-slate-200 bg-white text-slate-700"
                    }
                  >
                    {t(`privateMode.stageStates.${visualState}`)}
                  </Badge>
                </div>
                <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">
                  {t(`privateMode.activationStages.${stage}.title`)}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {t(`privateMode.activationStages.${stage}.description`)}
                </p>
              </div>
            );
          })}
        </div>

        {activationFailureMessage && !active ? (
          <div className="mt-5 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {activationFailureMessage}
          </div>
        ) : null}
      </Card>

      <Card className="bg-white/82">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-black/45">
              {t("privateMode.snapshotTitle")}
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-ink">
              {t("privateMode.snapshotHeading")}
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
              {t("privateMode.snapshotDescription")}
            </p>
          </div>
          <div className="rounded-[20px] border border-black/8 bg-[var(--surface-soft)] px-4 py-3">
            <div className="flex flex-wrap gap-2">
              <Badge
                className={
                  routeVerified
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : active
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-slate-100 text-slate-700"
                }
              >
                {routeVerified
                  ? t("privateMode.assuranceStates.verified")
                  : active
                    ? t("privateMode.assuranceStates.review")
                    : t("privateMode.assuranceStates.idle")}
              </Badge>
              <Badge>{t(`enums.policyCategories.${verificationCategory}`)}</Badge>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="rounded-[20px] border border-black/8 bg-white px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">
              {t("privateMode.directPath")}
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {directIdentity?.ip ?? leakTest?.directIp ?? t("privateMode.unknown")}
            </p>
            <div className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.location")}:
                </span>{" "}
                {directLocation ?? t("privateMode.unknown")}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.organization")}:
                </span>{" "}
                {directIdentity?.organization ?? t("privateMode.unknown")}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.asn")}:
                </span>{" "}
                {directIdentity?.asn ?? t("privateMode.unknown")}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.network")}:
                </span>{" "}
                {translateNetwork(directIdentity?.network)}
              </p>
            </div>
          </div>

          <div className="rounded-[20px] border border-black/8 bg-white px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">
              {t("privateMode.exitPath")}
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {exitIdentity?.ip ?? exitPreview}
            </p>
            <div className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.location")}:
                </span>{" "}
                {exitLocation ?? leakTest?.exitRegion ?? t("privateMode.unknown")}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.organization")}:
                </span>{" "}
                {exitIdentity?.organization ?? t("privateMode.unknown")}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.asn")}:
                </span>{" "}
                {exitIdentity?.asn ?? t("privateMode.unknown")}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.torStatus")}:
                </span>{" "}
                {translateTorStatus(exitIdentity?.isTorExit ?? leakTest?.isTorExit)}
              </p>
            </div>
          </div>

          <div className="rounded-[20px] border border-black/8 bg-[var(--surface-soft)] px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">
              {t("privateMode.assuranceTitle")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge
                className={
                  routeVerified
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : verification
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-white text-slate-700"
                }
              >
                {routeVerified
                  ? t("privateMode.assuranceStates.verified")
                  : verification
                    ? t("privateMode.assuranceStates.review")
                    : t("privateMode.assuranceStates.pending")}
              </Badge>
              <Badge>{config.dnsOverTor ? t("privateMode.dnsTor") : t("privateMode.dnsLocal")}</Badge>
            </div>
            <div className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.verificationPath")}:
                </span>{" "}
                {t(`enums.policyCategories.${verificationCategory}`)}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.dnsTransport")}:
                </span>{" "}
                {verification?.dnsTransport ?? leakTest?.dnsTransport ?? t("privateMode.unknown")}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.tlsFingerprint")}:
                </span>{" "}
                {t(`privateMode.fingerprintProfiles.${config.tlsFingerprintProfile}`)}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.timezone")}:
                </span>{" "}
                {exitIdentity?.timezone ?? directIdentity?.timezone ?? t("privateMode.unknown")}
              </p>
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">
                {t("privateMode.advisories")}
              </p>
              {advisoryCodes.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  {t("privateMode.noAdvisories")}
                </p>
              ) : (
                advisoryCodes.map((code) => (
                  <p key={code} className="text-sm leading-6 text-[var(--text-secondary)]">
                    {translateAdvisory(code)}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="space-y-5 bg-white/82">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-black/45">
              {t("privateMode.configTitle")}
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-ink">
              {t("privateMode.configHeading")}
            </h3>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                {t("privateMode.strategy")}
              </span>
              <select
                value={config.outboundStrategy}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    outboundStrategy: event.target.value as PrivateModeConfig["outboundStrategy"]
                  })
                }
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
              >
                {STRATEGY_OPTIONS.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {t(`privateMode.strategies.${strategy}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                {t("privateMode.tlsFingerprint")}
              </span>
              <select
                value={config.tlsFingerprintProfile}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    tlsFingerprintProfile:
                      event.target.value as PrivateModeConfig["tlsFingerprintProfile"]
                  })
                }
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
              >
                {FINGERPRINT_OPTIONS.map((profile) => (
                  <option key={profile} value={profile}>
                    {t(`privateMode.fingerprintProfiles.${profile}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                {t("privateMode.torSocksPort")}
              </span>
              <input
                type="number"
                min={1}
                max={65535}
                value={config.torSocksPort}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    torSocksPort: Number(event.target.value) || 1
                  })
                }
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                {t("privateMode.torControlPort")}
              </span>
              <input
                type="number"
                min={1}
                max={65535}
                value={config.torControlPort}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    torControlPort: Number(event.target.value) || 1
                  })
                }
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                {t("privateMode.rotationInterval")}
              </span>
              <input
                type="number"
                min={1}
                max={86400}
                value={config.circuitRotationInterval}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    circuitRotationInterval: Number(event.target.value) || 1
                  })
                }
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                {t("privateMode.requestJitter")}
              </span>
              <input
                type="number"
                min={0}
                max={10000}
                value={config.requestTimingJitter}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    requestTimingJitter: Number(event.target.value) || 0
                  })
                }
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
              />
            </label>
          </div>

          <label className="flex items-center gap-3 rounded-[20px] border border-black/6 bg-[var(--surface-soft)] px-4 py-3">
            <input
              type="checkbox"
              checked={config.dnsOverTor}
              onChange={(event) =>
                setConfig({
                  ...config,
                  dnsOverTor: event.target.checked
                })
              }
              className="size-4 rounded border-black/20"
            />
            <span className="text-sm text-[var(--text-primary)]">
              {t("privateMode.dnsOverTor")}
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
              {t("privateMode.exitGeography")}
            </span>
            <input
              value={exitGeoInput}
              onChange={(event) => setExitGeoInput(event.target.value)}
              placeholder={t("privateMode.exitGeographyPlaceholder")}
              className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
            />
          </label>

          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
              {t("privateMode.enabledCategories")}
            </span>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {CATEGORY_OPTIONS.map((category) => (
                <label
                  key={category}
                  className="flex items-center gap-3 rounded-[18px] border border-black/6 bg-[var(--surface-soft)] px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={config.enabledCategories.includes(category)}
                    onChange={() => toggleCategory(category)}
                    className="size-4 rounded border-black/20"
                  />
                  <span className="text-sm text-[var(--text-primary)]">
                    {t(`enums.policyCategories.${category}`)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
              {t("privateMode.relayJson")}
            </span>
            <textarea
              value={relayJson}
              onChange={(event) => setRelayJson(event.target.value)}
              rows={8}
              className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 font-mono text-xs text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
            />
          </label>
        </Card>

        <div className="space-y-5">
          <Card className="bg-white/82">
            <p className="text-xs uppercase tracking-[0.24em] text-black/45">
              {t("privateMode.sessionTitle")}
            </p>
            <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.mode")}:
                </span>{" "}
                {active ? t("privateMode.active") : t("privateMode.inactive")}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.strategy")}:
                </span>{" "}
                {t(`privateMode.strategies.${config.outboundStrategy}`)}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.exitNodes")}:
                </span>{" "}
                {session?.exitNodes.join(", ") || t("privateMode.none")}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">
                  {t("privateMode.circuits")}:
                </span>{" "}
                {formatNumber(circuit?.circuitIds.length ?? 0)}
              </p>
              {session?.startedAt ? (
                <p>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t("privateMode.startedAt")}:
                  </span>{" "}
                  {formatDateTime(session.startedAt)}
                </p>
              ) : null}
              {circuit?.lastRotatedAt ? (
                <p>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t("privateMode.lastRotatedAt")}:
                  </span>{" "}
                  {formatDateTime(circuit.lastRotatedAt)}
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="bg-white/82">
            <p className="text-xs uppercase tracking-[0.24em] text-black/45">
              {t("privateMode.verificationTitle")}
            </p>
            {!verification ? (
              <p className="mt-4 text-sm text-[var(--text-secondary)]">
                {t("privateMode.noVerification")}
              </p>
            ) : (
              <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className={
                      verification.isCloaked
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }
                  >
                    {verification.isCloaked ? t("privateMode.cloaked") : t("privateMode.leaking")}
                  </Badge>
                  <Badge>
                    {verification.transportVerified
                      ? t("privateMode.assuranceStates.verified")
                      : t("privateMode.assuranceStates.review")}
                  </Badge>
                </div>
                <p>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t("privateMode.exitIp")}:
                  </span>{" "}
                  {verification.exitIdentity?.ip ?? verification.exitIp ?? t("privateMode.unknown")}
                </p>
                <p>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t("privateMode.verificationPath")}:
                  </span>{" "}
                  {t(`enums.policyCategories.${verification.verificationCategory}`)}
                </p>
                <p>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t("privateMode.leaks")}:
                  </span>{" "}
                  {verification.leaks.length === 0
                    ? t("privateMode.noLeaks")
                    : verification.leaks.map(translateLeak).join(", ")}
                </p>
              </div>
            )}
          </Card>

          <Card className="bg-white/82">
            <p className="text-xs uppercase tracking-[0.24em] text-black/45">
              {t("privateMode.leakTestTitle")}
            </p>
            {!leakTest ? (
              <p className="mt-4 text-sm text-[var(--text-secondary)]">
                {t("privateMode.noLeakTest")}
              </p>
            ) : (
              <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
                <p>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t("privateMode.testedAt")}:
                  </span>{" "}
                  {formatDateTime(leakTest.testedAt)}
                </p>
                <p>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t("privateMode.directIp")}:
                  </span>{" "}
                  {leakTest.directIdentity?.ip ?? leakTest.directIp ?? t("privateMode.unknown")}
                </p>
                <p>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t("privateMode.exitIp")}:
                  </span>{" "}
                  {leakTest.exitIdentity?.ip ?? leakTest.exitIp ?? t("privateMode.unknown")}
                </p>
                <p>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t("privateMode.exitRegion")}:
                  </span>{" "}
                  {formatIdentityLocation(leakTest.exitIdentity) ??
                    leakTest.exitRegion ??
                    t("privateMode.unknown")}
                </p>
                <p>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t("privateMode.dnsTransport")}:
                  </span>{" "}
                  {leakTest.dnsTransport}
                </p>
                <p>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t("privateMode.leaks")}:
                  </span>{" "}
                  {leakTest.leaks.length === 0
                    ? t("privateMode.noLeaks")
                    : leakTest.leaks.map(translateLeak).join(", ")}
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card className="bg-white/82">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-black/45">
            {t("privateMode.exitLogTitle")}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">
            {t("privateMode.exitLogHeading")}
          </h3>
        </div>

        {logs.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-black/10 bg-[var(--surface-soft)] px-4 py-4 text-sm text-[var(--text-secondary)]">
            {t("privateMode.noExitLogs")}
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="rounded-[18px] border border-black/6 bg-[var(--surface-soft)] px-4 py-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{log.requestType}</Badge>
                  <Badge>{log.targetHost}</Badge>
                  <Badge>{log.exitIp}</Badge>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)] md:grid-cols-3">
                  <p>{formatDateTime(log.timestamp)}</p>
                  <p>
                    {t("privateMode.exitRegion")}: {log.exitRegion}
                  </p>
                  <p>
                    {t("privateMode.sessionId")}: {log.sessionId}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

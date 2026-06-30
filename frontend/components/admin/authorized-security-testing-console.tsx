"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileKey2,
  FlaskConical,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";

import {
  checkDomainOwnershipVerification,
  getPrivateModeSession,
  getAuthorizedTestingDevModeStatus,
  getAuthorizedSecurityTestRun,
  listAdvancedPenetrationTestRuns,
  listAuthorizedSecurityTestRuns,
  listDomainOwnershipVerifications,
  runAuthorizedSecurityTest,
  streamAdvancedPenetrationTest,
  startDomainOwnershipVerification
} from "@/lib/api";
import {
  AdvancedPenetrationTestRunSummary,
  AuthorizedTestingDevModeStatus,
  AuthorizedApiVulnerabilityType,
  AuthorizedSecurityAdaptationUrgency,
  AuthorizedSecurityManualFormValidationInput,
  AuthorizedSecurityTestAuthEndpointDescriptorInput,
  AuthorizedSecurityFindingDisposition,
  AuthorizedSecurityFindingSeverity,
  AuthorizedSecurityTestModule,
  AuthorizedSecurityTestReport,
  AuthorizedSecurityTestRunStatus,
  AuthorizedSecurityTestRunSummary,
  DomainOwnershipVerificationMethod,
  DomainOwnershipVerificationStatus,
  DomainOwnershipVerificationSummary
} from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DevModeBypassToggle } from "@/components/admin/DevModeBypassToggle";

const MODULES: AuthorizedSecurityTestModule[] = [
  "sql_injection",
  "xss",
  "csrf",
  "authentication",
  "authorization",
  "api_security",
  "ssrf",
  "open_redirect",
  "business_logic",
  "oauth_flow",
  "waf",
  "session_management"
];

function normalizeTarget(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function extractHostname(value: string): string | null {
  const normalized = normalizeTarget(value);
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function requestedUrlForVerification(
  verification: DomainOwnershipVerificationSummary
) {
  const requestedUrl = verification.challengeDetails.requestedUrl;

  if (typeof requestedUrl === "string" && requestedUrl.trim()) {
    return normalizeTarget(requestedUrl);
  }

  return `https://${verification.hostname}`;
}

function defaultRunTargetForVerification(
  verification: DomainOwnershipVerificationSummary
) {
  return requestedUrlForVerification(verification);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function readStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function verificationStatusClass(status: DomainOwnershipVerificationStatus) {
  switch (status) {
    case "verified":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "expired":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
}

function verificationModeBadgeClass(
  mode?: DomainOwnershipVerificationSummary["verificationMode"]
) {
  switch (mode) {
    case "development_bypass":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "development_local":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function verificationModeLabel(
  mode?: DomainOwnershipVerificationSummary["verificationMode"]
) {
  switch (mode) {
    case "development_bypass":
      return "Dev bypass";
    case "development_local":
      return "Dev local";
    default:
      return "Standard";
  }
}

function matchesAllowedDevHostname(hostname: string, patterns: string[]) {
  const normalizedHostname = hostname.trim().toLowerCase();
  if (!normalizedHostname) {
    return false;
  }

  return patterns.some((pattern) => {
    const normalizedPattern = pattern.trim().toLowerCase();
    if (!normalizedPattern) {
      return false;
    }

    if (!normalizedPattern.startsWith("*.")) {
      return normalizedHostname === normalizedPattern;
    }

    const suffix = normalizedPattern.slice(1);
    const bareDomain = normalizedPattern.slice(2);
    return (
      normalizedHostname === bareDomain ||
      normalizedHostname.endsWith(suffix)
    );
  });
}

function runStatusClass(status: AuthorizedSecurityTestRunStatus | "queued") {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "running":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "queued":
    case "planned":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
}

function advancedRunStatusLabel(
  status: AdvancedPenetrationTestRunSummary["status"]
) {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    default:
      return "Failed";
  }
}

function advancedEventTypeLabel(type: string) {
  switch (type) {
    case "status":
      return "Status";
    case "phase":
      return "Phase";
    case "finding":
      return "Finding";
    case "decision":
      return "Decision";
    case "evidence":
      return "Evidence";
    case "attack":
      return "Attack";
    case "report":
      return "Report";
    case "audit":
      return "Audit";
    case "error":
      return "Error";
    case "complete":
      return "Complete";
    default:
      return "Update";
  }
}

function riskBadgeClass(
  riskLevel:
    | AuthorizedSecurityTestReport["summary"]["riskLevel"]
    | AuthorizedSecurityTestRunSummary["riskLevel"]
) {
  switch (riskLevel) {
    case "critical":
      return "border-red-200 bg-red-50 text-red-700";
    case "high":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

function severityBadgeClass(severity: AuthorizedSecurityFindingSeverity) {
  switch (severity) {
    case "high":
      return "border-red-200 bg-red-50 text-red-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "low":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function validationBadgeClass(disposition: AuthorizedSecurityFindingDisposition) {
  switch (disposition) {
    case "confirmed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "needs_review":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function likelihoodBadgeClass(
  likelihood: AuthorizedSecurityTestReport["aiAnalysis"]["predictions"][number]["likelihood"]
) {
  switch (likelihood) {
    case "high":
      return "border-red-200 bg-red-50 text-red-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

function sourceBadgeClass(source?: "ai" | "heuristic") {
  switch (source) {
    case "ai":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "heuristic":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function urgencyBadgeClass(urgency: AuthorizedSecurityAdaptationUrgency) {
  switch (urgency) {
    case "high":
      return "border-red-200 bg-red-50 text-red-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

function attackPathClass(status: AuthorizedSecurityTestReport["attackPaths"][number]["status"]) {
  switch (status) {
    case "exposed":
      return "border-red-200 bg-red-50/80";
    case "constrained":
      return "border-amber-200 bg-amber-50/80";
    default:
      return "border-emerald-200 bg-emerald-50/80";
  }
}

function methodLabel(
  method: DomainOwnershipVerificationMethod,
  t: ReturnType<typeof useI18n>["t"]
) {
  return t(`authorizedTesting.methods.${method}`);
}

function moduleLabel(
  module: AuthorizedSecurityTestModule,
  t: ReturnType<typeof useI18n>["t"]
) {
  return t(`authorizedTesting.modules.${module}`);
}

function apiVulnerabilityLabel(
  vulnerabilityType: AuthorizedApiVulnerabilityType,
  t: ReturnType<typeof useI18n>["t"]
) {
  return t(`authorizedTesting.vulnerabilityTypes.${vulnerabilityType}`);
}

function parseAuthProfilePayload(
  raw: string,
  messages: {
    objectRequired: string;
    stringMapRequired: string;
  }
): {
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
} | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(messages.objectRequired);
  }

  if ("headers" in parsed && parsed.headers !== undefined && !isStringRecord(parsed.headers)) {
    throw new Error(messages.stringMapRequired);
  }

  if ("cookies" in parsed && parsed.cookies !== undefined && !isStringRecord(parsed.cookies)) {
    throw new Error(messages.stringMapRequired);
  }

  return {
    headers: isStringRecord(parsed.headers) ? parsed.headers : undefined,
    cookies: isStringRecord(parsed.cookies) ? parsed.cookies : undefined
  };
}

function parseAuthEndpointDescriptorPayload(
  raw: string,
  messages: {
    arrayRequired: string;
    objectRequired: string;
    stringArrayRequired: string;
    requiredFieldError: string;
  }
): AuthorizedSecurityTestAuthEndpointDescriptorInput[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(messages.arrayRequired);
  }

  return parsed.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error(messages.objectRequired);
    }

    const name = readStringValue(entry.name);
    const entryUrl = readStringValue(entry.entryUrl);
    const endpoint = readStringValue(entry.endpoint);

    if (!name || !entryUrl || !endpoint || !isStringArray(entry.fields)) {
      throw new Error(messages.requiredFieldError);
    }

    if (
      entry.tokenFields !== undefined &&
      !isStringArray(entry.tokenFields)
    ) {
      throw new Error(messages.stringArrayRequired);
    }

    const fields = entry.fields.map((field) => field.trim()).filter(Boolean);
    if (fields.length === 0) {
      throw new Error(messages.requiredFieldError);
    }

    return {
      type: "auth_api",
      name,
      entryUrl,
      endpoint,
      method: entry.method === "POST" ? "POST" : undefined,
      contentType: readStringValue(entry.contentType) ?? undefined,
      fields,
      tokenFields:
        entry.tokenFields?.map((field) => field.trim()).filter(Boolean) ??
        undefined,
      stagingOnly:
        typeof entry.stagingOnly === "boolean" ? entry.stagingOnly : undefined,
      productionMode:
        entry.productionMode === "passive_only"
          ? "passive_only"
          : undefined
      };
  });
}

function parseManualCredentialLabels(raw: string): string[] {
  return [...new Set(raw.split(/[\r\n,]+/).map((label) => label.trim()).filter(Boolean))];
}

export function AuthorizedSecurityTestingConsole() {
  const router = useRouter();
  const { formatDateTime, formatNumber, t } = useI18n();
  const [verificationTarget, setVerificationTarget] = useState("");
  const [verificationMethod, setVerificationMethod] =
    useState<DomainOwnershipVerificationMethod>("dns_txt");
  const [verifications, setVerifications] = useState<
    DomainOwnershipVerificationSummary[]
  >([]);
  const [selectedVerificationId, setSelectedVerificationId] = useState("");
  const [devModeStatus, setDevModeStatus] =
    useState<AuthorizedTestingDevModeStatus | null>(null);
  const [useDevModeBypass, setUseDevModeBypass] = useState(true);

  const [runTarget, setRunTarget] = useState("");
  const [maxPages, setMaxPages] = useState(4);
  const [maxRequests, setMaxRequests] = useState(18);
  const [selectedModules, setSelectedModules] =
    useState<AuthorizedSecurityTestModule[]>(MODULES);
  const [includeAuthProfiles, setIncludeAuthProfiles] = useState(false);
  const [lowPrivilegeProfile, setLowPrivilegeProfile] = useState("");
  const [highPrivilegeProfile, setHighPrivilegeProfile] = useState("");
  const [authEndpointDescriptorPayload, setAuthEndpointDescriptorPayload] =
    useState("");
  const [manualFormValidationEnabled, setManualFormValidationEnabled] =
    useState(false);
  const [manualFormRateLimitPerMinute, setManualFormRateLimitPerMinute] =
    useState(5);
  const [manualFormCredentialLabels, setManualFormCredentialLabels] =
    useState("");
  const [manualFormNotes, setManualFormNotes] = useState("");

  const [runs, setRuns] = useState<AuthorizedSecurityTestRunSummary[]>([]);
  const [advancedRuns, setAdvancedRuns] = useState<
    AdvancedPenetrationTestRunSummary[]
  >([]);
  const [report, setReport] = useState<AuthorizedSecurityTestReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [privateModeActive, setPrivateModeActive] = useState<boolean | null>(null);
  const [privateModeReady, setPrivateModeReady] = useState<boolean | null>(null);
  const [privateModeVerificationError, setPrivateModeVerificationError] = useState<
    string | null
  >(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingVerification, setIsCreatingVerification] = useState(false);
  const [checkingVerificationId, setCheckingVerificationId] = useState<string | null>(
    null
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isAdvancedRunning, setIsAdvancedRunning] = useState(false);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [loadingAdvancedRunId, setLoadingAdvancedRunId] = useState<string | null>(
    null
  );
  const [advancedStreamRunId, setAdvancedStreamRunId] = useState<string | null>(null);
  const [advancedStreamStatus, setAdvancedStreamStatus] = useState<
    AdvancedPenetrationTestRunSummary["status"] | null
  >(null);
  const [advancedStreamSummary, setAdvancedStreamSummary] = useState<string | null>(
    null
  );
  const [advancedStreamEvents, setAdvancedStreamEvents] = useState<
    Array<{
      id: string;
      type: string;
      phase: string;
      message: string;
      timestamp: string;
    }>
  >([]);
  const isBusy =
    isRefreshing ||
    isCreatingVerification ||
    isRunning ||
    isAdvancedRunning ||
    checkingVerificationId !== null ||
    loadingRunId !== null ||
    loadingAdvancedRunId !== null;

  const selectedVerification = useMemo(
    () =>
      verifications.find((verification) => verification.id === selectedVerificationId) ??
      null,
    [selectedVerificationId, verifications]
  );
  const canUseDevModeBypass =
    devModeStatus?.available === true && devModeStatus.bypassVerification;
  const runTargetHostname = extractHostname(runTarget);
  const runTargetIsAllowlisted =
    runTargetHostname !== null &&
    matchesAllowedDevHostname(
      runTargetHostname,
      devModeStatus?.allowedDomains ?? []
    );
  const selectedVerificationIsAllowlisted =
    selectedVerification !== null &&
    matchesAllowedDevHostname(
      selectedVerification.hostname,
      devModeStatus?.allowedDomains ?? []
    );
  const selectedVerificationReadyThroughBypass =
    Boolean(selectedVerification) &&
    selectedVerification?.status !== "verified" &&
    useDevModeBypass &&
    canUseDevModeBypass &&
    selectedVerificationIsAllowlisted;
  const implicitDevelopmentRunReady =
    useDevModeBypass &&
    canUseDevModeBypass &&
    runTargetIsAllowlisted;
  const canRunSelectedVerification =
    selectedVerification?.status === "verified" ||
    selectedVerificationReadyThroughBypass;
  const shouldUseImplicitDevelopmentVerification =
    implicitDevelopmentRunReady && !canRunSelectedVerification;
  const canRunRequest = canRunSelectedVerification || implicitDevelopmentRunReady;
  const privateModeBlockedMessage =
    privateModeActive === true
      ? t("privateMode.verifiedRequiredForSecurityModules")
      : t("privateMode.requiredForSecurityModules");
  const privateModeActionMessage =
    privateModeActive === true
      ? t("privateMode.verifyBeforeSecurityTools")
      : t("privateMode.activateBeforeSecurityTools");

  useEffect(() => {
    void loadActivity();
  }, []);

  useEffect(() => {
    if (!canUseDevModeBypass && useDevModeBypass) {
      setUseDevModeBypass(false);
    }
  }, [canUseDevModeBypass, useDevModeBypass]);

  async function loadActivity() {
    setIsRefreshing(true);
    setError(null);

    try {
      const [
        verificationItems,
        runItems,
        advancedRunItems,
        nextDevModeStatus,
        privateModeState
      ] = await Promise.all([
        listDomainOwnershipVerifications(),
        listAuthorizedSecurityTestRuns(),
        listAdvancedPenetrationTestRuns(),
        getAuthorizedTestingDevModeStatus(),
        getPrivateModeSession()
      ]);
      setVerifications(verificationItems);
      setRuns(runItems);
      setAdvancedRuns(advancedRunItems);
      setDevModeStatus(nextDevModeStatus);
      setPrivateModeActive(Boolean(privateModeState.session));
      setPrivateModeReady(privateModeState.routeVerified);
      setPrivateModeVerificationError(privateModeState.verificationError);

      if (!nextDevModeStatus.available) {
        setUseDevModeBypass(false);
      }

      if (!selectedVerificationId && verificationItems[0]) {
        setSelectedVerificationId(verificationItems[0].id);
        setVerificationTarget(
          (current) => current || requestedUrlForVerification(verificationItems[0]!)
        );
        setRunTarget(
          (current) => current || defaultRunTargetForVerification(verificationItems[0]!)
        );
      }

      if (!report && runItems[0]) {
        const latestReport = await getAuthorizedSecurityTestRun(runItems[0].runId);
        setReport(latestReport);
      }
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : t("authorizedTesting.refreshFailed")
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleCreateVerification() {
    const target = normalizeTarget(verificationTarget);

    if (privateModeReady !== true) {
      setError(privateModeBlockedMessage);
      return;
    }

    if (!target) {
      setError(t("authorizedTesting.targetRequired"));
      return;
    }

    setIsCreatingVerification(true);
    setError(null);

    try {
      const verification = await startDomainOwnershipVerification({
        target,
        method: verificationMethod,
        devModeBypass: useDevModeBypass
      });
      setVerifications((current) => [
        verification,
        ...current.filter((item) => item.id !== verification.id)
      ]);
      setSelectedVerificationId(verification.id);
      setVerificationTarget(requestedUrlForVerification(verification));
      setRunTarget(defaultRunTargetForVerification(verification));
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("authorizedTesting.verificationFailed")
      );
    } finally {
      setIsCreatingVerification(false);
    }
  }

  async function handleCheckVerification(verificationId: string) {
    if (privateModeReady !== true) {
      setError(privateModeBlockedMessage);
      return;
    }

    setCheckingVerificationId(verificationId);
    setError(null);

    try {
      const verification = await checkDomainOwnershipVerification(
        verificationId,
        useDevModeBypass
      );
      setVerifications((current) =>
        current.map((item) => (item.id === verification.id ? verification : item))
      );
      if (selectedVerificationId === verification.id) {
        setVerificationTarget(
          (current) => current || requestedUrlForVerification(verification)
        );
        setRunTarget(
          (current) => current || defaultRunTargetForVerification(verification)
        );
      }
    } catch (checkError) {
      setError(
        checkError instanceof Error
          ? checkError.message
          : t("authorizedTesting.verificationCheckFailed")
      );
    } finally {
      setCheckingVerificationId(null);
    }
  }

  async function handleLoadRun(runId: string) {
    setLoadingRunId(runId);
    setError(null);

    try {
      router.push(`/admin/authorized-testing/runs/${runId}`);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("authorizedTesting.reportLoadFailed")
      );
    } finally {
      setLoadingRunId(null);
    }
  }

  async function handleLoadAdvancedRun(runId: string) {
    setLoadingAdvancedRunId(runId);
    setError(null);

    try {
      router.push(`/admin/authorized-testing/advanced-runs/${runId}`);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load the advanced penetration test run."
      );
    } finally {
      setLoadingAdvancedRunId(null);
    }
  }

  function buildAuthProfiles() {
    const authProfiles: NonNullable<
      Parameters<typeof streamAdvancedPenetrationTest>[0]["authProfiles"]
    > = [];
    const profileErrorMessages = {
      objectRequired: t("authorizedTesting.profileJsonObjectError"),
      stringMapRequired: t("authorizedTesting.profileJsonStringMapError")
    };

    if (includeAuthProfiles) {
      const lowProfile = parseAuthProfilePayload(
        lowPrivilegeProfile,
        profileErrorMessages
      );
      if (lowProfile) {
        authProfiles.push({
          name: "low-privilege",
          role: "low_privilege" as const,
          ...lowProfile
        });
      }

      const highProfile = parseAuthProfilePayload(
        highPrivilegeProfile,
        profileErrorMessages
      );
      if (highProfile) {
        authProfiles.push({
          name: "high-privilege",
          role: "high_privilege" as const,
          ...highProfile
        });
      }
    }

    return authProfiles;
  }

  function buildAuthEndpointDescriptors() {
    return parseAuthEndpointDescriptorPayload(authEndpointDescriptorPayload, {
      arrayRequired: t("authorizedTesting.authEndpointDescriptorArrayError"),
      objectRequired: t("authorizedTesting.authEndpointDescriptorObjectError"),
      stringArrayRequired: t(
        "authorizedTesting.authEndpointDescriptorStringArrayError"
      ),
      requiredFieldError: t(
        "authorizedTesting.authEndpointDescriptorRequiredFieldError"
      )
    });
  }

  function buildManualFormValidation():
    | AuthorizedSecurityManualFormValidationInput
    | undefined {
    if (!manualFormValidationEnabled) {
      return undefined;
    }

    const credentialLabels = parseManualCredentialLabels(
      manualFormCredentialLabels
    );
    if (credentialLabels.length === 0) {
      throw new Error(t("authorizedTesting.manualFormValidationCredentialRequired"));
    }

    const normalizedRateLimit = Math.max(
      1,
      Math.min(60, Math.trunc(manualFormRateLimitPerMinute || 5))
    );
    const notes = manualFormNotes.trim();

    return {
      rateLimitPerMinute: normalizedRateLimit,
      credentialLabels,
      ...(notes ? { notes } : {})
    };
  }

  async function handleRun() {
    const target = normalizeTarget(runTarget);

    if (privateModeReady !== true) {
      setError(privateModeBlockedMessage);
      return;
    }

    if (!canRunSelectedVerification && !implicitDevelopmentRunReady) {
      setError(t("authorizedTesting.verificationSelectionRequired"));
      return;
    }

    if (!target) {
      setError(t("authorizedTesting.targetRequired"));
      return;
    }

    if (selectedModules.length === 0) {
      setError(t("authorizedTesting.moduleSelectionRequired"));
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const authProfiles = buildAuthProfiles();
      const authEndpointDescriptors = buildAuthEndpointDescriptors();
      const manualFormValidation = buildManualFormValidation();
      if (manualFormValidation && authEndpointDescriptors.length === 0) {
        throw new Error(
          "Add at least one declared auth endpoint before enabling manual POST form validation."
        );
      }
      const nextReport = await runAuthorizedSecurityTest({
        verificationId: shouldUseImplicitDevelopmentVerification
          ? undefined
          : selectedVerificationId || undefined,
        url: target,
        maxPages,
        maxRequests,
        devModeBypass: useDevModeBypass,
        modules: selectedModules,
        authProfiles,
        authEndpointDescriptors,
        manualFormValidation
      });
      setReport(nextReport);
      const nextRuns = await listAuthorizedSecurityTestRuns();
      setRuns(nextRuns);
      router.push(`/admin/authorized-testing/runs/${nextReport.runId}`);
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : t("authorizedTesting.runFailed")
      );
    } finally {
      setIsRunning(false);
    }
  }

  async function handleAdvancedRun() {
    const target = normalizeTarget(runTarget);

    if (privateModeReady !== true) {
      setError(privateModeBlockedMessage);
      return;
    }

    if (!selectedVerificationId || selectedVerification?.status !== "verified") {
      setError(
        "Advanced AI penetration tests require an explicit verified ownership challenge."
      );
      return;
    }

    if (!target) {
      setError(t("authorizedTesting.targetRequired"));
      return;
    }

    setIsAdvancedRunning(true);
    setError(null);
    setAdvancedStreamRunId(null);
    setAdvancedStreamStatus("queued");
    setAdvancedStreamSummary("Preparing the orchestrator and validating guardrails.");
    setAdvancedStreamEvents([]);

    let completedRunId: string | null = null;

    try {
      const authProfiles = buildAuthProfiles();
      const authEndpointDescriptors = buildAuthEndpointDescriptors();
      const manualFormValidation = buildManualFormValidation();
      if (manualFormValidation && authEndpointDescriptors.length === 0) {
        throw new Error(
          "Add at least one declared auth endpoint before enabling manual POST form validation."
        );
      }
      await streamAdvancedPenetrationTest({
        target,
        verificationId: selectedVerificationId,
        maxPages,
        maxRequests,
        authProfiles,
        authEndpointDescriptors,
        manualFormValidation,
        onEvent: (eventName, payload) => {
          if (!isRecord(payload)) {
            return;
          }

          if (eventName === "started") {
            const runId = readStringValue(payload.runId);
            const message =
              readStringValue(payload.message) ??
              "Advanced AI penetration test started.";

            if (runId) {
              setAdvancedStreamRunId(runId);
            }
            setAdvancedStreamStatus("running");
            setAdvancedStreamSummary(message);
            setAdvancedStreamEvents((current) => [
              {
                id: runId ?? `started-${Date.now()}`,
                type: "status",
                phase: "recon",
                message,
                timestamp:
                  readStringValue(payload.timestamp) ?? new Date().toISOString()
              },
              ...current
            ]);
            return;
          }

          if (eventName === "update") {
            const phase = readStringValue(payload.phase) ?? "run";
            const type = readStringValue(payload.type) ?? "update";
            const message =
              readStringValue(payload.message) ?? "Advanced run update received.";
            const timestamp =
              readStringValue(payload.timestamp) ?? new Date().toISOString();
            const runId = readStringValue(payload.runId);

            if (runId) {
              setAdvancedStreamRunId(runId);
            }

            setAdvancedStreamStatus("running");
            setAdvancedStreamSummary(message);
            setAdvancedStreamEvents((current) => [
              {
                id:
                  readStringValue(payload.id) ??
                  `${type}-${timestamp}-${current.length}`,
                type,
                phase,
                message,
                timestamp
              },
              ...current
            ].slice(0, 14));
            return;
          }

          if (eventName === "finished") {
            const run = isRecord(payload.run) ? payload.run : null;
            const runId =
              readStringValue(run?.runId) ?? readStringValue(payload.runId);
            completedRunId = runId;
            if (runId) {
              setAdvancedStreamRunId(runId);
            }
            setAdvancedStreamStatus("completed");
            setAdvancedStreamSummary(
              readStringValue(payload.message) ??
                "Advanced AI penetration test completed."
            );
            return;
          }

          if (eventName === "error") {
            setAdvancedStreamStatus("failed");
            setAdvancedStreamSummary(
              readStringValue(payload.error) ??
                "Advanced AI penetration test failed."
            );
          }
        }
      });

      const nextAdvancedRuns = await listAdvancedPenetrationTestRuns();
      setAdvancedRuns(nextAdvancedRuns);

      if (completedRunId) {
        router.push(`/admin/authorized-testing/advanced-runs/${completedRunId}`);
      }
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "Advanced AI penetration test failed."
      );

      try {
        const nextAdvancedRuns = await listAdvancedPenetrationTestRuns();
        setAdvancedRuns(nextAdvancedRuns);
      } catch {
        // Keep the latest visible state if the refresh fails.
      }
    } finally {
      setIsAdvancedRunning(false);
    }
  }

  function resetForFreshStart() {
    setVerificationTarget("");
    setVerificationMethod("dns_txt");
    setSelectedVerificationId("");
    setRunTarget("");
    setMaxPages(4);
    setMaxRequests(18);
    setSelectedModules([...MODULES]);
    setIncludeAuthProfiles(false);
    setUseDevModeBypass(canUseDevModeBypass);
    setLowPrivilegeProfile("");
    setHighPrivilegeProfile("");
    setAuthEndpointDescriptorPayload("");
    setReport(null);
    setAdvancedStreamRunId(null);
    setAdvancedStreamStatus(null);
    setAdvancedStreamSummary(null);
    setAdvancedStreamEvents([]);
    setError(null);
  }

  function toggleModule(module: AuthorizedSecurityTestModule) {
    setSelectedModules((current) =>
      current.includes(module)
        ? current.filter((entry) => entry !== module)
        : [...current, module]
    );
  }

  return (
    <Card className="space-y-5 bg-white/82">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-black/45">
            {t("authorizedTesting.label")}
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">
            {t("authorizedTesting.title")}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
            {t("authorizedTesting.description")}
          </p>
        </div>
        <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 lg:max-w-md">
          <p className="font-semibold text-amber-900">
            {t("authorizedTesting.boundaryTitle")}
          </p>
          <p className="mt-2 leading-6">
            {t("authorizedTesting.boundaryDescription")}
          </p>
        </div>
      </div>

      {privateModeReady === false ? (
        <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
          <p className="font-semibold text-red-900">
            {privateModeBlockedMessage}
          </p>
          <p className="mt-2 leading-6">
            {privateModeActionMessage}{" "}
            <Link href="/admin/private-mode" className="font-semibold underline">
              {t("privateMode.openConsole")}
            </Link>
          </p>
          {privateModeVerificationError ? (
            <p className="mt-2 leading-6 text-red-700">
              {privateModeVerificationError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[22px] border border-[#1a78cf]/12 bg-[linear-gradient(135deg,rgba(21,167,243,0.10)_0%,rgba(13,123,213,0.04)_100%)] p-4">
          <div className="flex items-center gap-2">
            <FileKey2 className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t("authorizedTesting.verificationTitle")}
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {t("authorizedTesting.verificationDescription")}
          </p>
        </div>
        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t("authorizedTesting.readOnlyTitle")}
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {t("authorizedTesting.readOnlyDescription")}
          </p>
        </div>
      </div>

      <div className="rounded-[24px] border border-black/6 bg-[var(--surface-soft)] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg">🧭</span>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Quick steps
          </p>
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Follow these three steps in order. The status below updates as you fill the form.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-[20px] border border-black/6 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                1. 🌐 Enter the target URL
              </p>
              <Badge
                className={
                  verificationTarget.trim()
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-100 text-slate-700"
                }
              >
                {verificationTarget.trim() ? "Ready" : "Waiting"}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              Add the exact application URL you want to test. In development, an allowlisted hostname can run immediately without a pre-created challenge.
            </p>
          </div>
          <div className="rounded-[20px] border border-black/6 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                2. 🔐 Verify or bypass in dev
              </p>
              <Badge
                className={
                  selectedVerification?.status === "verified" ||
                  selectedVerificationReadyThroughBypass ||
                  implicitDevelopmentRunReady
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }
              >
                {selectedVerification?.status === "verified" ||
                selectedVerificationReadyThroughBypass ||
                implicitDevelopmentRunReady
                  ? "Ready"
                  : "Action needed"}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              {selectedVerification?.status === "verified"
                ? "This hostname is already verified."
                : implicitDevelopmentRunReady
                  ? "Development fast path is active. The backend will create an implicit dev verification when you run the test."
                : selectedVerificationReadyThroughBypass
                  ? "Developer bypass is armed for this hostname. You can run now or press Check status to convert it to a dev-bypass verification."
                  : canUseDevModeBypass
                    ? "Keep development bypass enabled for an allowlisted hostname, or complete the DNS / HTTP file / HTML meta challenge."
                    : "Complete the DNS / HTTP file / HTML meta challenge before running the test."}
            </p>
          </div>
          <div className="rounded-[20px] border border-black/6 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                3. 🚀 Run the guarded test
              </p>
              <Badge
                className={
                  canRunRequest
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-100 text-slate-700"
                }
              >
                {canRunRequest ? "Enabled" : "Locked"}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              In development, the run button can unlock immediately for an allowlisted hostname. Outside that path, the button unlocks after verification is ready.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)]">
        <div className="space-y-5">
          <div className="rounded-[24px] border border-black/6 bg-[var(--surface-soft)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-black/45">
                  {t("authorizedTesting.challengeSetup")}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                  {t("authorizedTesting.createChallenge")}
                </h3>
                {canUseDevModeBypass ? (
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Optional in development. You can still create a challenge manually, but allowlisted hostnames can run immediately while development bypass is enabled.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={resetForFreshStart}
                  disabled={isBusy}
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <RefreshCcw className="size-4" />
                  {t("authorizedTesting.startFresh")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void loadActivity();
                  }}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <RefreshCcw className={cn("size-4", isRefreshing && "animate-spin")} />
                  {t("authorizedTesting.refresh")}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                  {t("authorizedTesting.targetLabel")}
                </span>
                <input
                  value={verificationTarget}
                  onChange={(event) => setVerificationTarget(event.target.value)}
                  placeholder={t("authorizedTesting.targetPlaceholder")}
                  className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                  {t("authorizedTesting.methodLabel")}
                </span>
                <select
                  value={verificationMethod}
                  onChange={(event) =>
                    setVerificationMethod(
                      event.target.value as DomainOwnershipVerificationMethod
                    )
                  }
                  className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                >
                  <option value="dns_txt">{methodLabel("dns_txt", t)}</option>
                  <option value="http_file">{methodLabel("http_file", t)}</option>
                  <option value="html_meta">{methodLabel("html_meta", t)}</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => {
                  void handleCreateVerification();
                }}
                disabled={isCreatingVerification || privateModeReady !== true}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <ClipboardCheck className="size-4" />
                {isCreatingVerification
                  ? t("authorizedTesting.creatingChallenge")
                  : t("authorizedTesting.createChallenge")}
              </button>
            </div>

            <div className="mt-5">
              <DevModeBypassToggle
                checked={useDevModeBypass}
                disabled={isBusy}
                status={devModeStatus}
                onChange={setUseDevModeBypass}
              />
            </div>

            {selectedVerification ? (
              <div className="mt-5 rounded-[22px] border border-black/6 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={verificationStatusClass(selectedVerification.status)}>
                    {t(`authorizedTesting.statuses.${selectedVerification.status}`)}
                  </Badge>
                  <Badge>{methodLabel(selectedVerification.method, t)}</Badge>
                  <Badge
                    className={verificationModeBadgeClass(
                      selectedVerification.verificationMode
                    )}
                  >
                    {verificationModeLabel(selectedVerification.verificationMode)}
                  </Badge>
                  {selectedVerification.bypassActive ? (
                    <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                      Bypass active
                    </Badge>
                  ) : null}
                  <span className="text-xs uppercase tracking-[0.18em] text-black/45">
                    {selectedVerification.hostname}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {t("authorizedTesting.challengeToken")}:{" "}
                  <span className="font-mono text-[var(--text-primary)]">
                    {selectedVerification.challengeToken}
                  </span>
                </p>
                <div className="mt-4 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {selectedVerification.instructions.map((instruction) => (
                    <p key={instruction}>{instruction}</p>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-black/45">
                  <span>
                    {t("authorizedTesting.expiresAt")}:{" "}
                    {formatDateTime(selectedVerification.expiresAt)}
                  </span>
                  {selectedVerification.verifiedAt ? (
                    <span>
                      {t("authorizedTesting.verifiedAt")}:{" "}
                      {formatDateTime(selectedVerification.verifiedAt)}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-black/6 bg-[var(--surface-soft)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-black/45">
              {t("authorizedTesting.runConfig")}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
              {t("authorizedTesting.startRun")}
            </h3>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                  {t("authorizedTesting.selectedVerification")}
                  {canUseDevModeBypass ? " (optional in dev)" : ""}
                </span>
                <select
                  value={selectedVerificationId}
                  onChange={(event) => {
                    const verificationId = event.target.value;
                    setSelectedVerificationId(verificationId);
                    const verification = verifications.find(
                      (item) => item.id === verificationId
                    );
                    if (verification) {
                      setVerificationTarget(requestedUrlForVerification(verification));
                      setRunTarget(defaultRunTargetForVerification(verification));
                    }
                  }}
                  className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                >
                  <option value="">{t("authorizedTesting.selectVerification")}</option>
                  {verifications.map((verification) => (
                    <option key={verification.id} value={verification.id}>
                      {verification.hostname} /{" "}
                      {t(`authorizedTesting.statuses.${verification.status}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                  {t("authorizedTesting.targetLabel")}
                </span>
                <input
                  value={runTarget}
                  onChange={(event) => setRunTarget(event.target.value)}
                  placeholder={t("authorizedTesting.targetPlaceholder")}
                  className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                    {t("authorizedTesting.maxPages")}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={maxPages}
                    onChange={(event) => setMaxPages(Number(event.target.value) || 1)}
                    className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                    {t("authorizedTesting.maxRequests")}
                  </span>
                  <input
                    type="number"
                    min={6}
                    max={40}
                    value={maxRequests}
                    onChange={(event) => setMaxRequests(Number(event.target.value) || 6)}
                    className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                  />
                </label>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                {t("authorizedTesting.modulesLabel")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {MODULES.map((module) => {
                  const active = selectedModules.includes(module);

                  return (
                    <button
                      key={module}
                      type="button"
                      onClick={() => toggleModule(module)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-medium transition",
                        active
                          ? "border-[#1a78cf]/30 bg-[linear-gradient(135deg,rgba(21,167,243,0.18)_0%,rgba(13,123,213,0.08)_100%)] text-[var(--text-primary)]"
                          : "border-black/10 bg-white text-[var(--text-secondary)] hover:bg-black/[0.03]"
                      )}
                    >
                      {moduleLabel(module, t)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                The module checklist only applies to the bounded validator. The
                advanced AI path plans its own read-only chain from reconnaissance,
                findings, and the remaining request budget.
              </p>
            </div>

            <div className="mt-5 rounded-[22px] border border-black/6 bg-white p-4">
              <label className="flex items-center gap-3 text-sm font-semibold text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={includeAuthProfiles}
                  onChange={(event) => setIncludeAuthProfiles(event.target.checked)}
                  className="size-4 rounded border-black/15"
                />
                {t("authorizedTesting.includeProfiles")}
              </label>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {t("authorizedTesting.profileDescription")}
              </p>

              {includeAuthProfiles ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                      {t("authorizedTesting.lowPrivilegeProfile")}
                    </span>
                    <textarea
                      value={lowPrivilegeProfile}
                      onChange={(event) => setLowPrivilegeProfile(event.target.value)}
                      placeholder={t("authorizedTesting.profilePlaceholder")}
                      className="mt-2 min-h-36 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                      {t("authorizedTesting.highPrivilegeProfile")}
                    </span>
                    <textarea
                      value={highPrivilegeProfile}
                      onChange={(event) => setHighPrivilegeProfile(event.target.value)}
                      placeholder={t("authorizedTesting.profilePlaceholder")}
                      className="mt-2 min-h-36 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="mt-5 rounded-[22px] border border-black/6 bg-white p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t("authorizedTesting.authEndpointDescriptors")}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {t("authorizedTesting.authEndpointDescriptorDescription")}
              </p>
              <textarea
                value={authEndpointDescriptorPayload}
                onChange={(event) =>
                  setAuthEndpointDescriptorPayload(event.target.value)
                }
                placeholder={t(
                  "authorizedTesting.authEndpointDescriptorPlaceholder"
                )}
                className="mt-4 min-h-40 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
              />
            </div>

            <div className="mt-5 rounded-[22px] border border-black/6 bg-white p-4">
              <label className="flex items-center gap-3 text-sm font-semibold text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={manualFormValidationEnabled}
                  onChange={(event) =>
                    setManualFormValidationEnabled(event.target.checked)
                  }
                  className="size-4 rounded border-black/15"
                />
                {t("authorizedTesting.manualFormValidation")}
              </label>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {t("authorizedTesting.manualFormValidationDescription")}
              </p>

              {manualFormValidationEnabled ? (
                <div className="mt-4 grid gap-4">
                  <label className="block sm:max-w-xs">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                      {t("authorizedTesting.manualFormValidationRateLimit")}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={manualFormRateLimitPerMinute}
                      onChange={(event) =>
                        setManualFormRateLimitPerMinute(
                          Number(event.target.value) || 1
                        )
                      }
                      className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                      {t(
                        "authorizedTesting.manualFormValidationCredentialLabels"
                      )}
                    </span>
                    <textarea
                      value={manualFormCredentialLabels}
                      onChange={(event) =>
                        setManualFormCredentialLabels(event.target.value)
                      }
                      placeholder={t(
                        "authorizedTesting.manualFormValidationCredentialPlaceholder"
                      )}
                      className="mt-2 min-h-28 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                      {t("authorizedTesting.manualFormValidationNotes")}
                    </span>
                    <textarea
                      value={manualFormNotes}
                      onChange={(event) => setManualFormNotes(event.target.value)}
                      placeholder={t(
                        "authorizedTesting.manualFormValidationNotesPlaceholder"
                      )}
                      className="mt-2 min-h-24 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35"
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-[var(--text-secondary)]">
                {selectedVerification?.status === "verified" ? (
                  <span>{t("authorizedTesting.verifiedReady")}</span>
                ) : implicitDevelopmentRunReady ? (
                  <span>
                    Development fast path is active. Press Run test and the backend
                    will create an implicit dev verification automatically.
                  </span>
                ) : selectedVerificationReadyThroughBypass ? (
                  <span>
                    Developer bypass is armed for this hostname. You can run now, or
                    press Check status to mark it as a development bypass verification.
                  </span>
                ) : useDevModeBypass &&
                  canUseDevModeBypass &&
                  selectedVerification &&
                  !selectedVerificationIsAllowlisted ? (
                  <span>
                    This hostname is not in the development bypass allowlist. Use a
                    standard verification challenge or expand
                    `VERIFICATION_BYPASS_ALLOWED_DOMAINS`.
                  </span>
                ) : useDevModeBypass && canUseDevModeBypass ? (
                  <span>
                    Development bypass is enabled for this session. Create or re-check
                    an allowlisted development hostname to auto-verify it.
                  </span>
                ) : (
                  <span>{t("authorizedTesting.verificationRequiredHint")}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void handleAdvancedRun();
                  }}
                  disabled={
                    isAdvancedRunning ||
                    !selectedVerificationId ||
                    selectedVerification?.status !== "verified" ||
                    privateModeReady !== true
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <ShieldAlert className="size-4" />
                  {isAdvancedRunning
                    ? "Running advanced AI test..."
                    : "Run advanced AI test"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleRun();
                  }}
                  disabled={isRunning || !canRunRequest || privateModeReady !== true}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <FlaskConical className="size-4" />
                  {isRunning ? t("authorizedTesting.running") : "Run bounded validator"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[24px] border border-black/6 bg-[var(--surface-soft)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-black/45">
              {t("authorizedTesting.recentVerifications")}
            </p>
            <div className="mt-4 space-y-3">
              {verifications.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                  {t("authorizedTesting.noVerifications")}
                </div>
              ) : (
                verifications.map((verification) => (
                  <div
                    key={verification.id}
                    className={cn(
                      "rounded-[20px] border p-4 transition",
                      verification.id === selectedVerificationId
                        ? "border-[#1a78cf]/20 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                        : "border-black/6 bg-white"
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={verificationStatusClass(verification.status)}>
                        {t(`authorizedTesting.statuses.${verification.status}`)}
                      </Badge>
                      <Badge>{methodLabel(verification.method, t)}</Badge>
                      <Badge
                        className={verificationModeBadgeClass(
                          verification.verificationMode
                        )}
                      >
                        {verificationModeLabel(verification.verificationMode)}
                      </Badge>
                    </div>
                    <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                      {verification.hostname}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {t("authorizedTesting.expiresAt")}:{" "}
                      {formatDateTime(verification.expiresAt)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedVerificationId(verification.id);
                          setVerificationTarget(requestedUrlForVerification(verification));
                          setRunTarget(defaultRunTargetForVerification(verification));
                        }}
                        className="rounded-full border border-black/10 bg-[var(--surface-soft)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-black/[0.03]"
                      >
                        {t("authorizedTesting.useVerification")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleCheckVerification(verification.id);
                        }}
                        disabled={
                          checkingVerificationId === verification.id ||
                          privateModeReady !== true
                        }
                        className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {checkingVerificationId === verification.id
                          ? t("authorizedTesting.checking")
                          : t("authorizedTesting.checkStatus")}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/6 bg-[var(--surface-soft)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-black/45">
              Advanced AI runs
            </p>
            <div className="mt-4 space-y-3">
              {advancedRuns.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                  No advanced orchestrated runs have been recorded yet.
                </div>
              ) : (
                advancedRuns.map((run) => (
                  <button
                    key={run.runId}
                    type="button"
                    onClick={() => {
                      void handleLoadAdvancedRun(run.runId);
                    }}
                    className="w-full rounded-[20px] border border-black/6 bg-white p-4 text-left transition hover:border-black/12 hover:bg-black/[0.015]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={runStatusClass(run.status)}>
                        {advancedRunStatusLabel(run.status)}
                      </Badge>
                      <Badge>{formatNumber(run.vulnerabilities)} vulns</Badge>
                      <Badge>{formatNumber(run.attackChains)} chains</Badge>
                    </div>
                    <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                      {run.target}
                    </p>
                    {run.finalSummary ? (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">
                        {run.finalSummary}
                      </p>
                    ) : null}
                    <div className="mt-3 text-sm text-[var(--text-secondary)]">
                      {loadingAdvancedRunId === run.runId
                        ? "Loading advanced run..."
                        : formatDateTime(run.updatedAt)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/6 bg-[var(--surface-soft)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-black/45">
              {t("authorizedTesting.recentRuns")}
            </p>
            <div className="mt-4 space-y-3">
              {runs.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                  {t("authorizedTesting.noRuns")}
                </div>
              ) : (
                runs.map((run) => (
                  <button
                    key={run.runId}
                    type="button"
                    onClick={() => {
                      void handleLoadRun(run.runId);
                    }}
                    className="w-full rounded-[20px] border border-black/6 bg-white p-4 text-left transition hover:border-black/12 hover:bg-black/[0.015]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={runStatusClass(run.status)}>
                        {t(`authorizedTesting.runStatuses.${run.status}`)}
                      </Badge>
                      <Badge className={riskBadgeClass(run.riskLevel)}>
                        {t(`authorizedTesting.riskLevels.${run.riskLevel}`)}
                      </Badge>
                    </div>
                    <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                      {run.hostname}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {run.requestedUrl}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-black/45">
                      <span>
                        {t("authorizedTesting.findingsCount", {
                          count: formatNumber(run.findings)
                        })}
                      </span>
                      <span>
                        {t("authorizedTesting.highFindingsCount", {
                          count: formatNumber(run.highSeverityFindings)
                        })}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-[var(--text-secondary)]">
                      {loadingRunId === run.runId
                        ? t("authorizedTesting.loadingReport")
                        : formatDateTime(run.executedAt)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {advancedStreamRunId || advancedStreamSummary || advancedStreamEvents.length > 0 ? (
        <div className="rounded-[24px] border border-black/6 bg-[var(--surface-soft)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-black/45">
                Advanced AI run activity
              </p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                Orchestrated penetration test stream
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {advancedStreamSummary ??
                  "The orchestrator will publish recon, planning, execution, and reporting events here."}
              </p>
            </div>
            {advancedStreamRunId ? (
              <Badge
                className={runStatusClass(
                  advancedStreamStatus ?? (isAdvancedRunning ? "running" : "queued")
                )}
              >
                {advancedStreamRunId}
              </Badge>
            ) : null}
          </div>
          <div className="mt-4 space-y-3">
            {advancedStreamEvents.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                Waiting for the first orchestrator event.
              </div>
            ) : (
              advancedStreamEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-[20px] border border-black/6 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{advancedEventTypeLabel(event.type)}</Badge>
                    <Badge>{event.phase}</Badge>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                    {event.message}
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {formatDateTime(event.timestamp)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {!report ? (
        <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-5 text-sm text-[var(--text-secondary)]">
          {t("authorizedTesting.empty")}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-black/45">
            <span>
              {t("authorizedTesting.executedAt")}: {formatDateTime(report.executedAt)}
            </span>
            <span>
              {t("authorizedTesting.targetLabel")}: {report.target.requestedUrl}
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="rounded-[24px] border border-black/6 bg-[linear-gradient(135deg,rgba(15,23,42,0.96)_0%,rgba(29,78,216,0.94)_100%)] p-5 text-white">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className={runStatusClass(report.status)}>
                  {t(`authorizedTesting.runStatuses.${report.status}`)}
                </Badge>
                <Badge className={riskBadgeClass(report.summary.riskLevel)}>
                  {t(`authorizedTesting.riskLevels.${report.summary.riskLevel}`)}
                </Badge>
                <Badge>
                  {t(`authorizedTesting.planSources.${report.summary.planSource}`)}
                </Badge>
                <span className="text-xs uppercase tracking-[0.18em] text-white/65">
                  {t("authorizedTesting.requestsSent")}:{" "}
                  {formatNumber(report.summary.requestsSent)}/
                  {formatNumber(report.summary.requestBudget)}
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-semibold">
                {t("authorizedTesting.executiveSummary")}
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/82">
                {report.summary.headline}
              </p>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                    {t("authorizedTesting.modulesExecuted")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {report.summary.modulesExecuted.map((module) => (
                      <Badge key={module}>{moduleLabel(module, t)}</Badge>
                    ))}
                  </div>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                    {t("authorizedTesting.recommendedActions")}
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-white/82">
                    {report.summary.recommendedActions.length === 0 ? (
                      <p>{t("authorizedTesting.noneRecorded")}</p>
                    ) : (
                      report.summary.recommendedActions.map((action) => (
                        <p key={action}>{action}</p>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/58">
                    {t("authorizedTesting.guardrails")}
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-white/82">
                    {report.guardrails.map((guardrail) => (
                      <p key={guardrail}>{guardrail}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-[var(--brand-blue)]" />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {t("authorizedTesting.baseline")}
                  </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("authorizedTesting.score")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                      {formatNumber(report.baseline.securityScore)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("authorizedTesting.pagesScanned")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                      {formatNumber(report.baseline.pagesScanned)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 border-t border-black/6 pt-4 text-sm leading-6 text-[var(--text-secondary)]">
                  <p>{report.baseline.finalUrl}</p>
                  <p>
                    {t("authorizedTesting.verifiedHostname")}:{" "}
                    {report.ownership.hostname}
                  </p>
                </div>
                {report.baseline.declaredAuthEndpoints.length > 0 ? (
                  <div className="mt-4 border-t border-black/6 pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("authorizedTesting.declaredAuthEndpoints")}
                    </p>
                    <div className="mt-3 space-y-3">
                      {report.baseline.declaredAuthEndpoints.map((descriptor) => (
                        <div
                          key={`${descriptor.name}-${descriptor.endpoint}`}
                          className="rounded-[18px] border border-black/6 bg-white px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]"
                        >
                          <p className="font-semibold text-[var(--text-primary)]">
                            {descriptor.name}
                          </p>
                          <p>
                            {t("authorizedTesting.entryUrl")}: {descriptor.entryUrl}
                          </p>
                          <p>
                            {t("authorizedTesting.endpoint")}: {descriptor.endpoint}
                          </p>
                          <p>
                            {t("authorizedTesting.httpMethod")}: {descriptor.method}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {report.baseline.manualFormValidation ? (
                  <div className="mt-4 border-t border-black/6 pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {t("authorizedTesting.manualFormValidation")}
                    </p>
                    <div className="mt-3 rounded-[18px] border border-black/6 bg-white px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
                      <p>
                        {t("authorizedTesting.manualFormValidationRateLimit")}:{" "}
                        {formatNumber(
                          report.baseline.manualFormValidation.rateLimitPerMinute
                        )}
                      </p>
                      <p>
                        {t(
                          "authorizedTesting.manualFormValidationCredentialLabels"
                        )}
                        :{" "}
                        {report.baseline.manualFormValidation.credentialLabels.join(
                          ", "
                        )}
                      </p>
                      {report.baseline.manualFormValidation.notes ? (
                        <p>
                          {t("authorizedTesting.manualFormValidationNotes")}:{" "}
                          {report.baseline.manualFormValidation.notes}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[var(--brand-blue)]" />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {t("authorizedTesting.aiAnalysis")}
                  </p>
                </div>
                <div className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {report.aiAnalysis.status === "ready" ? (
                    <>
                      <p className="font-semibold text-[var(--text-primary)]">
                        {report.aiAnalysis.headline}
                      </p>
                      <p className="mt-2">{report.aiAnalysis.executiveSummary}</p>
                      <div className="mt-3 space-y-2">
                        {report.aiAnalysis.nextSteps.map((step) => (
                          <p key={step}>{step}</p>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-[var(--text-primary)]">
                        {t("authorizedTesting.aiUnavailable")}
                      </p>
                      <p className="mt-2">
                        {report.aiAnalysis.unavailableReason ??
                          t("authorizedTesting.aiUnavailableDescription")}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="size-4 text-[var(--brand-blue)]" />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {t("authorizedTesting.predictions")}
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {report.aiAnalysis.predictions.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                      {t("authorizedTesting.noPredictions")}
                    </div>
                  ) : (
                    report.aiAnalysis.predictions.map((prediction) => (
                      <div
                        key={prediction.id}
                        className="rounded-[20px] border border-black/6 bg-white p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={likelihoodBadgeClass(prediction.likelihood)}>
                            {t(
                              `authorizedTesting.likelihoods.${prediction.likelihood}`
                            )}
                          </Badge>
                          <Badge>{moduleLabel(prediction.category, t)}</Badge>
                          <Badge className={sourceBadgeClass(prediction.source)}>
                            {t(`authorizedTesting.sources.${prediction.source}`)}
                          </Badge>
                        </div>
                        <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                          {prediction.title}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                          {prediction.rationale}
                        </p>
                        <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                          {t("authorizedTesting.indicators")}
                        </p>
                        <div className="mt-1 space-y-1 text-sm text-[var(--text-secondary)]">
                          {prediction.indicators.map((indicator) => (
                            <p key={indicator}>{indicator}</p>
                          ))}
                        </div>
                        <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                          {t("authorizedTesting.recommendedCheck")}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                          {prediction.recommendedCheck}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {report.warnings.length > 0 ? (
                <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-amber-900" />
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-900">
                      {t("authorizedTesting.runNotes")}
                    </p>
                  </div>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
                    {report.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("authorizedTesting.highFindings")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-red-700">
                {formatNumber(report.summary.findingCounts.high)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("authorizedTesting.mediumFindings")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-amber-700">
                {formatNumber(report.summary.findingCounts.medium)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("authorizedTesting.lowFindings")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-sky-700">
                {formatNumber(report.summary.findingCounts.low)}
              </p>
            </div>
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                {t("authorizedTesting.authProfiles")}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                {formatNumber(report.authProfiles.length)}
              </p>
            </div>
          </div>

          {report.summary.executionInsights ||
          (report.summary.prioritizedModules?.length ?? 0) > 0 ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              {report.summary.executionInsights ? (
                <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                  <div className="flex items-center gap-2">
                    <RefreshCcw className="size-4 text-[var(--brand-blue)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {t("authorizedTesting.executionInsights")}
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-[18px] border border-black/6 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("authorizedTesting.parallelism")}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                        {formatNumber(report.summary.executionInsights.moduleConcurrency)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("authorizedTesting.cacheHits")}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                        {formatNumber(report.summary.executionInsights.probeCacheHits)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("authorizedTesting.cacheMisses")}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                        {formatNumber(report.summary.executionInsights.probeCacheMisses)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("authorizedTesting.rateLimits")}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                        {formatNumber(report.summary.executionInsights.rateLimitedResponses)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("authorizedTesting.backoffEvents")}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                        {formatNumber(report.summary.executionInsights.adaptiveBackoffCount)}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {t("authorizedTesting.networkRequests")}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                        {formatNumber(report.summary.executionInsights.networkRequestsSent)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {(report.summary.prioritizedModules?.length ?? 0) > 0 ? (
                <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-[var(--brand-blue)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {t("authorizedTesting.prioritizedModules")}
                    </p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {report.summary.prioritizedModules?.map((priority) => (
                      <div
                        key={priority.module}
                        className="rounded-[18px] border border-black/6 bg-white p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{moduleLabel(priority.module, t)}</Badge>
                          <Badge>
                            {t("authorizedTesting.priorityScore", {
                              score: formatNumber(priority.score)
                            })}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                          {priority.reasons.map((reason) => (
                            <p key={reason}>{reason}</p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {report.summary.campaignStory ||
          (report.summary.adaptation?.decisions.length ?? 0) > 0 ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              {report.summary.campaignStory ? (
                <div
                  className={cn(
                    "rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4",
                    (report.summary.adaptation?.decisions.length ?? 0) === 0 &&
                      "xl:col-span-2"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="size-4 text-[var(--brand-blue)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      Campaign story
                    </p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                    {report.summary.campaignStory.narrative}
                  </p>
                  {report.summary.campaignStory.chainHighlights.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {report.summary.campaignStory.chainHighlights.map((highlight) => (
                        <Badge key={highlight}>{highlight}</Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    {report.summary.campaignStory.sections.map((section) => (
                      <div
                        key={section.id}
                        className="rounded-[18px] border border-black/6 bg-white p-4"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                          {section.title}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                          {section.narrative}
                        </p>
                        <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                          {section.evidence.map((evidence) => (
                            <p key={evidence}>{evidence}</p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {(report.summary.adaptation?.decisions.length ?? 0) > 0 ? (
                <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
                  <div className="flex items-center gap-2">
                    <RefreshCcw className="size-4 text-[var(--brand-blue)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      Adaptive follow-up
                    </p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                    The run added safe follow-up coverage after intermediate evidence
                    changed the next best attack path under the current budget.
                  </p>
                  <div className="mt-4 space-y-3">
                    {report.summary.adaptation?.decisions.map((decision) => (
                      <div
                        key={decision.id}
                        className="rounded-[18px] border border-black/6 bg-white p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{moduleLabel(decision.module, t)}</Badge>
                          <Badge className={urgencyBadgeClass(decision.urgency)}>
                            {decision.urgency}
                          </Badge>
                          <Badge className={sourceBadgeClass(decision.source)}>
                            {decision.source}
                          </Badge>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                          {decision.rationale}
                        </p>
                        {decision.triggerCategories.length > 0 ? (
                          <p className="mt-3 text-sm text-[var(--text-secondary)]">
                            Triggered by{" "}
                            {decision.triggerCategories
                              .map((category) => moduleLabel(category, t))
                              .join(" + ")}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-[var(--brand-blue)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("authorizedTesting.plan")}
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {report.plan.map((step) => (
                  <div
                    key={step.id}
                    className="rounded-[20px] border border-black/6 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{moduleLabel(step.category, t)}</Badge>
                    </div>
                    <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                      {step.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {step.objective}
                    </p>
                    <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                      {t("authorizedTesting.safeMethod")}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                      {step.safeMethod}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-[var(--brand-blue)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("authorizedTesting.attackPaths")}
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {report.attackPaths.map((attackPath) => (
                  <div
                    key={attackPath.id}
                    className={cn(
                      "rounded-[20px] border p-4",
                      attackPathClass(attackPath.status)
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{t(`authorizedTesting.pathStatuses.${attackPath.status}`)}</Badge>
                      <Badge>
                        {t(
                          `authorizedTesting.priorities.${attackPath.remediationPriority}`
                        )}
                      </Badge>
                      {attackPath.source ? (
                        <Badge className={sourceBadgeClass(attackPath.source)}>
                          {t(`authorizedTesting.sources.${attackPath.source}`)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                      {attackPath.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {attackPath.narrative}
                    </p>
                    {typeof attackPath.confidence === "number" ? (
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        {t("authorizedTesting.confidence")}:{" "}
                        {formatNumber(attackPath.confidence)}%
                      </p>
                    ) : null}
                    <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                      {t("authorizedTesting.safeValidation")}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                      {attackPath.safeValidation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-[var(--brand-blue)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("authorizedTesting.findings")}
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {report.findings.length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                    {t("authorizedTesting.noFindings")}
                  </div>
                ) : (
                  report.findings.map((finding) => (
                    <div
                      key={finding.id}
                      className="rounded-[20px] border border-black/6 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={severityBadgeClass(finding.severity)}>
                          {t(`authorizedTesting.severities.${finding.severity}`)}
                        </Badge>
                        <Badge>{moduleLabel(finding.category, t)}</Badge>
                        {finding.validation ? (
                          <>
                            <Badge
                              className={validationBadgeClass(
                                finding.validation.disposition
                              )}
                            >
                              {t(
                                `authorizedTesting.validationStatuses.${finding.validation.disposition}`
                              )}
                            </Badge>
                            <Badge className={sourceBadgeClass(finding.validation.source)}>
                              {t(`authorizedTesting.sources.${finding.validation.source}`)}
                            </Badge>
                          </>
                        ) : null}
                      </div>
                      <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                        {finding.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        {finding.summary}
                      </p>
                      {finding.apiDetails ? (
                        <div className="mt-3 rounded-2xl border border-black/6 bg-[var(--surface-soft)] p-3 text-sm text-[var(--text-secondary)]">
                          <p className="font-semibold text-[var(--text-primary)]">
                            {t("authorizedTesting.apiSignal")}
                          </p>
                          <p className="mt-2">
                            <span className="font-semibold text-[var(--text-primary)]">
                              {t("authorizedTesting.vulnerabilityType")}
                            </span>
                            :{" "}
                            {apiVulnerabilityLabel(
                              finding.apiDetails.vulnerabilityType,
                              t
                            )}
                          </p>
                          <p>
                            <span className="font-semibold text-[var(--text-primary)]">
                              {t("authorizedTesting.endpoint")}
                            </span>
                            : {finding.apiDetails.endpoint}
                          </p>
                          <p>
                            <span className="font-semibold text-[var(--text-primary)]">
                              {t("authorizedTesting.httpMethod")}
                            </span>
                            : {finding.apiDetails.method}
                          </p>
                          <p>
                            <span className="font-semibold text-[var(--text-primary)]">
                              {t("authorizedTesting.signalConfidence")}
                            </span>
                            : {formatNumber(finding.apiDetails.confidence)}%
                          </p>
                          <p className="mt-2 font-semibold text-[var(--text-primary)]">
                            {t("authorizedTesting.safePoc")}
                          </p>
                          <p className="mt-1 leading-6 text-[var(--text-secondary)]">
                            {finding.apiDetails.poc}
                          </p>
                        </div>
                      ) : null}
                      {finding.validation ? (
                        <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                          <p>
                            <span className="font-semibold text-[var(--text-primary)]">
                              {t("authorizedTesting.confidence")}
                            </span>
                            : {formatNumber(finding.validation.confidence)}%
                          </p>
                          <p>
                            <span className="font-semibold text-[var(--text-primary)]">
                              {t("authorizedTesting.validationRationale")}
                            </span>
                            : {finding.validation.rationale}
                          </p>
                        </div>
                      ) : null}
                      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                        {t("authorizedTesting.remediation")}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                        {finding.remediation}
                      </p>
                      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                        {t("authorizedTesting.safeRetest")}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                        {finding.safeRetest}
                      </p>
                      <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                        {finding.evidence.map((evidence) => (
                          <p key={evidence}>{evidence}</p>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-[var(--brand-blue)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("authorizedTesting.timeline")}
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {report.events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-[20px] border border-black/6 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={severityBadgeClass(event.severity)}>
                        {t(`authorizedTesting.severities.${event.severity}`)}
                      </Badge>
                      <Badge>{t(`authorizedTesting.eventTypes.${event.eventType}`)}</Badge>
                      {event.category ? (
                        <Badge>{moduleLabel(event.category, t)}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                      {event.message}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

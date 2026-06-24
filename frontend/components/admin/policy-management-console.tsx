"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  FileSliders,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Shield,
  Trash2
} from "lucide-react";

import {
  createPolicy,
  deletePolicy,
  evaluatePolicy,
  getPolicies,
  getPolicyAuditLogs,
  getStoredSession,
  PolicyUpsertPayload,
  setWorkspacePolicyMode,
  updatePolicy
} from "@/lib/api";
import {
  PolicyAssignment,
  PolicyAssignmentType,
  PolicyAuditLog,
  PolicyCategory,
  PolicyDecision,
  PolicyDefinition,
  PolicyEvaluationResult,
  PolicyMode,
  PolicyRule,
  PolicyScopeType,
  WorkspaceRole
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

const CATEGORY_OPTIONS: PolicyCategory[] = [
  "code_generation",
  "security_research",
  "vulnerability_analysis",
  "document_access",
  "external_url_access",
  "agent_execution",
  "tool_usage",
  "file_uploads",
  "database_queries",
  "command_execution"
];

const DECISION_OPTIONS: PolicyDecision[] = [
  "allow",
  "warn",
  "require_approval",
  "deny"
];

const MODE_OPTIONS: PolicyMode[] = [
  "open",
  "strict",
  "enterprise",
  "research",
  "custom"
];

const SCOPE_OPTIONS: PolicyScopeType[] = [
  "workspace",
  "organization",
  "user",
  "global"
];

const ASSIGNMENT_TYPES: PolicyAssignmentType[] = [
  "overlay",
  "mode",
  "baseline"
];

const ROLE_OPTIONS = [
  "super_admin",
  "admin",
  "manager",
  "developer",
  "viewer"
] as const;

const WORKSPACE_ROLE_OPTIONS: WorkspaceRole[] = [
  "owner",
  "admin",
  "member",
  "viewer"
];

interface RuleEditorState {
  id?: string;
  category: PolicyCategory;
  decision: PolicyDecision;
  enabled: boolean;
  priority: number;
  description: string;
  toolNames: string;
  roleScopes: string;
  workspaceRoleScopes: string;
  modelPatterns: string;
  conditions: string;
}

interface AssignmentEditorState {
  id?: string;
  scopeType: PolicyScopeType;
  scopeId: string;
  assignmentType: PolicyAssignmentType;
  mode: PolicyMode;
  priority: number;
  isActive: boolean;
}

interface PolicyEditorState {
  id?: string;
  name: string;
  description: string;
  mode: PolicyMode;
  isActive: boolean;
  metadata: string;
  rules: RuleEditorState[];
  assignments: AssignmentEditorState[];
}

function commaListToArray(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readJsonObject(value: string, fallback: Record<string, unknown> = {}) {
  if (!value.trim()) {
    return fallback;
  }

  const parsed = JSON.parse(value) as Record<string, unknown>;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("JSON input must be an object.");
  }

  return parsed;
}

function createEmptyRule(): RuleEditorState {
  return {
    category: "tool_usage",
    decision: "warn",
    enabled: true,
    priority: 100,
    description: "",
    toolNames: "",
    roleScopes: "",
    workspaceRoleScopes: "",
    modelPatterns: "",
    conditions: "{}"
  };
}

function createEmptyAssignment(session: ReturnType<typeof getStoredSession>): AssignmentEditorState {
  return {
    scopeType: "workspace",
    scopeId: session?.currentWorkspace?.id ?? "",
    assignmentType: "overlay",
    mode: "custom",
    priority: 100,
    isActive: true
  };
}

function createEmptyEditor(session: ReturnType<typeof getStoredSession>): PolicyEditorState {
  return {
    name: "",
    description: "",
    mode: "custom",
    isActive: true,
    metadata: "{}",
    rules: [createEmptyRule()],
    assignments: [createEmptyAssignment(session)]
  };
}

function policyToEditor(policy: PolicyDefinition): PolicyEditorState {
  return {
    id: policy.id,
    name: policy.name,
    description: policy.description,
    mode: policy.mode,
    isActive: policy.isActive,
    metadata: JSON.stringify(policy.metadata ?? {}, null, 2),
    rules: policy.rules.map((rule) => ({
      id: rule.id,
      category: rule.category,
      decision: rule.decision,
      enabled: rule.enabled,
      priority: rule.priority,
      description: rule.description ?? "",
      toolNames: rule.toolNames.join(", "),
      roleScopes: rule.roleScopes.join(", "),
      workspaceRoleScopes: rule.workspaceRoleScopes.join(", "),
      modelPatterns: rule.modelPatterns.join(", "),
      conditions: JSON.stringify(rule.conditions ?? {}, null, 2)
    })),
    assignments: policy.assignments.map((assignment) => ({
      id: assignment.id,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId ?? "",
      assignmentType: assignment.assignmentType,
      mode: assignment.mode ?? policy.mode,
      priority: assignment.priority,
      isActive: assignment.isActive
    }))
  };
}

export function PolicyManagementConsole() {
  const { formatDateTime, t } = useI18n();
  const session = useMemo(() => getStoredSession(), []);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof getPolicies>> | null>(null);
  const [auditLogs, setAuditLogs] = useState<PolicyAuditLog[]>([]);
  const [editor, setEditor] = useState<PolicyEditorState>(() => createEmptyEditor(session));
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<PolicyMode>("open");
  const [customModePolicyId, setCustomModePolicyId] = useState<string>("");
  const [evaluation, setEvaluation] = useState<PolicyEvaluationResult | null>(null);
  const [evaluationInput, setEvaluationInput] = useState({
    action: "admin.policy_test",
    categories: ["tool_usage"] as string[],
    content: "",
    toolName: "",
    model: "",
    provider: "",
    url: "",
    fileName: "",
    mimeType: "",
    fileSizeBytes: "",
    sql: "",
    metadata: "{}",
    roleOverride: "",
    workspaceRoleOverride: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const customPolicies = useMemo(
    () => (catalog?.policies ?? []).filter((policy) => !policy.isSystem),
    [catalog]
  );
  const categoryLabel = (value: PolicyCategory) => t(`enums.policyCategories.${value}`);
  const decisionLabel = (value: PolicyDecision) => t(`enums.policyDecisions.${value}`);
  const modeLabel = (value: PolicyMode) => t(`enums.policyModes.${value}`);
  const scopeLabel = (value: PolicyScopeType) => t(`enums.policyScopes.${value}`);
  const assignmentTypeLabel = (value: PolicyAssignmentType) =>
    t(`enums.policyAssignmentTypes.${value}`);
  const roleLabel = (value: (typeof ROLE_OPTIONS)[number]) => t(`enums.roles.${value}`);
  const workspaceRoleLabel = (value: WorkspaceRole) =>
    t(`enums.workspaceRoles.${value}`);

  async function loadData(selectPolicyId?: string | null) {
    setError(null);
    const [policyCatalog, logs] = await Promise.all([
      getPolicies(),
      getPolicyAuditLogs(80)
    ]);

    setCatalog(policyCatalog);
    setAuditLogs(logs);
    setWorkspaceMode(policyCatalog.currentWorkspaceMode);

    const availableCustomPolicies = policyCatalog.policies.filter((policy) => !policy.isSystem);
    const nextSelectedId =
      selectPolicyId ??
      selectedPolicyId ??
      availableCustomPolicies[0]?.id ??
      policyCatalog.policies.find((policy) => !policy.isSystem)?.id ??
      null;

    if (nextSelectedId) {
      const nextPolicy = policyCatalog.policies.find((policy) => policy.id === nextSelectedId);
      if (nextPolicy) {
        setSelectedPolicyId(nextPolicy.id);
        setEditor(policyToEditor(nextPolicy));
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    startTransition(() => {
      void loadData()
        .catch((loadError) => {
          if (!cancelled) {
            setError(loadError instanceof Error ? loadError.message : t("policy.loadFailed"));
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function resetForNewPolicy() {
    setSelectedPolicyId(null);
    setEditor(createEmptyEditor(session));
    setSuccess(null);
    setError(null);
  }

  function selectPolicy(policy: PolicyDefinition) {
    setSelectedPolicyId(policy.id);
    setEditor(policyToEditor(policy));
    setSuccess(null);
    setError(null);
  }

  function updateRule(index: number, updates: Partial<RuleEditorState>) {
    setEditor((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...updates } : rule
      )
    }));
  }

  function updateAssignment(index: number, updates: Partial<AssignmentEditorState>) {
    setEditor((current) => ({
      ...current,
      assignments: current.assignments.map((assignment, assignmentIndex) =>
        assignmentIndex === index ? { ...assignment, ...updates } : assignment
      )
    }));
  }

  async function handleSavePolicy() {
    try {
      setError(null);
      setSuccess(null);

      const payload: PolicyUpsertPayload = {
        name: editor.name.trim(),
        description: editor.description.trim(),
        mode: editor.mode,
        isActive: editor.isActive,
        metadata: readJsonObject(editor.metadata),
        rules: editor.rules.map((rule) => ({
          id: rule.id,
          category: rule.category,
          decision: rule.decision,
          enabled: rule.enabled,
          priority: rule.priority,
          description: rule.description.trim() || undefined,
          toolNames: commaListToArray(rule.toolNames),
          roleScopes: commaListToArray(rule.roleScopes),
          workspaceRoleScopes: commaListToArray(rule.workspaceRoleScopes),
          modelPatterns: commaListToArray(rule.modelPatterns),
          conditions: readJsonObject(rule.conditions)
        })),
        assignments: editor.assignments.map((assignment) => ({
          id: assignment.id,
          scopeType: assignment.scopeType,
          scopeId:
            assignment.scopeType === "global"
              ? undefined
              : assignment.scopeId.trim() ||
                (assignment.scopeType === "workspace"
                  ? session?.currentWorkspace?.id
                  : assignment.scopeType === "organization"
                    ? session?.currentWorkspace?.organizationId
                    : session?.user.id),
          assignmentType: assignment.assignmentType,
          mode: assignment.mode,
          priority: assignment.priority,
          isActive: assignment.isActive
        }))
      };

      if (!payload.name) {
        throw new Error(t("policy.nameRequired"));
      }

      if (selectedPolicyId) {
        await updatePolicy(selectedPolicyId, payload);
        setSuccess(t("policy.updated"));
        await loadData(selectedPolicyId);
      } else {
        const created = await createPolicy(payload);
        setSuccess(t("policy.created"));
        await loadData(created.id);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("policy.saveFailed"));
    }
  }

  async function handleDeletePolicy() {
    if (!selectedPolicyId) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      await deletePolicy(selectedPolicyId);
      setSuccess(t("policy.deleted"));
      resetForNewPolicy();
      await loadData(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("policy.deleteFailed"));
    }
  }

  async function handleSetWorkspaceMode() {
    try {
      setError(null);
      setSuccess(null);
      await setWorkspacePolicyMode({
        mode: workspaceMode,
        policyId: workspaceMode === "custom" ? customModePolicyId : undefined
      });
      setSuccess(t("policy.workspaceModeSet", { mode: modeLabel(workspaceMode) }));
      await loadData(selectedPolicyId);
    } catch (modeError) {
      setError(modeError instanceof Error ? modeError.message : t("policy.modeFailed"));
    }
  }

  async function handleEvaluatePolicy() {
    try {
      setError(null);
      setSuccess(null);
      const result = await evaluatePolicy({
        action: evaluationInput.action.trim(),
        categories: evaluationInput.categories,
        content: evaluationInput.content.trim() || undefined,
        toolName: evaluationInput.toolName.trim() || undefined,
        model: evaluationInput.model.trim() || undefined,
        provider: evaluationInput.provider.trim() || undefined,
        url: evaluationInput.url.trim() || undefined,
        fileName: evaluationInput.fileName.trim() || undefined,
        mimeType: evaluationInput.mimeType.trim() || undefined,
        fileSizeBytes: evaluationInput.fileSizeBytes
          ? Number(evaluationInput.fileSizeBytes)
          : undefined,
        sql: evaluationInput.sql.trim() || undefined,
        metadata: readJsonObject(evaluationInput.metadata),
        roleOverride: evaluationInput.roleOverride || undefined,
        workspaceRoleOverride:
          (evaluationInput.workspaceRoleOverride as WorkspaceRole | "") || undefined
      });
      setEvaluation(result);
      setSuccess(t("policy.testCompleted"));
      await loadData(selectedPolicyId);
    } catch (evaluationError) {
      setError(
        evaluationError instanceof Error
          ? evaluationError.message
          : t("policy.testFailed")
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="space-y-4 bg-white/78">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-black/45">{t("policy.policies")}</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">{t("policy.scopedRuleSets")}</h2>
            </div>
            <button
              type="button"
              onClick={resetForNewPolicy}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
            >
              <Plus className="size-3.5" />
              {t("policy.new")}
            </button>
          </div>

          <div className="space-y-3">
            {(catalog?.policies ?? []).map((policy) => (
              <button
                key={policy.id}
                type="button"
                onClick={() => selectPolicy(policy)}
                className={`w-full rounded-[22px] border p-4 text-left transition ${
                  selectedPolicyId === policy.id
                    ? "border-[var(--brand-blue)]/45 bg-[rgba(22,173,246,0.08)]"
                    : "border-black/6 bg-[var(--surface-soft)] hover:border-black/12"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{policy.name}</p>
                  <Badge>{modeLabel(policy.mode)}</Badge>
                  {policy.isSystem ? (
                    <Badge className="border-amber-300 bg-amber-50 text-amber-700">
                      {t("policy.system")}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{policy.description}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-black/45">
                  <span>{t("policy.rulesCount", { count: policy.rules.length })}</span>
                  <span>{t("policy.assignmentsCount", { count: policy.assignments.length })}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="space-y-5 bg-white/82">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-black/45">{t("policy.editor")}</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">
                {selectedPolicyId ? t("policy.editPolicy") : t("policy.createPolicy")}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  startTransition(() => {
                    void loadData(selectedPolicyId).catch((loadError) => {
                      setError(loadError instanceof Error ? loadError.message : t("policy.refreshFailed"));
                    });
                  });
                }}
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
              >
                <RefreshCcw className="size-3.5" />
                {t("policy.refresh")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSavePolicy();
                }}
                disabled={isPending || catalog?.policies.find((policy) => policy.id === selectedPolicyId)?.isSystem}
                className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Save className="size-3.5" />
                {t("policy.save")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDeletePolicy();
                }}
                disabled={!selectedPolicyId || catalog?.policies.find((policy) => policy.id === selectedPolicyId)?.isSystem}
                className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Trash2 className="size-3.5" />
                {t("policy.delete")}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">{t("policy.name")}</span>
              <input
                value={editor.name}
                onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/40"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">{t("policy.mode")}</span>
              <select
                value={editor.mode}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    mode: event.target.value as PolicyMode
                  }))
                }
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/40"
              >
                {MODE_OPTIONS.map((mode) => (
                  <option key={mode} value={mode}>
                    {modeLabel(mode)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">{t("policy.description")}</span>
            <textarea
              value={editor.description}
              onChange={(event) => setEditor((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/40"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">{t("policy.metadataJson")}</span>
            <textarea
              value={editor.metadata}
              onChange={(event) => setEditor((current) => ({ ...current, metadata: event.target.value }))}
              rows={4}
              className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/40"
            />
          </label>

          <section className="space-y-4 rounded-[26px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-black/45">{t("policy.rules")}</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">{t("policy.ruleSet")}</h3>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditor((current) => ({
                    ...current,
                    rules: [...current.rules, createEmptyRule()]
                  }))
                }
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)] transition hover:bg-white"
              >
                <Plus className="size-3.5" />
                {t("policy.addRule")}
              </button>
            </div>

            {editor.rules.map((rule, index) => (
              <div key={rule.id ?? `rule-${index}`} className="space-y-4 rounded-[22px] border border-black/6 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{categoryLabel(rule.category)}</Badge>
                    <Badge>{decisionLabel(rule.decision)}</Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditor((current) => ({
                        ...current,
                        rules: current.rules.filter((_, currentIndex) => currentIndex !== index)
                      }))
                    }
                    disabled={editor.rules.length === 1}
                    className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600 disabled:opacity-40"
                  >
                    {t("policy.remove")}
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.category")}</span>
                    <select
                      value={rule.category}
                      onChange={(event) =>
                        updateRule(index, {
                          category: event.target.value as PolicyCategory
                        })
                      }
                      className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {categoryLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.decision")}</span>
                    <select
                      value={rule.decision}
                      onChange={(event) =>
                        updateRule(index, {
                          decision: event.target.value as PolicyDecision
                        })
                      }
                      className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                    >
                      {DECISION_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {decisionLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.priority")}</span>
                    <input
                      type="number"
                      value={rule.priority}
                      onChange={(event) =>
                        updateRule(index, {
                          priority: Number(event.target.value)
                        })
                      }
                      className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex items-end gap-2 rounded-[16px] border border-black/8 bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(event) =>
                        updateRule(index, {
                          enabled: event.target.checked
                        })
                      }
                    />
                    {t("policy.enabled")}
                  </label>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.description")}</span>
                    <input
                      value={rule.description}
                      onChange={(event) => updateRule(index, { description: event.target.value })}
                      className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.toolNames")}</span>
                    <input
                      value={rule.toolNames}
                      onChange={(event) => updateRule(index, { toolNames: event.target.value })}
                      placeholder="web-search, database-query"
                      className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.roleScopes")}</span>
                    <input
                      value={rule.roleScopes}
                      onChange={(event) => updateRule(index, { roleScopes: event.target.value })}
                      placeholder={ROLE_OPTIONS.map((role) => roleLabel(role)).join(", ")}
                      className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.workspaceRoles")}</span>
                    <input
                      value={rule.workspaceRoleScopes}
                      onChange={(event) => updateRule(index, { workspaceRoleScopes: event.target.value })}
                      placeholder={WORKSPACE_ROLE_OPTIONS.map((role) => workspaceRoleLabel(role)).join(", ")}
                      className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block lg:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.modelPatterns")}</span>
                    <input
                      value={rule.modelPatterns}
                      onChange={(event) => updateRule(index, { modelPatterns: event.target.value })}
                      placeholder="qwen*, mistral-*"
                      className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block lg:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.conditionsJson")}</span>
                    <textarea
                      value={rule.conditions}
                      onChange={(event) => updateRule(index, { conditions: event.target.value })}
                      rows={4}
                      className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 font-mono text-sm"
                    />
                  </label>
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-4 rounded-[26px] border border-black/6 bg-[var(--surface-soft)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-black/45">{t("policy.assignments")}</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">{t("policy.inheritanceTargets")}</h3>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditor((current) => ({
                    ...current,
                    assignments: [...current.assignments, createEmptyAssignment(session)]
                  }))
                }
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)] transition hover:bg-white"
              >
                <Plus className="size-3.5" />
                {t("policy.addAssignment")}
              </button>
            </div>

            {editor.assignments.map((assignment, index) => (
              <div key={assignment.id ?? `assignment-${index}`} className="grid gap-4 rounded-[22px] border border-black/6 bg-white p-4 md:grid-cols-2 xl:grid-cols-5">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.scope")}</span>
                  <select
                    value={assignment.scopeType}
                    onChange={(event) =>
                      updateAssignment(index, {
                        scopeType: event.target.value as PolicyScopeType
                      })
                    }
                    className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                  >
                    {SCOPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {scopeLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.assignmentType")}</span>
                  <select
                    value={assignment.assignmentType}
                    onChange={(event) =>
                      updateAssignment(index, {
                        assignmentType: event.target.value as PolicyAssignmentType
                      })
                    }
                    className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                  >
                    {ASSIGNMENT_TYPES.map((option) => (
                      <option key={option} value={option}>
                        {assignmentTypeLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.mode")}</span>
                  <select
                    value={assignment.mode}
                    onChange={(event) =>
                      updateAssignment(index, {
                        mode: event.target.value as PolicyMode
                      })
                    }
                    className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                  >
                    {MODE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {modeLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.scopeId")}</span>
                  <input
                    value={assignment.scopeId}
                    onChange={(event) => updateAssignment(index, { scopeId: event.target.value })}
                    placeholder={assignment.scopeType === "global" ? t("policy.notRequired") : "UUID"}
                    className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                    disabled={assignment.scopeType === "global"}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.priority")}</span>
                  <input
                    type="number"
                    value={assignment.priority}
                    onChange={(event) => updateAssignment(index, { priority: Number(event.target.value) })}
                    className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>
            ))}
          </section>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-4 bg-white/78">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-[rgba(22,173,246,0.1)] p-3 text-[var(--brand-blue)]">
              <Shield className="size-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-black/45">{t("policy.workspaceMode")}</p>
              <h3 className="mt-1 text-2xl font-semibold text-ink">{t("policy.activePolicyPosture")}</h3>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.mode")}</span>
              <select
                value={workspaceMode}
                onChange={(event) => setWorkspaceMode(event.target.value as PolicyMode)}
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm"
              >
                {MODE_OPTIONS.map((mode) => (
                  <option key={mode} value={mode}>
                    {modeLabel(mode)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.customPolicy")}</span>
              <select
                value={customModePolicyId}
                onChange={(event) => setCustomModePolicyId(event.target.value)}
                disabled={workspaceMode !== "custom"}
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm disabled:opacity-45"
              >
                <option value="">{t("policy.selectCustomPolicy")}</option>
                {customPolicies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                void handleSetWorkspaceMode();
              }}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105"
            >
              <FileSliders className="size-3.5" />
              {t("policy.apply")}
            </button>
          </div>
        </Card>

        <Card className="space-y-4 bg-white/78">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
              <ClipboardCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-black/45">{t("policy.policyTest")}</p>
              <h3 className="mt-1 text-2xl font-semibold text-ink">{t("policy.dryRunAction")}</h3>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.action")}</span>
              <input
                value={evaluationInput.action}
                onChange={(event) =>
                  setEvaluationInput((current) => ({
                    ...current,
                    action: event.target.value
                  }))
                }
                className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.tool")}</span>
              <input
                value={evaluationInput.toolName}
                onChange={(event) =>
                  setEvaluationInput((current) => ({
                    ...current,
                    toolName: event.target.value
                  }))
                }
                className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.model")}</span>
              <input
                value={evaluationInput.model}
                onChange={(event) =>
                  setEvaluationInput((current) => ({
                    ...current,
                    model: event.target.value
                  }))
                }
                className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">{t("policy.provider")}</span>
              <input
                value={evaluationInput.provider}
                onChange={(event) =>
                  setEvaluationInput((current) => ({
                    ...current,
                    provider: event.target.value
                  }))
                }
                className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {CATEGORY_OPTIONS.map((category) => (
              <label key={category} className="flex items-center gap-2 rounded-[16px] border border-black/8 bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={evaluationInput.categories.includes(category)}
                  onChange={(event) =>
                    setEvaluationInput((current) => ({
                      ...current,
                      categories: event.target.checked
                        ? [...current.categories, category]
                        : current.categories.filter((entry) => entry !== category)
                    }))
                  }
                />
                {categoryLabel(category)}
              </label>
            ))}
          </div>

          <textarea
            value={evaluationInput.content}
            onChange={(event) =>
              setEvaluationInput((current) => ({
                ...current,
                content: event.target.value
              }))
            }
            rows={4}
            placeholder={t("policy.contentPlaceholder")}
            className="w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm"
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <input
              value={evaluationInput.url}
              onChange={(event) =>
                setEvaluationInput((current) => ({
                  ...current,
                  url: event.target.value
                }))
              }
              placeholder="https://example.com"
              className="rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
            />
            <input
              value={evaluationInput.fileName}
              onChange={(event) =>
                setEvaluationInput((current) => ({
                  ...current,
                  fileName: event.target.value
                }))
              }
              placeholder="evidence.pdf"
              className="rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
            />
            <input
              value={evaluationInput.fileSizeBytes}
              onChange={(event) =>
                setEvaluationInput((current) => ({
                  ...current,
                  fileSizeBytes: event.target.value
                }))
              }
              placeholder="1048576"
              className="rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </div>

          <textarea
            value={evaluationInput.metadata}
            onChange={(event) =>
              setEvaluationInput((current) => ({
                ...current,
                metadata: event.target.value
              }))
            }
            rows={3}
            placeholder='{"source":"admin-console"}'
            className="w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 font-mono text-sm"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void handleEvaluatePolicy();
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#111827_0%,#374151_100%)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:brightness-105"
            >
              <Search className="size-3.5" />
              {t("policy.evaluate")}
            </button>
            {evaluation ? (
              <div className="flex flex-wrap gap-2">
                <Badge>{decisionLabel(evaluation.decision)}</Badge>
                <Badge>{modeLabel(evaluation.mode)}</Badge>
              </div>
            ) : null}
          </div>

          {evaluation ? (
            <div className="rounded-[22px] border border-black/8 bg-[var(--surface-soft)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{decisionLabel(evaluation.decision)}</Badge>
                {evaluation.requiresApproval ? (
                  <Badge className="border-amber-300 bg-amber-50 text-amber-700">{t("policy.approvalRequired")}</Badge>
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                {evaluation.matchedRules.map((match) => (
                  <div key={`${match.category}-${match.policyId}-${match.ruleId ?? "default"}`} className="rounded-[18px] border border-black/8 bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{categoryLabel(match.category)}</Badge>
                      <Badge>{scopeLabel(match.scopeType)}</Badge>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{match.policyName}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{match.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="space-y-4 bg-white/78">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-[rgba(255,153,0,0.12)] p-3 text-[#cc7a00]">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-black/45">{t("policy.auditLogs")}</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">{t("policy.latestPolicyDecisions")}</h3>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[22px] border border-black/6 bg-white">
          <table className="min-w-full divide-y divide-black/6 text-sm">
            <thead className="bg-[var(--surface-soft)] text-[11px] uppercase tracking-[0.18em] text-black/50">
              <tr>
                <th className="px-4 py-3">{t("policy.time")}</th>
                <th className="px-4 py-3">{t("policy.action")}</th>
                <th className="px-4 py-3">{t("policy.category")}</th>
                <th className="px-4 py-3">{t("policy.decision")}</th>
                <th className="px-4 py-3">{t("policy.toolOrModel")}</th>
                <th className="px-4 py-3">{t("policy.scope")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/6">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{log.action}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{categoryLabel(log.category)}</td>
                  <td className="px-4 py-3">
                    <Badge>{decisionLabel(log.decision)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {log.toolName ?? log.model ?? t("policy.noData")}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{scopeLabel(log.scopeType)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileKey2,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AdvancedPenetrationTestRunDetail } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function formatDateTime(value?: string) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatDuration(durationMs: unknown) {
  const duration = readNumber(durationMs);
  if (duration === null) {
    return "Not recorded";
  }

  if (duration < 1000) {
    return `${Math.round(duration)} ms`;
  }

  const seconds = Math.round(duration / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function runStatusClass(status: AdvancedPenetrationTestRunDetail["status"]) {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "running":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "queued":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
}

function runStatusLabel(status: AdvancedPenetrationTestRunDetail["status"]) {
  switch (status) {
    case "completed":
      return "Completed";
    case "running":
      return "Running";
    case "queued":
      return "Queued";
    default:
      return "Failed";
  }
}

function severityClass(severity: string | null) {
  switch (severity) {
    case "critical":
      return "border-red-200 bg-red-50 text-red-700";
    case "high":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

function impactClass(impact: string | null) {
  switch (impact) {
    case "critical":
      return "border-red-200 bg-red-50/80";
    case "high":
      return "border-orange-200 bg-orange-50/80";
    case "medium":
      return "border-amber-200 bg-amber-50/80";
    default:
      return "border-sky-200 bg-sky-50/80";
  }
}

function attackStatusClass(status: string | null) {
  switch (status) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "running":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "pending":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "skipped":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
}

export function AdvancedPenetrationTestReportView({
  run
}: {
  run: AdvancedPenetrationTestRunDetail;
}) {
  const report = readRecord(run.report);
  const context = readRecord(run.context);
  const rawData = readRecord(report?.rawData);
  const guardrails = readStringArray(rawData?.guardrails);
  const recommendations = readStringArray(report?.recommendations);
  const vulnerabilities = readRecordArray(report?.vulnerabilities);
  const attackChains = readRecordArray(report?.attackChains);
  const evidence = readRecordArray(report?.evidence);
  const decisions = readRecordArray(context?.decisions);
  const auditTrail = run.auditTrail ?? [];
  const attackPlan = readRecord(context?.attackPlan);
  const plannedAttacks = readRecordArray(attackPlan?.attacks);
  const executiveSummary =
    readString(report?.executiveSummary) ?? run.finalSummary ?? "No summary yet.";
  const narrative = readString(report?.narrative);
  const impact = readString(report?.impact);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={runStatusClass(run.status)}>
              {runStatusLabel(run.status)}
            </Badge>
            <Badge>{run.target}</Badge>
            {run.completedAt ? <Badge>{formatDateTime(run.completedAt)}</Badge> : null}
          </div>
          <p className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">
            {executiveSummary}
          </p>
          {narrative ? (
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              {narrative}
            </p>
          ) : null}
          {impact ? (
            <div className="mt-4 rounded-[18px] border border-black/6 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">
                Impact
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {impact}
              </p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-[22px] border border-black/6 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-black/45">
              Vulnerabilities
            </p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
              {vulnerabilities.length}
            </p>
          </div>
          <div className="rounded-[22px] border border-black/6 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-black/45">
              Attack chains
            </p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
              {attackChains.length}
            </p>
          </div>
          <div className="rounded-[22px] border border-black/6 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-black/45">
              Evidence
            </p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
              {evidence.length}
            </p>
          </div>
          <div className="rounded-[22px] border border-black/6 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-black/45">
              Duration
            </p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
              {formatDuration(report?.duration)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Run metadata
            </p>
          </div>
          <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
            <p>
              <span className="font-semibold text-[var(--text-primary)]">Run ID</span>:{" "}
              {run.runId}
            </p>
            <p>
              <span className="font-semibold text-[var(--text-primary)]">Created</span>:{" "}
              {formatDateTime(run.createdAt)}
            </p>
            <p>
              <span className="font-semibold text-[var(--text-primary)]">Started</span>:{" "}
              {formatDateTime(run.startedAt)}
            </p>
            <p>
              <span className="font-semibold text-[var(--text-primary)]">Completed</span>:{" "}
              {formatDateTime(run.completedAt)}
            </p>
            {run.taskId ? (
              <p>
                <span className="font-semibold text-[var(--text-primary)]">Task</span>:{" "}
                {run.taskId}
              </p>
            ) : null}
            {run.agentId ? (
              <p>
                <span className="font-semibold text-[var(--text-primary)]">Agent</span>:{" "}
                {run.agentId}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Guardrails
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {guardrails.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                No persisted guardrail summary was recorded for this run.
              </div>
            ) : (
              guardrails.map((guardrail) => (
                <div
                  key={guardrail}
                  className="rounded-[18px] border border-black/6 bg-white p-4 text-sm leading-6 text-[var(--text-secondary)]"
                >
                  {guardrail}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {plannedAttacks.length > 0 ? (
        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Planned attacks
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {plannedAttacks.map((attack) => {
              const attackId =
                readString(attack.id) ??
                `${readString(attack.name) ?? "attack"}-${readString(attack.target) ?? "target"}`;
              const attackStatus = readString(attack.status);

              return (
                <div
                  key={attackId}
                  className="rounded-[18px] border border-black/6 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {readString(attack.type) ? <Badge>{readString(attack.type)}</Badge> : null}
                    {attackStatus ? (
                      <Badge className={attackStatusClass(attackStatus)}>
                        {attackStatus}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                    {readString(attack.name) ?? "Unnamed attack"}
                  </p>
                  {readString(attack.target) ? (
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      Target: {readString(attack.target)}
                    </p>
                  ) : null}
                  {readString(attack.expectedOutcome) ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {readString(attack.expectedOutcome)}
                    </p>
                  ) : null}
                  {readString(attack.result) ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      Result: {readString(attack.result)}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {decisions.length > 0 ? (
        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <RefreshCcw className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              AI decisions
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {decisions.map((decision) => (
              <div
                key={readString(decision.id) ?? `${readString(decision.action)}-${readString(decision.timestamp)}`}
                className="rounded-[18px] border border-black/6 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{readString(decision.action) ?? "Decision"}</Badge>
                  {readNumber(decision.confidence) !== null ? (
                    <Badge>{Math.round((readNumber(decision.confidence) ?? 0) * 100)}%</Badge>
                  ) : null}
                </div>
                {readString(decision.reason) ? (
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                    {readString(decision.reason)}
                  </p>
                ) : null}
                {readString(decision.alternative) ? (
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Alternative considered: {readString(decision.alternative)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Vulnerabilities
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {vulnerabilities.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                No vulnerability entries were persisted for this run.
              </div>
            ) : (
              vulnerabilities.map((vulnerability) => {
                const severity = readString(vulnerability.severity);
                return (
                  <div
                    key={readString(vulnerability.id) ?? `${readString(vulnerability.type)}-${readString(vulnerability.location)}`}
                    className="rounded-[18px] border border-black/6 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={severityClass(severity)}>{severity ?? "low"}</Badge>
                      {readString(vulnerability.type) ? (
                        <Badge>{readString(vulnerability.type)}</Badge>
                      ) : null}
                      {readBoolean(vulnerability.exploitable) === true ? (
                        <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                          Exploitable
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                      {readString(vulnerability.location) ?? "Unspecified location"}
                    </p>
                    {readString(vulnerability.description) ? (
                      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        {readString(vulnerability.description)}
                      </p>
                    ) : null}
                    {readString(vulnerability.evidence) ? (
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        Evidence: {readString(vulnerability.evidence)}
                      </p>
                    ) : null}
                    {readString(vulnerability.remediation) ? (
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Remediation: {readString(vulnerability.remediation)}
                      </p>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <FileKey2 className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Attack chains
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {attackChains.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                No attack chain narrative was generated for this run.
              </div>
            ) : (
              attackChains.map((chain) => (
                <div
                  key={readString(chain.id) ?? `${readString(chain.name)}-${readString(chain.impact)}`}
                  className={`rounded-[18px] border p-4 ${impactClass(readString(chain.impact))}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {readString(chain.impact) ? <Badge>{readString(chain.impact)}</Badge> : null}
                    {readString(chain.effort) ? <Badge>{readString(chain.effort)}</Badge> : null}
                  </div>
                  <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
                    {readString(chain.name) ?? "Attack chain"}
                  </p>
                  {readString(chain.businessImpact) ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {readString(chain.businessImpact)}
                    </p>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    {readRecordArray(chain.steps).map((step) => (
                      <div
                        key={`${readNumber(step.step) ?? 0}-${readString(step.vulnerability) ?? "step"}`}
                        className="rounded-2xl border border-black/6 bg-white/90 p-3 text-sm text-[var(--text-secondary)]"
                      >
                        <p className="font-semibold text-[var(--text-primary)]">
                          Step {readNumber(step.step) ?? "?"}:{" "}
                          {readString(step.vulnerability) ?? "Unnamed finding"}
                        </p>
                        {readString(step.action) ? (
                          <p className="mt-1">Action: {readString(step.action)}</p>
                        ) : null}
                        {readString(step.result) ? (
                          <p className="mt-1">Result: {readString(step.result)}</p>
                        ) : null}
                        {readString(step.nextStep) ? (
                          <p className="mt-1">Next step: {readString(step.nextStep)}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Recommendations
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {recommendations.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                No recommendations were persisted for this run.
              </div>
            ) : (
              recommendations.map((recommendation) => (
                <div
                  key={recommendation}
                  className="rounded-[18px] border border-black/6 bg-white p-4 text-sm leading-6 text-[var(--text-secondary)]"
                >
                  {recommendation}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-[var(--brand-blue)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Evidence
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {evidence.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                No evidence entries were recorded for this run.
              </div>
            ) : (
              evidence.map((entry) => (
                <div
                  key={readString(entry.id) ?? `${readString(entry.type)}-${readString(entry.timestamp)}`}
                  className="rounded-[18px] border border-black/6 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {readString(entry.type) ? <Badge>{readString(entry.type)}</Badge> : null}
                    {readString(entry.timestamp) ? (
                      <Badge>{formatDateTime(readString(entry.timestamp) ?? undefined)}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                    {readString(entry.description) ?? "Evidence entry"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] p-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-[var(--brand-blue)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Audit trail
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {auditTrail.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
              No audit events were recorded for this run.
            </div>
          ) : (
            auditTrail.map((entry) => (
              <div
                key={entry.id}
                className="rounded-[18px] border border-black/6 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{entry.action}</Badge>
                  <Badge>{formatDateTime(entry.timestamp)}</Badge>
                </div>
                {Object.keys(entry.data ?? {}).length > 0 ? (
                  <pre className="mt-3 overflow-x-auto rounded-2xl bg-[var(--surface-soft)] p-3 text-xs text-[var(--text-secondary)]">
                    {JSON.stringify(entry.data, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

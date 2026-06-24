"use client";

import { FlaskConical, ShieldAlert, ShieldCheck } from "lucide-react";

import { AuthorizedTestingDevModeStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DevModeBypassToggleProps {
  checked: boolean;
  disabled?: boolean;
  status: AuthorizedTestingDevModeStatus | null;
  onChange: (nextValue: boolean) => void;
}

export function DevModeBypassToggle({
  checked,
  disabled = false,
  status,
  onChange
}: DevModeBypassToggleProps) {
  const available = status?.available === true && status.bypassVerification;

  return (
    <div
      className={cn(
        "rounded-[22px] border p-4",
        available
          ? "border-amber-200 bg-amber-50/80"
          : "border-black/6 bg-[var(--surface-soft)]"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {available ? (
          <ShieldAlert className="size-4 text-amber-700" />
        ) : (
          <ShieldCheck className="size-4 text-[var(--brand-blue)]" />
        )}
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Developer verification bypass
        </p>
        <Badge>{status?.environment ?? "unknown"}</Badge>
        {available ? <Badge className="bg-amber-100 text-amber-800">Available</Badge> : null}
      </div>

      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
        {status?.message ??
          "Bypass status is unavailable. The backend may be loading or the session may be missing."}
      </p>

      <label className="mt-4 flex items-start gap-3 rounded-[18px] border border-black/8 bg-white px-4 py-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled || !available}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-1 size-4 rounded border-black/15"
        />
        <div className="space-y-1">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-4 text-[var(--brand-blue)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">
              Use the development fast path
          </span>
        </div>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
            When enabled, allowlisted development hostnames can skip manual verification and start a guarded run immediately.
        </p>
      </div>
    </label>

      {status && status.allowedDomains.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
            Allowed host patterns
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {status.allowedDomains.map((domain) => (
              <Badge key={domain}>{domain}</Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

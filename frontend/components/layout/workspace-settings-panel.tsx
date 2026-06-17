"use client";

import Link from "next/link";
import {
  Check,
  LogOut,
  Plus,
  Settings2,
  Shield,
  UserCircle2,
  UserPlus,
  X
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { WorkspaceInvitation, WorkspaceSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type WorkspacePanelSection = "workspace" | "profile";

interface WorkspaceSettingsPanelProps {
  isOpen: boolean;
  section: WorkspacePanelSection;
  currentWorkspace: WorkspaceSummary | null;
  workspaces: WorkspaceSummary[];
  pendingInvitations: WorkspaceInvitation[];
  userName: string;
  userEmail: string;
  onClose: () => void;
  onCreateWorkspace: () => void | Promise<void>;
  onSwitchWorkspace: (workspaceId: string) => void | Promise<void>;
  onInviteMember: () => void | Promise<void>;
  onAcceptInvitation: (invitationId: string) => void | Promise<void>;
  onLogout: () => void;
}

export function WorkspaceSettingsPanel({
  isOpen,
  section,
  currentWorkspace,
  workspaces,
  pendingInvitations,
  userName,
  userEmail,
  onClose,
  onCreateWorkspace,
  onSwitchWorkspace,
  onInviteMember,
  onAcceptInvitation,
  onLogout
}: WorkspaceSettingsPanelProps) {
  const canManageWorkspace =
    currentWorkspace?.role === "owner" || currentWorkspace?.role === "admin";

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-[#08111d]/42 backdrop-blur-sm"
        onClick={onClose}
      />

      <aside
        className={cn(
          "absolute inset-y-3 right-3 flex w-[min(100%-1.5rem,430px)] flex-col overflow-hidden rounded-[30px] border border-white/70 bg-[rgba(248,251,253,0.96)] shadow-[0_30px_90px_rgba(15,23,42,0.18)] backdrop-blur-xl",
          section === "profile" ? "ring-1 ring-[#1a78cf]/12" : ""
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
              {section === "workspace" ? "Workspace Settings" : "Profile"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
              {section === "workspace"
                ? currentWorkspace?.name ?? "Workspace"
                : userName}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {section === "workspace"
                ? "Switch workspaces, manage invitations, and handle member operations."
                : "Review account context and sign out without leaving the workspace."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/80 p-2 text-[var(--text-primary)] transition hover:bg-white"
            aria-label="Close workspace settings"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="rounded-[24px] border border-black/6 bg-white/78 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-2">
              <Settings2 className="size-4 text-[var(--brand-blue)]" />
              <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                Workspace
              </h3>
            </div>

            <div className="mt-4 rounded-[20px] border border-black/6 bg-[var(--surface-soft)] px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-[var(--text-primary)]">
                  {currentWorkspace?.name ?? "No workspace selected"}
                </p>
                {currentWorkspace?.role ? <Badge>{currentWorkspace.role}</Badge> : null}
              </div>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {currentWorkspace?.organizationName ?? "No organization context available."}
              </p>
            </div>

            <label className="mt-4 block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                Switch Workspace
              </span>
              <select
                value={currentWorkspace?.id ?? ""}
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (nextId) {
                    void onSwitchWorkspace(nextId);
                  }
                }}
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/40"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.role})
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  void onCreateWorkspace();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
              >
                <Plus className="size-4" />
                New Workspace
              </button>
              <button
                type="button"
                onClick={() => {
                  void onInviteMember();
                }}
                disabled={!canManageWorkspace}
                className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <UserPlus className="size-4" />
                Invite Member
              </button>
            </div>
          </section>

          <section className="rounded-[24px] border border-black/6 bg-white/78 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                  Invitations
                </h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Pending workspace access requests available to this account.
                </p>
              </div>
              <Badge>{pendingInvitations.length}</Badge>
            </div>

            <div className="mt-4 space-y-3">
              {pendingInvitations.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
                  No pending invitations.
                </div>
              ) : (
                pendingInvitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="rounded-[20px] border border-black/6 bg-[var(--surface-soft)] p-4"
                  >
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {invitation.workspaceName}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {invitation.organizationName}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <Badge>{invitation.role}</Badge>
                      <button
                        type="button"
                        onClick={() => {
                          void onAcceptInvitation(invitation.id);
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)] transition hover:bg-[var(--surface-strong)]"
                      >
                        <Check className="size-3.5" />
                        Accept
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[24px] border border-black/6 bg-white/78 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-2">
              <UserCircle2 className="size-4 text-[var(--brand-blue)]" />
              <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                Account
              </h3>
            </div>

            <div className="mt-4 rounded-[20px] border border-black/6 bg-[var(--surface-soft)] px-4 py-4">
              <p className="text-base font-semibold text-[var(--text-primary)]">{userName}</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{userEmail}</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link
                href="/admin"
                className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
              >
                <Shield className="size-4" />
                Admin
              </Link>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)]"
              >
                <LogOut className="size-4" />
                Logout
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

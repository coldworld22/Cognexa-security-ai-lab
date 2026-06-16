import Link from "next/link";
import {
  Check,
  LogOut,
  MessageSquarePlus,
  Plus,
  Shield,
  Trash2,
  UserPlus
} from "lucide-react";

import { AppIdentity } from "@/components/ui/app-identity";
import {
  ConversationSummary,
  WorkspaceInvitation,
  WorkspaceSummary
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface SidebarProps {
  className?: string;
  userName: string;
  userEmail: string;
  currentWorkspace: WorkspaceSummary | null;
  workspaces: WorkspaceSummary[];
  pendingInvitations: WorkspaceInvitation[];
  conversations: ConversationSummary[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onCreateConversation: () => void;
  onCreateWorkspace: () => void | Promise<void>;
  onSwitchWorkspace: (workspaceId: string) => void | Promise<void>;
  onInviteMember: () => void | Promise<void>;
  onAcceptInvitation: (invitationId: string) => void | Promise<void>;
  onDeleteConversation: (conversationId: string) => void | Promise<void>;
  onLogout: () => void;
  deletingConversationId?: string | null;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString([], {
        month: "short",
        day: "numeric"
      });
}

export function Sidebar({
  className,
  userName,
  userEmail,
  currentWorkspace,
  workspaces,
  pendingInvitations,
  conversations,
  selectedConversationId,
  onSelectConversation,
  onCreateConversation,
  onCreateWorkspace,
  onSwitchWorkspace,
  onInviteMember,
  onAcceptInvitation,
  onDeleteConversation,
  onLogout,
  deletingConversationId = null
}: SidebarProps) {
  const canManageWorkspace =
    currentWorkspace?.role === "owner" || currentWorkspace?.role === "admin";
  const activeConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId
  );

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,#08111d_0%,#0a1420_52%,#0c1724_100%)] p-4 text-white shadow-[0_32px_90px_rgba(2,8,20,0.34)] sm:p-5",
        className
      )}
    >
      <Link
        href="/"
        className="rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.03)_100%)] p-4 transition hover:bg-white/10"
      >
        <AppIdentity tone="dark" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">Chats</p>
            <p className="mt-2 text-lg font-semibold text-white">{conversations.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">State</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {activeConversation ? "Live" : "Idle"}
            </p>
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={onCreateConversation}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.28)] transition hover:brightness-105"
      >
        <MessageSquarePlus className="size-4" />
        New chat
      </button>

      <div className="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">Workspace</p>
            <p className="mt-2 truncate text-sm font-semibold text-white">
              {currentWorkspace?.name ?? "No workspace"}
            </p>
            <p className="mt-1 truncate text-xs text-white/42">
              {currentWorkspace?.organizationName ?? "Tenant not selected"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void onCreateWorkspace();
            }}
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Create workspace"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <label className="mt-4 block">
          <span className="text-[11px] uppercase tracking-[0.22em] text-white/42">
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
            className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d1825] px-3 py-3 text-sm text-white outline-none transition focus:border-[#2a7ab8]/50"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name} ({workspace.role})
              </option>
            ))}
          </select>
        </label>

        {canManageWorkspace ? (
          <button
            type="button"
            onClick={() => {
              void onInviteMember();
            }}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
          >
            <UserPlus className="size-4" />
            Invite member
          </button>
        ) : null}
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/38">
            Conversations
          </p>
          <p className="text-xs text-white/38">{conversations.length}</p>
        </div>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
          {conversations.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/5 p-4 text-sm text-white/48">
              Start a new chat to build memory, run tools, and keep workspace context in one place.
            </div>
          ) : (
            conversations.map((conversation) => {
              const isActive = selectedConversationId === conversation.id;
              const isDeleting = deletingConversationId === conversation.id;

              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex items-start gap-2 rounded-[24px] border px-3 py-2 transition",
                    isActive
                      ? "border-[#1a78cf]/55 bg-[linear-gradient(135deg,rgba(21,167,243,0.18)_0%,rgba(12,34,53,0.72)_100%)] shadow-[0_18px_40px_rgba(6,17,30,0.18)]"
                      : "border-white/6 bg-white/[0.03] hover:bg-white/[0.06]"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className="min-w-0 flex-1 rounded-xl px-1 py-2 text-left"
                  >
                    <p className="truncate text-sm font-medium text-white">
                      {conversation.title}
                    </p>
                    <p className="mt-1 truncate text-xs text-white/42">
                      {conversation.modelProvider} / {formatUpdatedAt(conversation.updatedAt)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void onDeleteConversation(conversation.id);
                    }}
                    disabled={isDeleting}
                    className="mt-1 rounded-xl p-2 text-white/34 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Delete ${conversation.title}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {pendingInvitations.length > 0 ? (
        <div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">Invitations</p>
            <p className="text-xs text-white/42">{pendingInvitations.length}</p>
          </div>
          <div className="mt-3 space-y-2">
            {pendingInvitations.map((invitation) => (
              <div
                key={invitation.id}
                className="rounded-2xl border border-white/10 bg-black/10 px-3 py-3"
              >
                <p className="truncate text-sm font-medium text-white">
                  {invitation.workspaceName}
                </p>
                <p className="mt-1 truncate text-xs text-white/42">
                  {invitation.organizationName} / {invitation.role}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void onAcceptInvitation(invitation.id);
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10"
                >
                  <Check className="size-3.5" />
                  Accept
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
        <Link
          href="/admin"
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
        >
          <Shield className="size-4" />
          Admin
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-transparent px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-4" />
          Logout
        </button>
        <div className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4">
          <p className="truncate text-sm font-medium text-white">{userName}</p>
          <p className="mt-1 truncate text-xs text-white/42">{userEmail}</p>
        </div>
      </div>
    </aside>
  );
}

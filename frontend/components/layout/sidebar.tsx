import Link from "next/link";
import {
  MessageSquarePlus,
  PanelsTopLeft,
  Settings2,
  Shield,
  Trash2,
  UserCircle2
} from "lucide-react";

import { AppIdentity } from "@/components/ui/app-identity";
import { ConversationSummary, WorkspaceSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SidebarProps {
  className?: string;
  userName: string;
  userEmail: string;
  currentWorkspace: WorkspaceSummary | null;
  pendingInvitationsCount: number;
  conversations: ConversationSummary[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onCreateConversation: () => void;
  onOpenWorkspaceSettings: () => void;
  onOpenProfileSettings: () => void;
  onDeleteConversation: (conversationId: string) => void | Promise<void>;
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
  pendingInvitationsCount,
  conversations,
  selectedConversationId,
  onSelectConversation,
  onCreateConversation,
  onOpenWorkspaceSettings,
  onOpenProfileSettings,
  onDeleteConversation,
  deletingConversationId = null
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,#07101b_0%,#0b1623_48%,#0d1826_100%)] p-4 text-white shadow-[0_32px_90px_rgba(2,8,20,0.34)] sm:p-5",
        className
      )}
    >
      <Link
        href="/"
        className="rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.03)_100%)] p-4 transition hover:bg-white/10"
      >
        <AppIdentity tone="dark" showSubtitle={false} showTagline={false} />
        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/5 px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">
            Workspace
          </p>
          <p className="mt-2 truncate text-sm font-semibold text-white">
            {currentWorkspace?.name ?? "No workspace selected"}
          </p>
          <p className="mt-1 truncate text-xs text-white/42">
            {currentWorkspace?.organizationName ?? "No organization context"}
          </p>
        </div>
      </Link>

      <button
        type="button"
        onClick={onCreateConversation}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.28)] transition hover:brightness-105"
      >
        <MessageSquarePlus className="size-4" />
        New Chat
      </button>

      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/38">
            Conversations
          </p>
          <p className="text-xs text-white/38">{conversations.length}</p>
        </div>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
          {conversations.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-white/5 p-4 text-sm text-white/48">
              Start a new chat to turn this workspace into an engineering thread with memory,
              tools, and task history.
            </div>
          ) : (
            conversations.map((conversation) => {
              const isActive = selectedConversationId === conversation.id;
              const isDeleting = deletingConversationId === conversation.id;

              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex items-start gap-2 rounded-[22px] border px-3 py-2 transition",
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

      <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={onOpenWorkspaceSettings}
          className="inline-flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-white/10"
        >
          <span className="inline-flex items-center gap-2">
            <Settings2 className="size-4" />
            Workspace
          </span>
          {pendingInvitationsCount > 0 ? (
            <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-white/70">
              {pendingInvitationsCount}
            </span>
          ) : null}
        </button>
        <Link
          href="/admin"
          className="inline-flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
        >
          <Shield className="size-4" />
          Admin
        </Link>
        <button
          type="button"
          onClick={onOpenProfileSettings}
          className="inline-flex w-full items-center justify-between rounded-2xl border border-white/10 bg-transparent px-4 py-3 text-left text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white"
        >
          <span className="inline-flex items-center gap-2">
            <UserCircle2 className="size-4" />
            Profile
          </span>
          <PanelsTopLeft className="size-4 text-white/45" />
        </button>
        <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
          <p className="truncate text-sm font-medium text-white">{userName}</p>
          <p className="mt-1 truncate text-xs text-white/42">{userEmail}</p>
        </div>
      </div>
    </aside>
  );
}

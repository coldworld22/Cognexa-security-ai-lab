import { Bot, DatabaseZap, FolderSearch, PanelLeft, Plus, ShieldCheck } from "lucide-react";

import { ConversationSummary } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const modules = [
  { name: "Chat", icon: Bot },
  { name: "Memory", icon: DatabaseZap },
  { name: "RAG", icon: FolderSearch },
  { name: "Admin", icon: ShieldCheck }
];

interface SidebarProps {
  userName: string;
  userEmail: string;
  conversations: ConversationSummary[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onCreateConversation: () => void;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function Sidebar({
  userName,
  userEmail,
  conversations,
  selectedConversationId,
  onSelectConversation,
  onCreateConversation
}: SidebarProps) {
  return (
    <aside className="space-y-5">
      <Card className="bg-pine text-sand">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sand/70">Security AI Lab</p>
            <h1 className="mt-2 text-2xl font-semibold">Control Plane</h1>
          </div>
          <PanelLeft className="size-5 text-sand/70" />
        </div>
        <p className="mt-4 text-sm text-sand/80">
          Self-hosted assistant workspace for security engineering, retrieval, and automation.
        </p>
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
          <p className="text-sm font-semibold">{userName}</p>
          <p className="text-xs text-sand/70">{userEmail}</p>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-black/60">Modules</h2>
          <Badge>Local</Badge>
        </div>
        <div className="mt-4 space-y-3">
          {modules.map((module) => (
            <div
              key={module.name}
              className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white/50 px-4 py-3"
            >
              <module.icon className="size-4 text-ember" />
              <span className="text-sm font-medium text-ink">{module.name}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-black/60">Sessions</h2>
          <button
            type="button"
            onClick={onCreateConversation}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink"
          >
            <Plus className="size-3.5" />
            New
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {conversations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-4 text-sm text-black/55">
              No conversation yet. Start a session from the composer or create one here.
            </div>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelectConversation(conversation.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedConversationId === conversation.id
                    ? "border-pine/20 bg-pine/10"
                    : "border-black/5 bg-white/60 hover:bg-white/85"
                }`}
              >
                <p className="text-sm font-semibold text-ink">{conversation.title}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-black/55">
                  {conversation.modelProvider} / {conversation.modelName}
                </p>
                <p className="mt-2 text-xs text-black/50">
                  {formatUpdatedAt(conversation.updatedAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </Card>
    </aside>
  );
}

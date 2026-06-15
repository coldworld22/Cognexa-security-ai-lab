import Link from "next/link";
import { Activity, LogOut, Shield, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface TopbarProps {
  userName: string;
  providerCount: number;
  conversationCount: number;
  onLogout: () => void;
}

export function Topbar({
  userName,
  providerCount,
  conversationCount,
  onLogout
}: TopbarProps) {
  return (
    <Card className="flex flex-col gap-4 bg-gradient-to-r from-white/80 via-sand/80 to-mist/80 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <Badge className="bg-ember/10 text-ember">Live Workspace</Badge>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
          Connected control plane for local-first AI workflows
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-black/65">
          Signed in as {userName}. The workspace is pulling live providers, tools, memory context, and conversations
          from the backend.
        </p>
      </div>

      <div className="flex gap-3">
        <div className="rounded-full border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-ink">
          {providerCount} providers / {conversationCount} sessions
        </div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-full bg-pine px-5 py-3 text-sm font-semibold text-sand transition hover:bg-pine/90"
        >
          <Shield className="size-4" />
          Admin
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white"
        >
          <Activity className="size-4" />
          Auth
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-transparent px-5 py-3 text-sm font-semibold text-ink"
        >
          <Sparkles className="size-4 text-ember" />
          Logout
          <LogOut className="size-4" />
        </button>
      </div>
    </Card>
  );
}

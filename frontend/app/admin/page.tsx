import { BarChart3, Cpu, HeartPulse, Users } from "lucide-react";

import { MetricsGrid } from "@/components/admin/metrics-grid";
import { Card } from "@/components/ui/card";

const panels = [
  {
    title: "Users",
    icon: Users,
    content: "Review registrations, roles, session activity, and preference distribution."
  },
  {
    title: "Costs",
    icon: BarChart3,
    content: "Track prompt volume, embedding activity, and future model-cost budgets."
  },
  {
    title: "Model Usage",
    icon: Cpu,
    content: "Compare throughput across Qwen, Llama, Mistral, and Gemma providers."
  },
  {
    title: "System Health",
    icon: HeartPulse,
    content: "Monitor Redis, PostgreSQL, vector search, and ingestion pipelines."
  }
];

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#eef2ea_0%,_#e4ddcf_100%)] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card className="bg-pine text-sand">
          <p className="text-xs uppercase tracking-[0.24em] text-sand/70">Admin Dashboard</p>
          <h1 className="mt-2 text-4xl font-semibold">Operations and model governance</h1>
          <p className="mt-3 max-w-3xl text-sm text-sand/80">
            This surface is wired for user oversight, cost tracking, model analytics, and dependency health.
          </p>
        </Card>

        <MetricsGrid />

        <div className="grid gap-4 md:grid-cols-2">
          {panels.map((panel) => (
            <Card key={panel.title}>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-ember/10 p-3 text-ember">
                  <panel.icon className="size-5" />
                </div>
                <h2 className="text-2xl font-semibold text-ink">{panel.title}</h2>
              </div>
              <p className="mt-4 text-sm text-black/70">{panel.content}</p>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}

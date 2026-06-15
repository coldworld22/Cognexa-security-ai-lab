import { Bot, BrainCircuit, Database, Wrench } from "lucide-react";

import { agentPlan } from "@/lib/mock-data";
import { MemoryItem, ToolDescriptor } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface ContextRailProps {
  memoryItems: MemoryItem[];
  tools: ToolDescriptor[];
}

export function ContextRail({ memoryItems, tools }: ContextRailProps) {
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-2">
          <BrainCircuit className="size-4 text-ember" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-black/60">Memory</h3>
        </div>
        <div className="mt-4 space-y-3">
          {memoryItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-4 text-sm text-black/55">
              Memory will populate after you start using the assistant.
            </div>
          ) : (
            memoryItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-black/5 bg-white/60 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">{item.key}</p>
                  <Badge>{item.memoryType.replace("_", " ")}</Badge>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-black/70">{item.value}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-ember" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-black/60">Agent Plan</h3>
        </div>
        <div className="mt-4 space-y-3">
          {agentPlan.map((step) => (
            <div key={step.id} className="rounded-2xl border border-black/5 bg-white/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">{step.title}</p>
                <Badge className="bg-white">{step.state}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-ember" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-black/60">Tools</h3>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {tools.map((tool) => (
            <Badge key={tool.name} className="bg-pine/5 text-pine">
              {tool.name}
            </Badge>
          ))}
        </div>
      </Card>

      <Card className="bg-pine text-sand">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-sand" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-sand/70">RAG Stack</h3>
        </div>
        <p className="mt-4 text-sm text-sand/80">
          Uploads, chunking, embeddings, pgvector, and Qdrant are scaffolded. Replace placeholder parsers and embedding
          generation with production adapters.
        </p>
      </Card>
    </div>
  );
}

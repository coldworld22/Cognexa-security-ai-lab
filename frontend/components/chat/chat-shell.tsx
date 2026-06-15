import { ChatMessage, LlmProviderCatalog, MemoryItem, ToolDescriptor } from "@/lib/types";

import { ContextRail } from "./context-rail";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";
import { Card } from "@/components/ui/card";

interface ChatShellProps {
  conversationTitle: string;
  messages: ChatMessage[];
  pending: boolean;
  error: string | null;
  providers: LlmProviderCatalog[];
  selectedProvider: string;
  selectedModel: string;
  memoryItems: MemoryItem[];
  tools: ToolDescriptor[];
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
  onSend: (message: string) => void | Promise<void>;
}

export function ChatShell({
  conversationTitle,
  messages,
  pending,
  error,
  providers,
  selectedProvider,
  selectedModel,
  memoryItems,
  tools,
  onProviderChange,
  onModelChange,
  onSend
}: ChatShellProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
      <div className="space-y-5">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-black/50">Live Chat Surface</p>
              <h3 className="mt-2 text-2xl font-semibold text-ink">{conversationTitle}</h3>
            </div>
            <div className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black/55">
              {pending ? "Streaming" : "Connected"}
            </div>
          </div>
        </Card>
        {error ? (
          <Card className="border-red-200 bg-red-50/80">
            <p className="text-sm font-semibold text-red-700">Request error</p>
            <p className="mt-2 text-sm text-red-600">{error}</p>
          </Card>
        ) : null}
        <MessageList messages={messages} />
        <MessageComposer
          providers={providers}
          selectedProvider={selectedProvider}
          selectedModel={selectedModel}
          disabled={pending}
          onProviderChange={onProviderChange}
          onModelChange={onModelChange}
          onSend={onSend}
        />
      </div>
      <ContextRail memoryItems={memoryItems} tools={tools} />
    </div>
  );
}

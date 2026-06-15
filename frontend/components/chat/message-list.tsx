import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: ChatMessage[];
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "rounded-[28px] border px-5 py-4",
            message.role === "assistant"
              ? "border-pine/10 bg-white/70"
              : message.role === "system"
                ? "border-black/10 bg-mist/50"
              : "ml-auto max-w-2xl border-ember/20 bg-ember/10"
          )}
        >
          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-black/50">
            <span>{message.role}</span>
            <span>{formatMessageTime(message.createdAt)}</span>
          </div>
          <div className="prose prose-sm max-w-none prose-headings:text-ink prose-p:text-black/80 prose-strong:text-ink prose-code:text-ember">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AppIdentity } from "@/components/ui/app-identity";
import { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: ChatMessage[];
}

const starterCards = [
  {
    eyebrow: "Security Review",
    title: "Audit the authentication flow",
    body: "Trace login, session refresh, and protected routes from frontend to backend."
  },
  {
    eyebrow: "RAG Trace",
    title: "Inspect retrieval and ingestion",
    body: "Map document parsing, vector storage, and retrieval behavior across the stack."
  },
  {
    eyebrow: "Workspace Summary",
    title: "Summarize current context",
    body: "Combine chat history, memory, tools, and providers into a concise operating brief."
  }
];

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
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex min-h-[48vh] items-center justify-center px-4">
        <div className="w-full max-w-4xl">
          <AppIdentity size="lg" />
          <h2 className="mt-10 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl md:text-5xl">
            Start with a concrete security task.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
            Ask about your codebase, uploaded files, memory context, or run a tool-assisted task
            from the workspace panel.
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {starterCards.map((card) => (
              <div
                key={card.title}
                className="rounded-[26px] border border-white/70 bg-white/70 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
                  {card.eyebrow}
                </p>
                <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                  {card.title}
                </p>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-6">
      {messages.map((message) => {
        const isAssistant = message.role === "assistant";
        const isUser = message.role === "user";
        const isSystem = message.role === "system";

        return (
          <div
            key={message.id}
            className={cn(
              "flex",
              isUser ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-full",
                isUser && "max-w-[90%] sm:max-w-[80%]",
                isAssistant && "w-full",
                isSystem && "w-full"
              )}
            >
              <div className="mb-2 flex items-center gap-2 px-1 text-xs uppercase tracking-[0.18em] text-black/40">
                <span>
                  {isAssistant ? "Assistant" : isUser ? "You" : message.role}
                </span>
                <span>{formatMessageTime(message.createdAt)}</span>
              </div>
              <div
                className={cn(
                  "overflow-hidden rounded-[28px] px-4 py-4 sm:rounded-[30px] sm:px-5",
                  isAssistant && "bg-transparent text-[#111827]",
                  isUser && "bg-[linear-gradient(135deg,#dceeff_0%,#eaf3ff_100%)] text-[#111827] shadow-[0_16px_35px_rgba(59,130,246,0.08)]",
                  isSystem && "border border-black/10 bg-[#f2f4f7] text-black/70"
                )}
              >
                <div className="prose prose-sm max-w-none break-words prose-headings:text-[#111827] prose-p:text-current prose-strong:text-[#111827] prose-code:text-[#b45309] prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:bg-[#111827] prose-pre:text-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content || (isAssistant ? "Thinking..." : "")}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

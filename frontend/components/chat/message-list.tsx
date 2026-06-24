"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AppIdentity } from "@/components/ui/app-identity";
import { useI18n } from "@/lib/i18n";
import { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const { formatTime, t } = useI18n();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const starterCards = [
    {
      eyebrow: t("chat.starterCards.security.eyebrow"),
      title: t("chat.starterCards.security.title"),
      body: t("chat.starterCards.security.body")
    },
    {
      eyebrow: t("chat.starterCards.documents.eyebrow"),
      title: t("chat.starterCards.documents.title"),
      body: t("chat.starterCards.documents.body")
    },
    {
      eyebrow: t("chat.starterCards.agents.eyebrow"),
      title: t("chat.starterCards.agents.title"),
      body: t("chat.starterCards.agents.body")
    }
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center px-2 py-6 sm:px-4">
        <div className="w-full max-w-5xl rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(244,248,251,0.72)_100%)] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-8">
          <AppIdentity size="md" showTagline={false} />
          <div className="mt-8 flex flex-wrap gap-2">
            <span className="rounded-full border border-black/8 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              {t("common.chat")}
            </span>
            <span className="rounded-full border border-black/8 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              {t("common.memory")}
            </span>
            <span className="rounded-full border border-black/8 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              {t("common.agents")}
            </span>
            <span className="rounded-full border border-black/8 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              {t("common.security")}
            </span>
          </div>
          <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
            {t("chat.startTaskTitle")}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
            {t("chat.startTaskDescription")}
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {starterCards.map((card) => (
              <div
                key={card.title}
                className="rounded-[24px] border border-white/80 bg-white/78 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur"
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8">
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
                isUser && "max-w-[92%] sm:max-w-[76%]",
                isAssistant && "w-full max-w-[72rem]",
                isSystem && "w-full"
              )}
            >
              <div className="mb-2 flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.18em] text-black/38">
                <span>
                  {isAssistant ? t("chat.assistant") : isUser ? t("chat.you") : message.role}
                </span>
                <span>{formatTime(message.createdAt)}</span>
              </div>
              <div
                className={cn(
                  "overflow-hidden rounded-[26px] px-4 py-4 sm:px-5",
                  isAssistant &&
                    "border border-black/6 bg-white/68 text-[#111827] shadow-[0_14px_35px_rgba(15,23,42,0.04)]",
                  isUser &&
                    "bg-[linear-gradient(135deg,#dceeff_0%,#eaf3ff_100%)] text-[#111827] shadow-[0_16px_35px_rgba(59,130,246,0.08)]",
                  isSystem && "border border-black/10 bg-[#f2f4f7] text-black/70"
                )}
              >
                <div className="prose prose-sm max-w-none break-words prose-headings:text-[#111827] prose-p:text-current prose-strong:text-[#111827] prose-code:text-[#b45309] prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:bg-[#111827] prose-pre:text-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content || (isAssistant ? t("chat.thinking") : "")}
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

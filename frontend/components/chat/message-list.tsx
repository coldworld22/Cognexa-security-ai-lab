"use client";

import { useEffect, useRef } from "react";
import { Bot, Clipboard, FileStack, Sparkles, UserRound } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AppIdentity } from "@/components/ui/app-identity";
import { useI18n } from "@/lib/i18n";
import { ChatMessage, ChatMessageSource } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: ChatMessage[];
  pending?: boolean;
  onPromptSelect?: (prompt: string) => void | Promise<void>;
}

function formatSourceScore(score: number): string {
  if (!Number.isFinite(score)) {
    return "-";
  }

  if (score >= 0 && score <= 1) {
    return `${Math.round(score * 100)}%`;
  }

  return score.toFixed(2);
}

function MessageSources({ sources }: { sources: ChatMessageSource[] }) {
  const { t } = useI18n();

  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
        {t("chat.sources")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {sources.slice(0, 4).map((source) => (
          <div
            key={`${source.fileId}-${source.chunkIndex}-${source.embeddingId}`}
            className="rounded-[22px] border border-black/6 bg-[var(--surface-soft)] px-4 py-3"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--brand-blue)] shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                <FileStack className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {source.fileName}
                </p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  {source.chunkReference || `Chunk ${source.chunkIndex + 1}`}
                </p>
                <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  {t("chat.matchScore", {
                    score: formatSourceScore(source.score)
                  })}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  pending = false,
  onPromptSelect
}: MessageListProps) {
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

  async function handleCopy(content: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Ignore clipboard failures; the action is optional.
    }
  }

  if (messages.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center px-2 py-6 sm:px-4">
        <div className="w-full max-w-4xl rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,249,252,0.9)_100%)] p-6 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:p-8">
          <AppIdentity size="md" showTagline={false} />
          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-black/6 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            <Sparkles className="size-3.5 text-[var(--brand-blue)]" />
            {t("chat.quickPrompts")}
          </div>
          <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.05em] text-[var(--text-primary)] sm:text-4xl">
            {t("chat.startTaskTitle")}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
            {t("chat.startTaskDescription")}
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {starterCards.map((card) => (
              <button
                key={card.title}
                type="button"
                onClick={() => {
                  void onPromptSelect?.(card.title);
                }}
                className="rounded-[26px] border border-white/80 bg-white px-5 py-5 text-left shadow-[0_16px_40px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[var(--brand-blue)]/18 hover:shadow-[0_18px_48px_rgba(15,23,42,0.08)]"
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
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 pb-8">
      {messages.map((message) => {
        const isAssistant = message.role === "assistant";
        const isUser = message.role === "user";
        const isSystem = message.role === "system";
        const sources = message.metadata?.retrieval?.sources ?? [];
        const canCopy = message.content.trim().length > 0;

        if (isSystem) {
          return (
            <div key={message.id} className="flex justify-center">
              <div className="max-w-3xl rounded-full border border-black/8 bg-white/88 px-4 py-2 text-center text-xs text-[var(--text-secondary)] shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
                {message.content}
              </div>
            </div>
          );
        }

        if (isUser) {
          return (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[92%] sm:max-w-[78%]">
                <div className="mb-2 flex items-center justify-end gap-2 px-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  <span>{formatTime(message.createdAt)}</span>
                  <span>{t("chat.you")}</span>
                  <span className="flex size-7 items-center justify-center rounded-full bg-[var(--brand-deep)] text-white shadow-[0_10px_28px_rgba(11,59,99,0.28)]">
                    <UserRound className="size-3.5" />
                  </span>
                </div>
                <div className="rounded-[28px] bg-[linear-gradient(135deg,#10243a_0%,#0f172a_100%)] px-5 py-4 text-white shadow-[0_18px_42px_rgba(15,23,42,0.18)]">
                  <div className="prose prose-sm prose-invert max-w-none break-words prose-headings:text-white prose-p:my-3 prose-p:text-white/90 prose-strong:text-white prose-code:rounded prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.92em] prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:rounded-2xl prose-pre:bg-white/10 prose-pre:text-white">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={message.id} className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
            <div className="hidden md:flex">
              <div className="flex size-10 items-center justify-center rounded-[18px] bg-[linear-gradient(145deg,#14adf5_0%,#0f83dc_52%,#0a456e_100%)] text-white shadow-[0_16px_38px_rgba(21,167,243,0.24)]">
                <Bot className="size-4" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  <span className="flex size-8 items-center justify-center rounded-[16px] bg-[linear-gradient(145deg,#14adf5_0%,#0f83dc_52%,#0a456e_100%)] text-white shadow-[0_12px_28px_rgba(21,167,243,0.2)] md:hidden">
                    <Bot className="size-4" />
                  </span>
                  <span>{t("chat.assistant")}</span>
                  <span>{formatTime(message.createdAt)}</span>
                </div>

                {canCopy ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopy(message.content);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)] transition hover:border-black/10 hover:text-[var(--text-primary)]"
                    aria-label={t("chat.copyMessage")}
                    title={t("chat.copyMessage")}
                  >
                    <Clipboard className="size-3.5" />
                    {t("chat.copyMessage")}
                  </button>
                ) : null}
              </div>

              <div className="rounded-[30px] bg-transparent px-1 py-1 text-[var(--text-primary)]">
                {message.content.trim().length > 0 ? (
                  <div className="prose prose-sm max-w-none break-words prose-headings:text-[var(--text-primary)] prose-p:my-3 prose-p:text-[var(--text-primary)] prose-a:text-[var(--brand-blue)] prose-a:no-underline hover:prose-a:underline prose-strong:text-[var(--text-primary)] prose-code:rounded prose-code:bg-[var(--surface-soft)] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[#8a3d0a] prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:overflow-x-auto prose-pre:rounded-[24px] prose-pre:bg-[#0f172a] prose-pre:px-4 prose-pre:py-4 prose-pre:text-white">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-3 rounded-full border border-black/6 bg-white px-4 py-3 text-sm text-[var(--text-secondary)] shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                    <Sparkles className={cn("size-4 text-[var(--brand-blue)]", pending && "animate-pulse")} />
                    {t("chat.thinking")}
                  </div>
                )}

                <MessageSources sources={sources} />
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

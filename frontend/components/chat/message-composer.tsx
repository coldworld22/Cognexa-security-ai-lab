"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { SendHorizontal, SlidersHorizontal } from "lucide-react";

import { APP_NAME } from "@/lib/branding";
import { LlmProviderCatalog } from "@/lib/types";

interface MessageComposerProps {
  providers: LlmProviderCatalog[];
  selectedProvider: string;
  selectedModel: string;
  disabled?: boolean;
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
  onSend: (message: string) => void | Promise<void>;
}

export function MessageComposer({
  providers,
  selectedProvider,
  selectedModel,
  disabled = false,
  onProviderChange,
  onModelChange,
  onSend
}: MessageComposerProps) {
  const [message, setMessage] = useState("");
  const models =
    providers.find((provider) => provider.id === selectedProvider)?.models ?? [];
  const isModelReady = models.length > 0 && models.includes(selectedModel);
  const isSubmitDisabled = disabled || !isModelReady;

  async function submitMessage() {
    const trimmed = message.trim();
    if (!trimmed || isSubmitDisabled) {
      return;
    }

    await onSend(trimmed);
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage();
  }

  async function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    await submitMessage();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(247,250,252,0.86)_100%)] px-4 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur sm:px-5"
    >
      <textarea
        id="message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
        disabled={isSubmitDisabled}
        placeholder={`Ask ${APP_NAME} to inspect code, memory, tools, or retrieval context`}
        className="min-h-28 w-full resize-none border-0 bg-transparent px-1 py-1 text-[15px] leading-6 text-[#111827] outline-none placeholder:text-black/40"
      />

      <div className="mt-4 border-t border-black/5 pt-3">
        <div className="flex items-center gap-2 rounded-full border border-black/5 bg-white/65 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black/45">
          <SlidersHorizontal className="size-3.5" />
          Runtime
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <select
            value={selectedProvider}
            onChange={(event) => onProviderChange(event.target.value)}
            className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#111827] outline-none"
          >
            {providers.map((provider) => (
              <option
                key={provider.id}
                value={provider.id}
                disabled={provider.models.length === 0}
              >
                {provider.models.length > 0
                  ? provider.id
                  : `${provider.id} (not installed)`}
              </option>
            ))}
          </select>
          <select
            value={selectedModel}
            onChange={(event) => onModelChange(event.target.value)}
            disabled={models.length === 0}
            className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#111827] outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {models.length > 0 ? (
              models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))
            ) : (
              <option value="">No installed models</option>
            )}
          </select>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-black/42">
            Enter to send. Shift + Enter for a new line.
          </p>

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-black/20 disabled:shadow-none sm:w-auto"
          >
            <SendHorizontal className="size-4" />
            {disabled ? "Responding..." : "Send"}
          </button>
        </div>
      </div>

      {models.length === 0 ? (
        <p className="mt-3 text-sm text-amber-700">
          No local models are installed for `{selectedProvider}`.
        </p>
      ) : null}
    </form>
  );
}

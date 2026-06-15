"use client";

import { FormEvent, useState } from "react";
import { SendHorizontal } from "lucide-react";

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || disabled) {
      return;
    }

    await onSend(trimmed);
    setMessage("");
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[28px] border border-black/10 bg-white/70 p-3 shadow-panel">
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-black/55">
            Provider
          </span>
          <select
            value={selectedProvider}
            onChange={(event) => onProviderChange(event.target.value)}
            className="w-full rounded-2xl border border-black/10 bg-sand/60 px-4 py-3 text-sm text-ink outline-none"
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.id}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-black/55">
            Model
          </span>
          <select
            value={selectedModel}
            onChange={(event) => onModelChange(event.target.value)}
            className="w-full rounded-2xl border border-black/10 bg-sand/60 px-4 py-3 text-sm text-ink outline-none"
          >
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <textarea
          id="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          disabled={disabled}
          placeholder="Ask the assistant to correlate chats, memories, tools, and retrieval."
          className="min-h-28 flex-1 resize-none rounded-[22px] border border-black/10 bg-sand/60 px-4 py-3 text-sm text-ink outline-none placeholder:text-black/40"
        />
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center justify-center gap-2 rounded-[22px] bg-ink px-6 py-4 text-sm font-semibold text-sand transition hover:bg-pine"
        >
          <SendHorizontal className="size-4" />
          {disabled ? "Streaming..." : "Stream"}
        </button>
      </div>
    </form>
  );
}

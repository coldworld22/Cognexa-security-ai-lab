"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState
} from "react";
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const models =
    providers.find((provider) => provider.id === selectedProvider)?.models ?? [];
  const isModelReady = models.length > 0 && models.includes(selectedModel);
  const isSubmitDisabled = disabled || !isModelReady;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [message]);

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
      className="rounded-[26px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(247,250,252,0.92)_100%)] px-4 py-3 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur sm:px-5"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">
            <SlidersHorizontal className="size-3.5" />
            Runtime
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[28rem] lg:flex-1 lg:max-w-[38rem]">
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
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <textarea
            ref={textareaRef}
            id="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isSubmitDisabled}
            placeholder={`Ask ${APP_NAME} to inspect code, memory, tools, or retrieval context`}
            className="max-h-[200px] min-h-[56px] w-full resize-none overflow-y-auto rounded-[22px] border border-black/6 bg-white/78 px-4 py-4 text-[15px] leading-6 text-[#111827] outline-none transition focus:border-[var(--brand-blue)]/35 placeholder:text-black/40"
          />

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="inline-flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-black/20 disabled:shadow-none lg:w-auto lg:min-w-[126px]"
          >
            <SendHorizontal className="size-4" />
            {disabled ? "Responding..." : "Send"}
          </button>
        </div>

        <div className="flex flex-col gap-2 border-t border-black/5 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-black/42">
            Enter to send. Shift + Enter for a new line.
          </p>
          <p className="text-xs text-black/46">
            Auto-expands up to 200px.
          </p>
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

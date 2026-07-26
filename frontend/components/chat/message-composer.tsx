"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, SendHorizontal, SlidersHorizontal } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { LlmProviderCatalog } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [isRuntimeOpen, setIsRuntimeOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedProviderCatalog = providers.find(
    (provider) => provider.id === selectedProvider
  );
  const models = selectedProviderCatalog?.models ?? [];
  const compactModel = selectedModel.replace(/:latest$/i, "");
  const isProviderCatalogLoaded = providers.length > 0;
  const isModelReady =
    models.length > 0 &&
    models.some(
      (model) =>
        model.replace(/:latest$/i, "").toLowerCase() ===
        selectedModel.replace(/:latest$/i, "").toLowerCase()
    );
  const hasMessage = message.trim().length > 0;
  const isComposerDisabled = disabled || !isModelReady;
  const isSubmitDisabled = isComposerDisabled || !hasMessage;
  const runtimeLabel =
    selectedProvider && compactModel
      ? `${selectedProvider} / ${compactModel}`
      : selectedProvider || compactModel || t("chat.modelUnassigned");

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [message]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    textareaRef.current?.focus();
  }, [disabled]);

  async function submitMessage() {
    const trimmed = message.trim();
    if (!trimmed || isComposerDisabled) {
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
      className="rounded-[30px] border border-white/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,252,0.94)_100%)] px-3 py-3 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:px-4"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-1">
          <button
            type="button"
            onClick={() => setIsRuntimeOpen((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)] transition hover:border-black/10 hover:text-[var(--text-primary)]"
          >
            <SlidersHorizontal className="size-3.5" />
            {t("composer.runtime")}
            <ChevronDown
              className={cn(
                "size-3.5 transition",
                isRuntimeOpen && "rotate-180"
              )}
            />
          </button>

          <div
            className="max-w-full truncate rounded-full border border-black/6 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]"
            title={runtimeLabel}
          >
            {runtimeLabel}
          </div>
        </div>

        {isRuntimeOpen ? (
          <div className="grid gap-2 border-t border-black/5 px-2 pt-3 sm:grid-cols-2">
            <select
              value={selectedProvider}
              onChange={(event) => onProviderChange(event.target.value)}
              className="w-full rounded-[20px] border border-black/8 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/30"
            >
              {providers.map((provider) => (
                <option
                  key={provider.id}
                  value={provider.id}
                  disabled={provider.models.length === 0}
                >
                  {provider.models.length > 0
                    ? provider.id
                    : t("composer.providerNotInstalled", { provider: provider.id })}
                </option>
              ))}
            </select>

            <select
              value={selectedModel}
              onChange={(event) => onModelChange(event.target.value)}
              disabled={models.length === 0}
              className="w-full rounded-[20px] border border-black/8 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {models.length > 0 ? (
                models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))
              ) : (
                <option value="">{t("composer.noInstalledModels")}</option>
              )}
            </select>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <textarea
            ref={textareaRef}
            id="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isComposerDisabled}
            placeholder={t("composer.placeholder")}
            className="max-h-[220px] min-h-[62px] w-full resize-none overflow-y-auto rounded-[24px] border border-black/8 bg-white px-4 py-4 text-[15px] leading-6 text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-blue)]/35 placeholder:text-black/36"
          />

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="inline-flex h-[56px] w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-black/20 disabled:shadow-none lg:w-[56px] lg:px-0"
            aria-label={disabled ? t("composer.responding") : t("composer.send")}
            title={disabled ? t("composer.responding") : t("composer.send")}
          >
            <SendHorizontal className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2 border-t border-black/5 px-2 pt-3 text-xs text-[var(--text-tertiary)] sm:flex-row sm:items-center sm:justify-between">
          <p>{t("composer.enterToSend")}</p>
          <p>{disabled ? t("composer.responding") : t("composer.autoExpand")}</p>
        </div>
      </div>

      {isProviderCatalogLoaded && selectedProviderCatalog && models.length === 0 ? (
        <p className="mt-3 px-2 text-sm text-amber-700">
          {t("composer.noLocalModels", { provider: selectedProvider })}
        </p>
      ) : null}
    </form>
  );
}

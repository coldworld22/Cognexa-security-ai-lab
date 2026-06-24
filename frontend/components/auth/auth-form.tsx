"use client";

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  UserRound
} from "lucide-react";

import {
  getStoredSession,
  login,
  mergeSessionWithWorkspacePayload,
  restoreStoredSession,
  storeSession,
  switchWorkspace
} from "@/lib/api";
import { getLocaleFromPreferenceValue, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import {
  findWorkspaceMatch,
  persistWorkspaceHints,
  readWorkspaceHints,
  type WorkspaceHint
} from "./workspace-hints";

export function AuthForm() {
  const router = useRouter();
  const { applyLocale, dir, locale, setLocale, t } = useI18n();
  const [username, setUsername] = useState("");
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showWorkspaceOptions, setShowWorkspaceOptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [workspaceHints, setWorkspaceHints] = useState<WorkspaceHint[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const storedSession = getStoredSession();
      if (!storedSession) {
        return;
      }

      setIsSubmitting(true);
      setError(null);
      setSupportMessage(null);

      const restoredSession = await restoreStoredSession();
      if (cancelled) {
        return;
      }

      if (!restoredSession) {
        setIsSubmitting(false);
        return;
      }

      const preferredLocale = getLocaleFromPreferenceValue(
        restoredSession.user.preferences?.language
      );

      if (preferredLocale) {
        applyLocale(preferredLocale);
      } else {
        setLocale(locale);
      }

      router.replace("/");
      router.refresh();
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [applyLocale, locale, router, setLocale]);

  useEffect(() => {
    setWorkspaceHints(readWorkspaceHints());
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSupportMessage(null);

    try {
      const persistence = rememberMe ? "local" : "session";
      const session = await login(
        {
          username: username.trim(),
          password
        },
        {
          persistence
        }
      );

      let nextSession = session;
      const requestedWorkspace = workspaceQuery.trim();

      if (requestedWorkspace) {
        const matchedWorkspace = findWorkspaceMatch(session.workspaces, requestedWorkspace);

        if (matchedWorkspace && matchedWorkspace.id !== session.currentWorkspace?.id) {
          try {
            const workspacePayload = await switchWorkspace(matchedWorkspace.id);
            nextSession = mergeSessionWithWorkspacePayload(session, workspacePayload);
            storeSession(nextSession, persistence);
          } catch {
            // Keep the authenticated default workspace if the switch request fails.
          }
        }

        setWorkspaceHints(
          persistWorkspaceHints(
            nextSession.workspaces,
            matchedWorkspace?.id ?? nextSession.currentWorkspace?.id
          )
        );
      } else {
        setWorkspaceHints(
          persistWorkspaceHints(nextSession.workspaces, nextSession.currentWorkspace?.id)
        );
      }

      const preferredLocale = getLocaleFromPreferenceValue(
        nextSession.user.preferences?.language
      );

      if (preferredLocale) {
        applyLocale(preferredLocale);
      } else {
        setLocale(locale);
      }

      router.replace("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("authForm.authFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCapsLock(event: ReactKeyboardEvent<HTMLInputElement>) {
    setIsCapsLockOn(event.getModifierState("CapsLock"));
  }

  const isDisabled = isSubmitting || username.trim().length === 0 || password.length === 0;
  const isWorkspaceExpanded = showWorkspaceOptions || workspaceQuery.trim().length > 0;
  const inputClassName =
    "w-full rounded-[18px] border border-white/10 bg-white/[0.03] py-3.5 text-base text-white outline-none transition duration-200 placeholder:text-slate-500 focus:border-sky-400/35 focus:bg-white/[0.05] focus:ring-4 focus:ring-sky-400/8";

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-300">
          {t("authForm.usernameLabel")}
        </span>
        <div className="relative">
          <UserRound
            className={`pointer-events-none absolute inset-y-0 my-auto size-4 text-slate-500 ${dir === "rtl" ? "right-4" : "left-4"}`}
          />
          <input
            id="username"
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            placeholder={t("authForm.usernamePlaceholder")}
            className={`${inputClassName} ${dir === "rtl" ? "pr-11 pl-4" : "pl-11 pr-4"}`}
          />
        </div>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-300">
          {t("authForm.passwordLabel")}
        </span>
        <div className="relative">
          <LockKeyhole
            className={`pointer-events-none absolute inset-y-0 my-auto size-4 text-slate-500 ${dir === "rtl" ? "right-4" : "left-4"}`}
          />
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onKeyUp={handleCapsLock}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            placeholder={t("authForm.passwordPlaceholder")}
            className={`${inputClassName} ${dir === "rtl" ? "pr-11 pl-12" : "pl-11 pr-12"}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className={`absolute inset-y-0 inline-flex w-12 items-center justify-center text-slate-500 transition hover:text-slate-200 ${dir === "rtl" ? "left-0" : "right-0"}`}
            aria-label={showPassword ? t("authForm.hidePassword") : t("authForm.showPassword")}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </label>

      {isCapsLockOn ? (
        <div className="rounded-[16px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {t("authForm.capsLockOn")}
        </div>
      ) : null}

      {error ? (
        <div
          aria-live="polite"
          className="rounded-[18px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      ) : null}

      {supportMessage ? (
        <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
          {supportMessage}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <label className="inline-flex items-center gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            className="size-4 rounded border-white/15 bg-white/[0.03] text-sky-500 focus:ring-sky-400/25"
          />
          <span>{t("authForm.rememberMe")}</span>
        </label>

        <button
          type="button"
          onClick={() => setSupportMessage(t("authForm.forgotPasswordSupport"))}
          className="text-sm font-medium text-slate-400 transition hover:text-white"
        >
          {t("authForm.forgotPassword")}
        </button>
      </div>

      <div className="rounded-[18px] border border-white/8 bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setShowWorkspaceOptions((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-slate-300"
          aria-expanded={isWorkspaceExpanded}
        >
          <span className="inline-flex items-center gap-2">
            <Building2 className="size-4 text-slate-500" />
            {t("authForm.workspaceLabel")}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-slate-500 transition-transform duration-200",
              isWorkspaceExpanded && "rotate-180"
            )}
          />
        </button>

        {isWorkspaceExpanded ? (
          <div className="border-t border-white/8 px-4 pb-4 pt-4">
            <div className="relative">
              <input
                id="workspace"
                type="text"
                value={workspaceQuery}
                onChange={(event) => {
                  setWorkspaceQuery(event.target.value);
                  if (supportMessage) {
                    setSupportMessage(null);
                  }
                }}
                placeholder={t("authForm.workspacePlaceholder")}
                className={`${inputClassName} ${dir === "rtl" ? "px-4 text-right" : "px-4 text-left"}`}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {t("authForm.workspaceHelper")}
            </p>

            {workspaceHints.length > 0 ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-medium text-slate-400">
                  {t("authForm.recentWorkspaces")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {workspaceHints.map((workspace) => (
                    <button
                      key={workspace.id}
                      type="button"
                      onClick={() => {
                        setWorkspaceQuery(workspace.slug);
                        setShowWorkspaceOptions(true);
                        if (supportMessage) {
                          setSupportMessage(null);
                        }
                      }}
                      className={cn(
                        "rounded-full border px-3 py-2 text-xs transition",
                        dir === "rtl" ? "text-right" : "text-left",
                        workspaceQuery.trim().toLowerCase() === workspace.slug.toLowerCase()
                          ? "border-sky-400/40 bg-sky-500/12 text-sky-100"
                          : "border-white/8 bg-white/[0.03] text-slate-300 hover:border-white/15 hover:bg-white/[0.05]"
                      )}
                    >
                      <span className="font-medium">{workspace.name}</span>
                      <span className="mx-2 text-slate-500">/</span>
                      <span className="text-slate-400">{workspace.organizationName}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-slate-500">
        {rememberMe ? t("authForm.rememberedHint") : t("authForm.sessionOnlyHint")}
      </p>

      <button
        type="submit"
        disabled={isDisabled}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-[#3b82f6] px-4 py-3.5 text-base font-semibold text-white shadow-[0_14px_32px_rgba(59,130,246,0.24)] transition duration-200 hover:bg-[#4f8ff7] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
      >
        {isSubmitting ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            {t("authForm.signingIn")}
          </>
        ) : (
          <>
            {t("authForm.signIn")}
            <ArrowRight
              className={`size-4 transition-transform duration-200 group-hover:translate-x-0.5 ${dir === "rtl" ? "rtl-flip group-hover:-translate-x-0.5 group-hover:translate-x-0" : ""}`}
            />
          </>
        )}
      </button>
    </form>
  );
}

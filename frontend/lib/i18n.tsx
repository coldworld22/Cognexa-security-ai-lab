"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { getStoredSession, storeSession, updateUserPreferences } from "@/lib/api";
import ar from "@/locales/ar";
import en from "@/locales/en";

export type AppLocale = "en" | "ar";
export type AppDirection = "ltr" | "rtl";

const LOCALE_STORAGE_KEY = "cognexa.locale";
const DEFAULT_LOCALE: AppLocale = "en";

const translations = {
  en,
  ar
} as const;

interface I18nContextValue {
  locale: AppLocale;
  dir: AppDirection;
  t: (key: string, values?: Record<string, string | number>) => string;
  setLocale: (locale: AppLocale) => void;
  applyLocale: (locale: AppLocale) => void;
  formatNumber: (value: number) => string;
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (value: string, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: string, options?: Intl.DateTimeFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNestedValue(source: Record<string, unknown>, key: string): string | undefined {
  const parts = key.split(".");
  let current: unknown = source;

  for (const part of parts) {
    if (!isRecord(current) || !(part in current)) {
      return undefined;
    }

    current = current[part];
  }

  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined ? `{${token}}` : String(value);
  });
}

function normalizeLocale(value: string | null | undefined): AppLocale | null {
  if (!value) {
    return null;
  }

  const lowerValue = value.toLowerCase();

  if (lowerValue.startsWith("ar")) {
    return "ar";
  }

  if (lowerValue.startsWith("en")) {
    return "en";
  }

  return null;
}

function getLocaleFromSession(): AppLocale | null {
  const session = getStoredSession();
  const rawValue = session?.user.preferences?.language;

  return typeof rawValue === "string" ? normalizeLocale(rawValue) : null;
}

function getLocaleFromStorage(): AppLocale | null {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
}

function detectLocale(): AppLocale {
  return (
    getLocaleFromSession() ??
    getLocaleFromStorage() ??
    normalizeLocale(
      typeof navigator === "undefined"
        ? null
        : navigator.languages?.[0] ?? navigator.language
    ) ??
    DEFAULT_LOCALE
  );
}

function getDirection(locale: AppLocale): AppDirection {
  return locale === "ar" ? "rtl" : "ltr";
}

function setStoredLocale(locale: AppLocale) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

function syncStoredSessionLanguage(locale: AppLocale) {
  const session = getStoredSession();

  if (!session) {
    return;
  }

  storeSession({
    ...session,
    user: {
      ...session.user,
      preferences: {
        ...session.user.preferences,
        language: locale
      }
    }
  });
}

function applyDocumentLocale(locale: AppLocale) {
  if (typeof document === "undefined") {
    return;
  }

  const dir = getDirection(locale);
  document.documentElement.lang = locale;
  document.documentElement.dir = dir;
  document.body.dir = dir;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);
  const hasInitialized = useRef(false);

  useEffect(() => {
    const nextLocale = detectLocale();
    setLocaleState(nextLocale);
    setStoredLocale(nextLocale);
    applyDocumentLocale(nextLocale);
    hasInitialized.current = true;
  }, []);

  useEffect(() => {
    if (!hasInitialized.current) {
      return;
    }

    applyDocumentLocale(locale);
  }, [locale]);

  function applyLocale(localeValue: AppLocale) {
    setLocaleState(localeValue);
    setStoredLocale(localeValue);
    syncStoredSessionLanguage(localeValue);
  }

  function setLocale(localeValue: AppLocale) {
    applyLocale(localeValue);

    const session = getStoredSession();
    const currentPreference = session?.user.preferences?.language;

    if (!session || currentPreference === localeValue) {
      return;
    }

    void updateUserPreferences({
      ...session.user.preferences,
      language: localeValue
    }).catch(() => {
      // Keep local preference even if the profile sync fails.
    });
  }

  const value = useMemo<I18nContextValue>(() => {
    const messages = translations[locale] as unknown as Record<string, unknown>;
    const intlLocale = locale === "ar" ? "ar-SA" : "en-US";

    return {
      locale,
      dir: getDirection(locale),
      t: (key, values) =>
        interpolate(
          getNestedValue(messages, key) ?? getNestedValue(translations.en, key) ?? key,
          values
        ),
      setLocale,
      applyLocale,
      formatNumber: (value) => new Intl.NumberFormat(intlLocale).format(value),
      formatDate: (value, options = {}) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return value;
        }

        return new Intl.DateTimeFormat(intlLocale, options).format(date);
      },
      formatTime: (value, options = {}) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return value;
        }

        return new Intl.DateTimeFormat(intlLocale, {
          hour: "2-digit",
          minute: "2-digit",
          ...options
        }).format(date);
      },
      formatDateTime: (value, options = {}) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return value;
        }

        return new Intl.DateTimeFormat(intlLocale, {
          dateStyle: "medium",
          timeStyle: "short",
          ...options
        }).format(date);
      }
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider.");
  }

  return context;
}

export function getLocaleFromPreferenceValue(value: unknown): AppLocale | null {
  return typeof value === "string" ? normalizeLocale(value) : null;
}

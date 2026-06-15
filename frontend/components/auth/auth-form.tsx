"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getStoredSession, login, register } from "@/lib/api";

type AuthMode = "login" | "register";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getStoredSession()) {
      router.replace("/");
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === "register") {
        await register({
          displayName,
          email,
          password
        });
      } else {
        await login({
          email,
          password
        });
      }

      router.push("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <div className="inline-flex rounded-full border border-black/10 bg-sand/50 p-1">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            mode === "login" ? "bg-ink text-sand" : "text-black/55"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            mode === "register" ? "bg-ink text-sand" : "text-black/55"
          }`}
        >
          Register
        </button>
      </div>

      {mode === "register" ? (
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-black/65">Display name</span>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Security Operator"
            className="w-full rounded-2xl border border-black/10 bg-sand/55 px-4 py-3 text-sm outline-none"
          />
        </label>
      ) : null}

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-black/65">Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="security@lab.local"
          className="w-full rounded-2xl border border-black/10 bg-sand/55 px-4 py-3 text-sm outline-none"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-black/65">Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="password"
          className="w-full rounded-2xl border border-black/10 bg-sand/55 px-4 py-3 text-sm outline-none"
        />
      </label>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-sand transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting
          ? "Working..."
          : mode === "register"
            ? "Create account"
            : "Request access token"}
      </button>
    </form>
  );
}

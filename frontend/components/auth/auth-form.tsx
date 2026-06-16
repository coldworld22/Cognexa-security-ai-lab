"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getStoredSession, login } from "@/lib/api";

export function AuthForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
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
      await login({
        username,
        password
      });

      router.push("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-black/65">Username</span>
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Enter username"
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition focus:border-[#2a7ab8]/35 focus:ring-4 focus:ring-[#2a7ab8]/10"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-black/65">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter password"
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition focus:border-[#2a7ab8]/35 focus:ring-4 focus:ring-[#2a7ab8]/10"
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
        className="w-full rounded-2xl bg-[linear-gradient(135deg,#16adf6_0%,#0d7bd5_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(21,167,243,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
      >
        {isSubmitting ? "Working..." : "Sign in"}
      </button>
    </form>
  );
}

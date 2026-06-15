import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";

import { AuthForm } from "@/components/auth/auth-form";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,_#f5ecdf_0%,_#d8dfd5_100%)] px-4 py-10">
      <Card className="w-full max-w-lg bg-white/75 p-8">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-pine p-3 text-sand">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-black/50">Authentication</p>
            <h1 className="text-3xl font-semibold text-ink">Sign in to the control plane</h1>
          </div>
        </div>

        <div className="mt-3 text-sm text-black/60">
          Use the live backend auth endpoints to sign in or create the first operator account.
        </div>

        <div className="mt-6 rounded-2xl border border-black/5 bg-sand/35 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-black/65">
            <Mail className="size-4" />
            Email/password authentication
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm font-medium text-black/65">
            <LockKeyhole className="size-4" />
            JWT access + refresh tokens
          </div>
        </div>

        <AuthForm />
      </Card>
    </main>
  );
}

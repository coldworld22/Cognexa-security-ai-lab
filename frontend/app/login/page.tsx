import { LockKeyhole, Mail, ShieldCheck, Sparkles, Wrench } from "lucide-react";

import { AuthForm } from "@/components/auth/auth-form";
import { AppIdentity } from "@/components/ui/app-identity";
import { BrandPanel } from "@/components/ui/brand-panel";
import { Card } from "@/components/ui/card";
import { APP_NAME } from "@/lib/branding";

const highlights = [
  {
    icon: ShieldCheck,
    title: "Secure by default",
    description: "Operate conversations, tools, memory, and admin controls behind one authenticated interface."
  },
  {
    icon: Wrench,
    title: "Tool-aware workspace",
    description: "Trace model, tool, and agent activity without leaving the app shell."
  },
  {
    icon: Sparkles,
    title: "Built for local-first teams",
    description: "Keep models, retrieval, and execution infrastructure under your control."
  }
];

export default function LoginPage() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-6rem] top-14 h-72 w-72 rounded-full bg-[#4fc2fb]/20 blur-3xl" />
        <div className="absolute right-[-4rem] top-24 h-80 w-80 rounded-full bg-[#0d4673]/12 blur-3xl" />
        <div className="absolute bottom-[-7rem] left-[20%] h-72 w-72 rounded-full bg-[#e8d9bd]/24 blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-6 xl:grid-cols-[minmax(0,1.12fr)_440px]">
        <section className="rounded-[38px] border border-[#0f3454]/20 bg-[linear-gradient(155deg,#08121e_0%,#0c1f31_46%,#0c5777_100%)] p-8 text-white shadow-[0_38px_100px_rgba(5,12,20,0.34)] md:p-9">
          <AppIdentity tone="dark" size="lg" />
          <h1 className="mt-8 max-w-2xl text-4xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
            Deploy secure AI operations from one local-first workspace.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/72">
            {APP_NAME} brings conversation history, retrieval, tools, memory context, and agent
            execution into a single operating surface for engineering teams.
          </p>

          <div className="mt-8">
            <BrandPanel
              priority
              tone="brand"
              sizes="(max-width: 768px) 320px, 760px"
              className="max-w-[620px] border-white/10 p-4"
              imageClassName="mx-auto max-h-[250px] w-auto rounded-[24px] object-contain opacity-95"
            />
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {highlights.map((item) => (
              <div
                key={item.title}
                className="rounded-[26px] border border-white/10 bg-white/[0.06] p-4 backdrop-blur"
              >
                <item.icon className="size-5 text-[#93e4ff]" />
                <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-white">
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-white/64">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <Card className="w-full border-white/70 bg-[rgba(255,255,255,0.88)] p-8 shadow-[0_36px_90px_rgba(15,23,42,0.16)]">
          <AppIdentity size="sm" showTagline={false} />
          <p className="mt-8 text-xs uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
            Operator Sign In
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            Access {APP_NAME}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            Secure operator access for conversations, tools, memory context, and agent
            workflows.
          </p>

          <div className="mt-6 rounded-[24px] border border-black/5 bg-[linear-gradient(135deg,rgba(255,255,255,0.94)_0%,rgba(237,244,250,0.88)_100%)] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-black/65">
              <Mail className="size-4" />
              Username/password authentication
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm font-medium text-black/65">
              <LockKeyhole className="size-4" />
              JWT access + refresh tokens
            </div>
          </div>

          <p className="mt-6 text-sm text-[var(--text-secondary)]">
            Registration is disabled. Sign in with the fixed operator account for this deployment.
          </p>

          <AuthForm />
        </Card>
      </div>
    </main>
  );
}

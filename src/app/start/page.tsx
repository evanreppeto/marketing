import Image from "next/image";
import { redirect } from "next/navigation";

import type { Metadata } from "next";

import { StartSetupForm } from "./start-setup-form";
import { getActivationState } from "@/lib/activation/read-model";
import { getAuthMode } from "@/lib/auth/auth-mode";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up Arc" };

export default async function StartPage() {
  await requireOperator();

  if (getAuthMode() !== "supabase") {
    redirect("/");
  }

  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx) {
    redirect("/login?from=%2Fstart");
  }

  const { checklist } = await getActivationState(ctx.orgId, ctx.workspaceId);
  if (checklist.coreDone) {
    redirect("/");
  }

  return (
    <main className="chicago-dark relative flex min-h-[100dvh] overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
      <Image
        alt=""
        aria-hidden="true"
        className="object-cover opacity-70"
        fill
        priority
        sizes="100vw"
        src="/brand/login-background-v2.png"
      />
      <div className="absolute inset-0 bg-[oklch(0.07_0.022_250/0.72)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(0deg,var(--canvas)_0%,transparent_100%)]" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center px-5 py-10">
        <StartSetupForm orgName={ctx.orgName} />
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";

import type { Metadata } from "next";

import { StartSetupForm } from "./start-setup-form";
import { getActivationState } from "@/lib/activation/read-model";
import { getAuthMode } from "@/lib/auth/auth-mode";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { AuthShell } from "@/components/ui/auth-shell";

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
    <AuthShell
      formMaxWidth="max-w-[480px]"
      headline={<>Let Arc learn your brand.</>}
      supporting="Give Arc your website and it reads your business — name, voice, and logo — then drafts on-brand work. You approve everything before it ships."
      meta={["Source-backed", "Approval-gated"]}
    >
      <StartSetupForm orgName={ctx.orgName} />
    </AuthShell>
  );
}

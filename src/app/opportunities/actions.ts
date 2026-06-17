"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildOpportunityBriefing } from "@/domain";
import { notifyArcOpportunityDraft } from "@/lib/arc-chat/notify";
import { requireOperator } from "@/lib/auth/operator";
import { runColdLeadDetection } from "@/lib/opportunities/detector";
import { enqueueArcOpportunityTask } from "@/lib/opportunities/enqueue";
import { dismissOpportunity, markOpportunityDrafting, snoozeOpportunity } from "@/lib/opportunities/persistence";
import { getOpportunityForDraft } from "@/lib/opportunities/read-model";

export async function scanOpportunitiesAction(): Promise<void> {
  await requireOperator();
  await runColdLeadDetection();
  revalidatePath("/opportunities");
  redirect("/opportunities?action=scanned");
}

export async function dismissOpportunityAction(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get("id") ?? "").trim();
  if (id) await dismissOpportunity(id);
  revalidatePath("/opportunities");
}

export async function snoozeOpportunityAction(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get("id") ?? "").trim();
  if (id) {
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // snooze 1 week
    await snoozeOpportunity(id, until);
  }
  revalidatePath("/opportunities");
}

export async function draftOpportunityWithArcAction(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const opp = await getOpportunityForDraft(id);
  if (!opp) {
    redirect("/opportunities?action=draft-error");
    return; // unreachable (redirect throws), but narrows `opp` for tsc
  }
  const briefing = buildOpportunityBriefing({
    title: opp.title,
    summary: opp.summary,
    urgency: opp.urgency,
    confidence: opp.confidence,
    recommendedAction: opp.recommendedAction,
    persona: opp.persona,
    leadHref: `/crm/leads/${opp.subjectId}`,
  });
  const taskId = await enqueueArcOpportunityTask({ opportunityId: id, objective: opp.title, operator: "Operator" });
  await markOpportunityDrafting(id, taskId);
  await notifyArcOpportunityDraft({
    opportunityId: id,
    agentTaskId: taskId,
    message: briefing,
    leadId: opp.subjectId,
    operator: "Operator",
  });
  revalidatePath("/opportunities");
  redirect("/opportunities?action=drafting");
}

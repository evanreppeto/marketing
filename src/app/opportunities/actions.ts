"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOperator } from "@/lib/auth/operator";
import { runColdLeadDetection } from "@/lib/opportunities/detector";
import { dismissOpportunity, snoozeOpportunity } from "@/lib/opportunities/persistence";

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

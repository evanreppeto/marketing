"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOperator } from "@/lib/auth/operator";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { type Database, type TablesInsert, type TablesUpdate } from "@/lib/supabase/database.types";

type RoutingDecision = Database["public"]["Enums"]["routing_decision_kind"];

const ROUTING_DECISIONS: readonly RoutingDecision[] = ["mitigation", "review", "out_of_scope", "archived"];

// How each operator decision updates the lead it acts on.
const LEAD_UPDATE_BY_DECISION: Record<RoutingDecision, TablesUpdate<"leads">> = {
  mitigation: { routing_recommendation: "target", status: "validated" },
  review: { status: "needs_review" },
  out_of_scope: { routing_recommendation: "isolated", status: "archived" },
  archived: { routing_recommendation: "archived", status: "archived" },
};

export async function decideRoutingAction(formData: FormData) {
  await requireOperator();

  const leadId = formString(formData, "leadId");
  const decision = formString(formData, "decision");
  const score = Number(formData.get("score") ?? 0);

  if (!leadId || !isRoutingDecision(decision)) {
    redirect("/loss-routing?action=routing-error");
  }

  if (!isSupabaseAdminConfigured()) {
    redirect(`/loss-routing?selected=${leadId}&action=not-configured`);
  }

  const supabase = getSupabaseAdminClient();
  const confidence = Number.isFinite(score) && score > 0 ? Math.min(1, Math.round((score / 100) * 100) / 100) : 0.5;

  const insert: TablesInsert<"routing_decisions"> = {
    lead_id: leadId,
    decision,
    confidence,
    decided_by: "Local Operator",
    rationale: { source: "loss-routing", lead_score: score },
  };

  const { error: decisionError } = await supabase.from("routing_decisions").insert(insert);
  if (decisionError) {
    redirect(`/loss-routing?selected=${leadId}&action=routing-error&message=${encodeURIComponent(decisionError.message)}`);
  }

  const { error: leadError } = await supabase.from("leads").update(LEAD_UPDATE_BY_DECISION[decision]).eq("id", leadId);
  if (leadError) {
    redirect(`/loss-routing?selected=${leadId}&action=routing-error&message=${encodeURIComponent(leadError.message)}`);
  }

  revalidatePath("/loss-routing");
  revalidatePath("/crm");
  revalidatePath("/");
  redirect(`/loss-routing?selected=${leadId}&action=${decision}-done`);
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRoutingDecision(value: string | undefined): value is RoutingDecision {
  return ROUTING_DECISIONS.includes(value as RoutingDecision);
}

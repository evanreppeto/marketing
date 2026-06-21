"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOperator } from "@/lib/auth/operator";
import { insertPersona } from "@/lib/personas/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { type PersonaSegmentKey, type PersonaStage } from "./_data/demo-personas";

export type CreatePersonaState = { ok: boolean; message: string } | null;

const SEGMENTS: PersonaSegmentKey[] = ["acquisition", "engagement", "retention"];
const STAGES: PersonaStage[] = ["New", "Hot lead", "Active", "Champion", "At risk", "Dormant"];

/**
 * Operator creates a new audience persona. Gated by the operator check +
 * Supabase config, validated, then persisted. No outbound — defining an
 * audience never sends anything. Shaped for `useActionState`.
 */
export async function createPersonaAction(_prev: CreatePersonaState, formData: FormData): Promise<CreatePersonaState> {
  await requireOperator();

  const name = String(formData.get("name") ?? "").trim();
  const segment = String(formData.get("segment") ?? "");
  const stage = String(formData.get("stage") ?? "New");
  const score = Number(formData.get("score") ?? 50);
  const angle = String(formData.get("angle") ?? "").trim();
  const audience = String(formData.get("audience") ?? "").trim();
  const cta = String(formData.get("cta") ?? "").trim();
  const channel = String(formData.get("channel") ?? "").trim();

  if (!name) return { ok: false, message: "Give the persona a name." };
  if (!SEGMENTS.includes(segment as PersonaSegmentKey)) return { ok: false, message: "Pick a segment." };
  if (!STAGES.includes(stage as PersonaStage)) return { ok: false, message: "Pick a lifecycle stage." };
  if (!Number.isFinite(score) || score < 0 || score > 100) return { ok: false, message: "Lead score must be between 0 and 100." };

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Connect a database to save personas — your input is valid, it just can't persist in this environment." };
  }

  let slug: string;
  try {
    ({ slug } = await insertPersona({
      name,
      segment: segment as PersonaSegmentKey,
      stage: stage as PersonaStage,
      score,
      angle,
      audience,
      cta,
      channel,
    }));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save the persona." };
  }

  revalidatePath("/personas");
  redirect(`/personas/${slug}`);
}

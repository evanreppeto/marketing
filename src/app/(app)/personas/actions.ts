"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { type PersonaSegmentKey, type PersonaStage } from "@/lib/personas/demo-personas";
import { insertPersona } from "@/lib/personas/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Real operator write for the Personas "New persona" button. A persona is an
 * internal org-config record (never outbound), so it persists directly through
 * requireOperator() + the org-scoped insertPersona. `persisted: false` is the
 * honest offline signal so the roster can show it optimistically.
 */
export type CreatePersonaResult =
  | { ok: true; persisted: boolean; slug?: string }
  | { ok: false; error: string };

export type NewPersonaInput = { name: string; segment: string; angle?: string; audience?: string };

const SEGMENTS = new Set(["acquisition", "engagement", "retention"]);

export async function createPersona(input: NewPersonaInput): Promise<CreatePersonaResult> {
  await requireOperator();

  const name = input.name?.trim();
  if (!name) return { ok: false, error: "A persona name is required." };
  if (!SEGMENTS.has(input.segment)) return { ok: false, error: "Choose a segment." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  try {
    const { slug } = await insertPersona({
      name,
      segment: input.segment as PersonaSegmentKey,
      stage: "New" as PersonaStage,
      score: 60,
      angle: input.angle?.trim() || "",
      audience: input.audience?.trim() || "",
      cta: "",
      channel: "Email",
    });
    revalidatePath("/personas");
    return { ok: true, persisted: true, slug };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create the persona." };
  }
}

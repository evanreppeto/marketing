"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { type PersonaSegmentKey, type PersonaStage } from "@/lib/personas/demo-personas";
import { insertPersona, setPersonaActive, updatePersona } from "@/lib/personas/persistence";
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

export type PersonaMutationResult =
  | { ok: true; persisted: boolean }
  | { ok: false; error: string };

export type EditPersonaInput = {
  slug: string;
  name: string;
  segment: string;
  stage?: string;
  angle?: string;
  audience?: string;
  cta?: string;
  channel?: string;
};

/** Edit an existing persona in place (slug is immutable). */
export async function editPersona(input: EditPersonaInput): Promise<PersonaMutationResult> {
  await requireOperator();

  const name = input.name?.trim();
  if (!input.slug) return { ok: false, error: "Missing persona." };
  if (!name) return { ok: false, error: "A persona name is required." };
  if (!SEGMENTS.has(input.segment)) return { ok: false, error: "Choose a segment." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  try {
    await updatePersona(input.slug, {
      name,
      segment: input.segment as PersonaSegmentKey,
      stage: (input.stage as PersonaStage) || undefined,
      angle: input.angle?.trim() ?? "",
      audience: input.audience?.trim() ?? "",
      cta: input.cta?.trim() ?? "",
      channel: input.channel?.trim() || undefined,
    });
    revalidatePath("/personas");
    return { ok: true, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the persona." };
  }
}

/** Archive (soft-delete) a persona — hides it from the roster + pickers. */
export async function archivePersona(slug: string): Promise<PersonaMutationResult> {
  await requireOperator();
  if (!slug) return { ok: false, error: "Missing persona." };
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  try {
    await setPersonaActive(slug, false);
    revalidatePath("/personas");
    return { ok: true, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not archive the persona." };
  }
}

/** Restore a previously archived persona. */
export async function restorePersona(slug: string): Promise<PersonaMutationResult> {
  await requireOperator();
  if (!slug) return { ok: false, error: "Missing persona." };
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  try {
    await setPersonaActive(slug, true);
    revalidatePath("/personas");
    return { ok: true, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not restore the persona." };
  }
}

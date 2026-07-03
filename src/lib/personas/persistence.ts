import { type SupabaseClient } from "@supabase/supabase-js";

import { type PersonaSegmentKey, type PersonaStage } from "./demo-personas";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

import { clampScore, initialsFrom, slugify } from "./console";

export type NewPersonaInput = {
  name: string;
  segment: PersonaSegmentKey;
  stage: PersonaStage;
  score: number;
  angle: string;
  audience: string;
  cta: string;
  channel: string;
};

/**
 * Persist a new org persona. Caller is responsible for the operator gate and
 * the `isSupabaseAdminConfigured()` check. Returns the slug to navigate to.
 */
export async function insertPersona(input: NewPersonaInput): Promise<{ slug: string }> {
  const orgId = await getCurrentOrgId();
  // The `personas` table isn't in the generated types yet (types are regenerated
  // after the migration is applied to the project), so use an untyped client.
  const supabase = getSupabaseAdminClient() as unknown as SupabaseClient;
  const slug = slugify(input.name) || `persona-${Date.now()}`;
  const score = clampScore(input.score);

  const { error } = await supabase.from("personas").insert({
    org_id: orgId,
    slug,
    name: input.name,
    initials: initialsFrom(input.name),
    segment: input.segment,
    stage: input.stage,
    score,
    signals: { engagement: score, fit: score, intent: score },
    score_trend: [score, score],
    angle: input.angle,
    audience: input.audience,
    cta: input.cta,
    channel: input.channel,
  });

  if (error) throw new Error(error.message);
  return { slug };
}

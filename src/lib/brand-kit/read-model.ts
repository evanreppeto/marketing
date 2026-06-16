import {
  assembleArcContext,
  NEUTRAL_DEFAULTS,
  NEUTRAL_PERSONAS,
  type ArcBusinessContext,
} from "@/domain";
import { getBusinessProfile, listPersonaDefinitions } from "./persistence";

/**
 * Assemble the Arc business-context bundle for an org. Falls back to neutral
 * defaults when no profile exists or Supabase is unconfigured, so Arc and the
 * UI always receive a usable, industry-agnostic context (graceful degradation).
 */
export async function getBusinessContext(orgId: string): Promise<ArcBusinessContext> {
  const profile = (await getBusinessProfile(orgId)) ?? NEUTRAL_DEFAULTS;
  const personas = await listPersonaDefinitions(orgId);
  return assembleArcContext(profile, personas.length > 0 ? personas : NEUTRAL_PERSONAS);
}

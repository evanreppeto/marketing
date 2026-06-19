import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";

/**
 * The Persona Revenue Intelligence overview (segments, scores, signals) for Arc.
 *   GET /api/v1/arc/persona-intelligence  ->  { ok, personaIntelligence }
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const data = await getPersonaIntelligenceData();
    if ("status" in data && data.status === "unavailable") {
      return fail("failed", data.message ?? "Persona intelligence is unavailable.", 502);
    }
    return ok({ personaIntelligence: data });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read persona intelligence.", 502);
  }
}

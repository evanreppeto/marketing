import {
  assembleArcContext,
  NEUTRAL_DEFAULTS,
  NEUTRAL_PERSONAS,
  type ArcBusinessContext,
} from "@/domain";
import { listNodes, type BrainNode } from "@/lib/knowledge-graph/read-model";
import { getBusinessProfile, listPersonaDefinitions } from "./persistence";

const BRAND_CONTEXT_KINDS = new Set(["brand_fact", "proof_point", "messaging_angle", "cta", "service"]);

function nodeFact(node: BrainNode) {
  const detail = node.summary || node.body;
  return detail ? `${node.label}: ${detail}` : node.label;
}

async function listTrustedBrainFacts(orgId: string) {
  const brain = await listNodes({ trustTier: "trusted" }, undefined, orgId);
  if (brain.status !== "live") return [];
  return brain.nodes
    .filter((node) => BRAND_CONTEXT_KINDS.has(node.kind))
    .map(nodeFact)
    .slice(0, 24);
}

/**
 * Assemble the Arc business-context bundle for an org. Falls back to neutral
 * defaults when no active profile exists or Supabase is unconfigured, so Arc
 * always receives a usable, industry-agnostic context until the operator
 * explicitly activates the Brand Kit.
 */
export async function getBusinessContext(orgId: string): Promise<ArcBusinessContext> {
  const [profile, personas, brainFacts] = await Promise.all([
    getBusinessProfile(orgId),
    listPersonaDefinitions(orgId),
    listTrustedBrainFacts(orgId),
  ]);
  const activeProfile = profile?.status === "active" ? profile : NEUTRAL_DEFAULTS;
  const activeBrainFacts = profile?.status === "active" ? brainFacts : [];
  return assembleArcContext(activeProfile, personas.length > 0 ? personas : NEUTRAL_PERSONAS, activeBrainFacts);
}

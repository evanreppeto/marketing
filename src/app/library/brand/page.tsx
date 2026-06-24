import { NEUTRAL_DEFAULTS, type BusinessProfile } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getBusinessProfile } from "@/lib/brand-kit/persistence";
import { loadSourceControlData } from "@/lib/brand-knowledge/source-control";
import { listNodes, type BrainNode } from "@/lib/knowledge-graph/read-model";
import { getAgentName } from "@/lib/settings/agent-name";
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { BrandIdentity } from "./_components/brand-identity";
import { BrandDesignImport } from "./_components/brand-design-import";
import { BrandDetails, type ApprovedFact } from "./_components/brand-details";
import { BrandReviewQueue } from "./_components/brand-review-queue";
import { BrandPersonasSummary } from "./_components/brand-personas-summary";
import { TeachArc } from "./_components/teach-arc";
import { LibraryTabs } from "../_components/library-tabs";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Brand" };

export const dynamic = "force-dynamic";

const BRAND_KINDS = new Set(["brand_fact", "proof_point", "messaging_angle", "cta", "service", "persona"]);

async function loadBrandProfile(): Promise<BusinessProfile> {
  if (!isSupabaseAdminConfigured()) return NEUTRAL_DEFAULTS;

  try {
    const orgId = await getCurrentOrgId();
    return (await getBusinessProfile(orgId)) ?? NEUTRAL_DEFAULTS;
  } catch {
    return NEUTRAL_DEFAULTS;
  }
}

function approvedBrandFacts(nodes: BrainNode[]): ApprovedFact[] {
  return nodes
    .filter((node) => BRAND_KINDS.has(node.kind) && node.trustTier === "trusted")
    .slice(0, 6)
    .map((node) => ({ id: node.id, label: node.label, kind: node.kind }));
}

export default async function BrandPage() {
  const [profile, brain, agentName, personaData, sourceControl] = await Promise.all([
    loadBrandProfile(),
    listNodes({}, undefined, undefined, { demoFallback: false }),
    getAgentName(),
    getPersonaIntelligenceData(),
    loadSourceControlData(),
  ]);

  const brainNodes = brain.status === "live" ? brain.nodes : [];
  const approvedFacts = approvedBrandFacts(brainNodes);
  const personaCount = personaData.status === "live" ? personaData.personas.length : 0;

  return (
    <div className="flex flex-col gap-6">
      <LibraryTabs active="brand" />
      <BrandIdentity agentName={agentName} profile={profile} />
      <BrandDesignImport />
      <TeachArc agentName={agentName} />
      <BrandReviewQueue agentName={agentName} items={sourceControl.reviewItems} />
      <BrandDetails approvedFacts={approvedFacts} profile={profile} />
      <BrandPersonasSummary agentName={agentName} count={personaCount} />
    </div>
  );
}

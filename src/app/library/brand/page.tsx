import { Sparkles } from "lucide-react";

import { NEUTRAL_DEFAULTS, type BusinessProfile } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getBusinessProfile } from "@/lib/brand-kit/persistence";
import { summarizeBrandSourceReadiness } from "@/lib/brand-knowledge/readiness";
import { loadSourceControlData } from "@/lib/brand-knowledge/source-control";
import { listNodes, type BrainNode } from "@/lib/knowledge-graph/read-model";
import { getMediaLibraryData } from "@/lib/media-library/read-model";
import { type MediaAssetView } from "@/lib/media-library/types";
import { getAgentName } from "@/lib/settings/agent-name";
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import {
  classifyBrandSource,
  type BrandSourceClassification,
} from "@/lib/brand-knowledge/source-classifier";

import { BrandPersonas } from "./_components/brand-personas";
import { BrandIdentity } from "./_components/brand-identity";
import { BrandDetails, type ApprovedFact } from "./_components/brand-details";
import { BrandReviewQueue } from "./_components/brand-review-queue";
import { BrandSourceList } from "./_components/brand-source-list";
import { BrandSourceUpload } from "./_components/brand-source-upload";
import { LibraryTabs } from "../_components/library-tabs";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Brand" };

export const dynamic = "force-dynamic";

const BRAND_KINDS = new Set(["brand_fact", "proof_point", "messaging_angle", "cta", "service", "persona"]);
type BrandFileSource = { asset: MediaAssetView; classification: BrandSourceClassification };

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

function brandFiles(assets: MediaAssetView[]): BrandFileSource[] {
  return assets
    .map((asset) => ({ asset, classification: classifyBrandSource(asset) }))
    .filter(({ asset, classification }) => {
      return asset.kind === "document" || asset.source === "google_drive" || asset.source === "url" || classification.confidence === "high";
    });
}

export default async function BrandPage() {
  const [profile, brain, library, agentName, personaData, sourceControl] = await Promise.all([
    loadBrandProfile(),
    listNodes({}, undefined, undefined, { demoFallback: false }),
    getMediaLibraryData(),
    getAgentName(),
    getPersonaIntelligenceData(),
    loadSourceControlData(),
  ]);

  const brainNodes = brain.status === "live" ? brain.nodes : [];
  const approvedFacts = approvedBrandFacts(brainNodes);
  const allFiles = library.status === "live" ? brandFiles(library.assets) : [];
  const sourceReadiness = summarizeBrandSourceReadiness(allFiles, brainNodes);

  return (
    <div className="flex flex-col gap-6">
      <LibraryTabs active="brand" />
      <BrandIdentity agentName={agentName} profile={profile} />

      {/* Zone 1 — Add to brand (the one accent moment; Arc-led intake). */}
      <section aria-labelledby="brand-intake-heading">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles aria-hidden className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]" id="brand-intake-heading">
            Add to brand
          </h2>
        </div>
        <div className="overflow-hidden rounded-lg border border-[var(--accent-border)] bg-[var(--surface-panel)]">
          <BrandSourceUpload placement="hero" />
        </div>
      </section>

      {/* Zone 2 — Needs your review (the human approval gate). */}
      <BrandReviewQueue agentName={agentName} items={sourceControl.reviewItems} />

      {/* Zone 3 — Brand at a glance (read-only summary; edit on demand). */}
      <BrandDetails approvedFacts={approvedFacts} profile={profile} />

      {/* Zone 4 — Sources & media (one consolidated list). */}
      <BrandSourceList data={sourceControl} readyToLearn={sourceReadiness.readyToLearn} />

      <BrandPersonas data={personaData} />
    </div>
  );
}

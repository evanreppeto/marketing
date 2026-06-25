import { PageHeader, StatStrip, type StatItem } from "@/app/_components/page-header";
import { BrainCoverageBanner } from "@/app/brain/_components/coverage-banner";
import { BrainShell } from "@/app/brain/_components/brain-shell";
import { ResyncCrmButton } from "@/app/brain/_components/resync-crm-button";
import { buildBrainSourceReviewData } from "@/lib/brand-knowledge/source-review";
import { getBrainGraph } from "@/lib/knowledge-graph/graph";
import { brainSummary, getBrainCrmCoverage, listNodes, listProposed } from "@/lib/knowledge-graph/read-model";
import { getMediaLibraryData } from "@/lib/media-library/read-model";
import { getAgentName } from "@/lib/settings/agent-name";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Brain" };

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  const [graph, proposed, all, summary, agentName, library, coverage] = await Promise.all([
    getBrainGraph(),
    listProposed(),
    listNodes({}),
    brainSummary(),
    getAgentName(),
    getMediaLibraryData(),
    getBrainCrmCoverage(),
  ]);

  const graphNodes = graph.status === "live" ? graph.nodes : [];
  const graphEdges = graph.status === "live" ? graph.edges : [];
  const proposedNodes = proposed.status === "live" ? proposed.nodes : [];
  const allNodes = all.status === "live" ? all.nodes : [];
  const sourceReview = buildBrainSourceReviewData({
    assets: library.status === "live" ? library.assets : [],
    proposedNodes,
  });

  const total = summary.status === "live" ? summary.total : 0;
  const trusted = summary.status === "live" ? (summary.byTier.trusted ?? 0) : 0;
  const observed = summary.status === "live" ? (summary.byTier.observed ?? 0) : 0;
  const awaiting = summary.status === "live" ? (summary.byTier.proposed ?? 0) : 0;

  const summaryLine =
    summary.status === "live"
      ? `${total} knowledge nodes · ${trusted} trusted · ${awaiting} awaiting review`
      : "Brain unavailable — Supabase is not configured.";

  // KPI row — mirrors the concept's top strip (nodes / trusted / observed /
  // awaiting review). Tones stay restrained: green for trusted, amber for the
  // review queue, neutral elsewhere.
  const stats: StatItem[] = [
    { label: "Knowledge nodes", value: total, hint: `${graphEdges.length} connections mapped`, tone: "accent" },
    { label: "Trusted", value: trusted, hint: "Approved for outbound", tone: "ok" },
    { label: "Observed", value: observed, hint: "Watching, not yet trusted", tone: "neutral" },
    {
      label: "Awaiting review",
      value: awaiting,
      hint: awaiting > 0 ? "Human approval required" : "Queue clear",
      tone: awaiting > 0 ? "amber" : "neutral",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marketing Brain"
        description={`${agentName}'s durable marketing memory — brand facts, personas, proof, and what it has learned. ${summaryLine}`}
        aside={<ResyncCrmButton />}
      />
      {summary.status === "live" ? <StatStrip items={stats} columns={4} /> : null}
      {coverage.status === "live" ? (
        <BrainCoverageBanner
          behind={coverage.behind}
          crmRecords={coverage.crmRecords}
          brainRecords={coverage.brainRecords}
        />
      ) : null}
      <BrainShell
        graphNodes={graphNodes}
        graphEdges={graphEdges}
        allNodes={allNodes}
        agentName={agentName}
        sourceReview={sourceReview}
      />
    </div>
  );
}

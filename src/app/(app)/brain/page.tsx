import { listGraphEdges, listNodes, type BrainNode } from "@/lib/knowledge-graph/read-model";

import { BrainView, type BrainData, type FactVM } from "./_components/brain-view";
import type { GraphEdge, GraphNode } from "./_components/knowledge-graph";

export const metadata = { title: "Brain — Arc" };

// "Refresh memory" (rebuildBrainMemoryAction) resyncs CRM/campaigns/media and
// backfills embeddings — network-heavy work. Give the server action headroom
// over the default so a real refresh completes instead of hitting the timeout.
export const maxDuration = 60;

const KIND_COLOR: Record<string, string> = {
  arc: "#c8a24a",
  brand_fact: "#c47055",
  service: "#5a90b8",
  persona: "#9a8fc4",
  proof_point: "#6faa84",
  campaign_ref: "#6a86bd",
  messaging_angle: "#ca9a50",
  cta: "#cd7d54",
  learning: "#5aa597",
  signal: "#bd6a58",
  segment: "#8d92a0",
  asset_ref: "#5a90b8",
  crm_company: "#7f8694",
  crm_contact: "#7f8694",
};

const KIND_LABEL: Record<string, string> = {
  arc: "Arc",
  brand_fact: "Brand fact",
  service: "Service",
  persona: "Persona",
  proof_point: "Proof point",
  messaging_angle: "Messaging angle",
  cta: "CTA",
  campaign_ref: "Campaign",
  learning: "Learning",
  signal: "Signal",
  segment: "Segment",
  asset_ref: "Asset",
  crm_company: "CRM company",
  crm_contact: "CRM contact",
};

function titleize(value: string): string {
  const s = (value || "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function normalizeConfidence(value: number | null): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.round(value <= 1 ? value * 100 : value);
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const min = Math.round((Date.now() - then) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toFact(n: BrainNode): FactVM {
  return {
    id: n.id,
    kind: n.kind,
    kindLabel: KIND_LABEL[n.kind] ?? titleize(n.kind),
    kindColor: KIND_COLOR[n.kind] ?? "#8d92a0",
    label: n.label,
    summary: n.summary ?? n.body ?? "",
    trustTier: n.trustTier,
    confidence: normalizeConfidence(n.confidence),
    source: n.source ?? n.refTable ?? "",
    learnedAt: relativeTime(n.createdAt),
  };
}

function learnedByLabel(by: string | null): string {
  if (by === "arc") return "Arc";
  if (by === "operator") return "You";
  return "System";
}

function toGraphNode(n: BrainNode): GraphNode {
  return {
    id: n.id,
    kind: n.kind,
    kindLabel: KIND_LABEL[n.kind] ?? titleize(n.kind),
    kindColor: KIND_COLOR[n.kind] ?? "#8d92a0",
    label: n.label,
    summary: n.summary ?? n.body ?? "",
    tier: n.trustTier,
    confidence: normalizeConfidence(n.confidence),
    source: n.source ?? n.refTable ?? "",
    learnedBy: learnedByLabel(n.createdBy),
  };
}

export default async function BrainPage({ searchParams }: { searchParams: Promise<{ node?: string }> }) {
  const sp = await searchParams;
  const focusNodeId = typeof sp.node === "string" && sp.node.trim() ? sp.node.trim() : null;
  const [result, edgeResult] = await Promise.all([
    listNodes({}).catch(() => ({ status: "unavailable" }) as const),
    listGraphEdges().catch(() => ({ status: "unavailable" }) as const),
  ]);
  const nodes: BrainNode[] = result.status === "live" ? result.nodes : [];
  const facts = nodes.map(toFact);

  const graphNodes: GraphNode[] = nodes.map(toGraphNode);
  const nodeIds = new Set(graphNodes.map((n) => n.id));
  const graphEdges: GraphEdge[] =
    edgeResult.status === "live"
      ? edgeResult.edges
          .filter((e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId))
          .map((e) => ({ from: e.fromNodeId, to: e.toNodeId, rel: e.relation }))
      : [];

  const tier = (t: string) => facts.filter((f) => f.trustTier.toLowerCase() === t).length;
  const trusted = tier("trusted") + tier("core");
  const observed = tier("observed");
  const proposed = tier("proposed");

  const review = facts.filter((f) => f.trustTier.toLowerCase() === "proposed");
  const learned = [...nodes]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 20)
    .map(toFact);

  const stats = [
    { label: "Knowledge nodes", value: facts.length, sub: "in Arc's memory", color: "" },
    { label: "Trusted", value: trusted, sub: "approved for outbound", color: "var(--ok-text)" },
    { label: "Observed", value: observed, sub: "watching, not yet trusted", color: "" },
    { label: "Awaiting review", value: proposed, sub: "human approval required", color: proposed > 0 ? "var(--warn-text)" : "" },
  ];

  const coverageNote =
    proposed > 0
      ? `${proposed} proposed fact${proposed === 1 ? "" : "s"} stay out of all outbound copy until you approve them — Arc's trust gate.`
      : "";

  const data: BrainData = { stats, coverageNote, facts, review, learned, graphNodes, graphEdges };
  return <BrainView data={data} focusNodeId={focusNodeId} />;
}

import { type BrainNode } from "@/lib/knowledge-graph/read-model";

import { type FactVM } from "../_components/brain-view";

// Shared node→view mapping so the server page and the search action produce
// identical fact rows (kind colour/label, confidence normalization, relative
// time). Kept out of the "use client" view and the "use server" actions file so
// both can import it without dragging the other's runtime in.

export const KIND_COLOR: Record<string, string> = {
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

export const KIND_LABEL: Record<string, string> = {
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

export function titleize(value: string): string {
  const s = (value || "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export function normalizeConfidence(value: number | null): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.round(value <= 1 ? value * 100 : value);
}

export function relativeTime(iso: string | null): string {
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

export function toFact(n: BrainNode): FactVM {
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

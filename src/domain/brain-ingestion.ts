/**
 * CRM → Brain ingestion (pure). Turns a raw CRM DB row into a
 * `KnowledgeNodeInput` so creating/editing a CRM record can create/update a
 * matching reference node in the knowledge graph. No I/O — persistence and
 * wiring live in later layers.
 */

import { type EdgeRelation, type KnowledgeNodeInput } from "./knowledge-graph";

/** The six CRM objects that ingest into the Brain. */
export type CrmIngestTable =
  | "companies" | "contacts" | "leads" | "properties" | "jobs" | "outcomes";

/** Prefixed, non-gated node kinds — keeps CRM reference nodes grouped. */
export const CRM_NODE_KINDS: Record<CrmIngestTable, string> = {
  companies: "crm_company",
  contacts: "crm_contact",
  leads: "crm_lead",
  properties: "crm_property",
  jobs: "crm_job",
  outcomes: "crm_outcome",
};

/** Idempotency handle: unique per (org, kind, key). */
export function crmNodeKey(table: CrmIngestTable, id: string): string {
  return `crm:${table}:${id}`;
}

/** Small deterministic FNV-1a hash (hex) of the embed text — pure, runtime-free. */
export function embedHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Join non-empty `Label: value` fragments into one summary line group. */
function lines(parts: Array<[string, unknown]>): string {
  return parts
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim().length > 0)
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join("\n");
}

function persona(row: { persona?: unknown }): string | null {
  const p = typeof row.persona === "string" ? row.persona : null;
  return p && p !== "unassigned_persona" ? p : null;
}

function dollars(cents: unknown): string | null {
  return typeof cents === "number" ? `$${(cents / 100).toLocaleString("en-US")}` : null;
}

/** Build a Brain node input from a raw CRM row. `row` is the DB Row of `table`. */
export function buildNodeInputForCrmRow(
  table: CrmIngestTable,
  row: Record<string, unknown>,
): KnowledgeNodeInput {
  const base = {
    kind: CRM_NODE_KINDS[table],
    key: crmNodeKey(table, row.id as string),
    refTable: table,
    refId: row.id as string,
    persona: persona(row),
    source: "crm-sync",
    tags: ["crm", table],
  };

  if (table === "companies") {
    return {
      ...base,
      label: (row.name as string) || "Company",
      summary: lines([
        ["Company", row.name], ["Partner tier", row.partner_tier], ["Persona", persona(row)],
        ["Status", row.status], ["Website", row.website_url], ["Phone", row.phone], ["Email", row.email],
      ]),
    };
  }
  if (table === "contacts") {
    const label = (row.full_name as string) || (row.email as string) || "Contact";
    return {
      ...base,
      label,
      summary: lines([
        ["Contact", row.full_name], ["Title", row.title], ["Persona", persona(row)],
        ["Status", row.status], ["Email", row.email], ["Phone", row.phone],
      ]),
    };
  }
  if (table === "properties") {
    const label = [row.street_line_1, row.city, row.state].filter(Boolean).join(", ") || "Property";
    return {
      ...base,
      label,
      summary: lines([
        ["Property", label], ["Type", row.property_type], ["Postal code", row.postal_code], ["Persona", persona(row)],
      ]),
    };
  }
  if (table === "leads") {
    return {
      ...base,
      label: `Lead: ${row.source ?? "unknown source"}`,
      summary: lines([
        ["Lead source", row.source], ["Persona", persona(row)], ["Status", row.status],
        ["Score", row.lead_score], ["Routing", row.routing_recommendation],
        ["Loss summary", row.loss_summary],
        ["Loss signals", Array.isArray(row.loss_signals) ? (row.loss_signals as string[]).join(", ") : null],
      ]),
    };
  }
  if (table === "jobs") {
    const label = row.job_number ? `Job ${row.job_number}` : `Job ${String(row.id).slice(0, 8)}`;
    return {
      ...base,
      label,
      summary: lines([
        ["Job", row.job_number], ["Persona", persona(row)], ["Status", row.status],
        ["Estimated revenue", dollars(row.estimated_revenue_cents)],
        ["Scheduled", row.scheduled_at], ["Completed", row.completed_at],
      ]),
    };
  }
  // outcomes
  return {
    ...base,
    label: `Outcome ${String(row.id).slice(0, 8)}`,
    summary: lines([
      ["Outcome", row.status], ["Persona", persona(row)],
      ["Gross revenue", dollars(row.gross_revenue_cents)], ["Gross margin", dollars(row.gross_margin_cents)],
      ["Closed", row.closed_at],
    ]),
  };
}

/**
 * A directed link from a CRM row's own Brain node to a related node, addressed by
 * (kind, key) so the persistence layer can resolve both ends to ids at write time.
 * `from` is always the row's own reference node.
 */
export type CrmEdgeSpec = {
  fromKind: string;
  fromKey: string;
  toKind: string;
  toKey: string;
  relation: EdgeRelation;
};

/** Real FK parents per table — each becomes a `belongs_to` edge to the parent's node. */
const CRM_BELONGS_TO: Record<CrmIngestTable, Array<{ column: string; table: CrmIngestTable }>> = {
  companies: [],
  contacts: [{ column: "company_id", table: "companies" }],
  properties: [
    { column: "company_id", table: "companies" },
    { column: "contact_id", table: "contacts" },
  ],
  leads: [
    { column: "company_id", table: "companies" },
    { column: "contact_id", table: "contacts" },
    { column: "property_id", table: "properties" },
  ],
  jobs: [
    { column: "lead_id", table: "leads" },
    { column: "company_id", table: "companies" },
  ],
  outcomes: [
    { column: "lead_id", table: "leads" },
    { column: "job_id", table: "jobs" },
  ],
};

function crmRef(table: CrmIngestTable, id: unknown): { kind: string; key: string } | null {
  if (typeof id !== "string" || id.trim().length === 0) return null;
  return { kind: CRM_NODE_KINDS[table], key: crmNodeKey(table, id) };
}

/**
 * Build the graph edges implied by a CRM row (pure). Real foreign keys become
 * `belongs_to` edges to the parent record's node; a non-empty persona becomes a
 * `targets` edge to that persona node. Null FKs are skipped, and a ref equal to
 * the row's own node is dropped (the edge table forbids self-loops anyway).
 */
export function buildEdgesForCrmRow(table: CrmIngestTable, row: Record<string, unknown>): CrmEdgeSpec[] {
  const fromId = typeof row.id === "string" ? row.id : null;
  if (!fromId) return [];
  const from = { kind: CRM_NODE_KINDS[table], key: crmNodeKey(table, fromId) };
  const edges: CrmEdgeSpec[] = [];

  for (const fk of CRM_BELONGS_TO[table]) {
    const ref = crmRef(fk.table, row[fk.column]);
    if (ref && ref.key !== from.key) {
      edges.push({ fromKind: from.kind, fromKey: from.key, toKind: ref.kind, toKey: ref.key, relation: "belongs_to" });
    }
  }

  const p = persona(row);
  if (p) {
    edges.push({ fromKind: from.kind, fromKey: from.key, toKind: "persona", toKey: p, relation: "targets" });
  }

  return edges;
}

/** Persona slugs whose words read as acronyms — uppercased in display labels. */
const PERSONA_LABEL_ACRONYMS = new Set(["hoa", "hvac", "gc"]);

/**
 * Humanize a persona slug into a readable label (pure). Strips the `persona_`
 * prefix, title-cases each word, and uppercases known acronyms. Works for the
 * BSR defaults and for any org-custom persona slug, so it stays generic.
 */
export function personaDisplayLabel(persona: string): string {
  const base = persona.startsWith("persona_") ? persona.slice("persona_".length) : persona;
  const label = base
    .split("_")
    .filter(Boolean)
    .map((w) => (PERSONA_LABEL_ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
  return label || "Persona";
}

/**
 * Build a Brain node input for a persona, keyed by the persona value itself so a
 * CRM/campaign row's `targets persona` edge (whose `toKey` is the raw persona)
 * can resolve to it. Without these nodes every persona edge silently skips — this
 * is what makes the graph actually connect records through their personas.
 */
export function buildPersonaNodeInput(persona: string): KnowledgeNodeInput {
  return {
    kind: "persona",
    key: persona,
    label: personaDisplayLabel(persona),
    persona,
    source: "persona-sync",
    tags: ["persona"],
  };
}

/**
 * Inverse of `CRM_BELONGS_TO` (pure): the child tables (and FK column) that point
 * at `parent`. Used to back-link — when a parent record mirrors into the Brain,
 * its already-synced children can have their `belongs_to` edge linked even though
 * the child was synced first (when the parent's node didn't yet exist).
 */
export function crmChildRefs(parent: CrmIngestTable): Array<{ table: CrmIngestTable; column: string }> {
  const out: Array<{ table: CrmIngestTable; column: string }> = [];
  for (const child of Object.keys(CRM_BELONGS_TO) as CrmIngestTable[]) {
    for (const fk of CRM_BELONGS_TO[child]) {
      if (fk.table === parent) out.push({ table: child, column: fk.column });
    }
  }
  return out;
}

// --- Campaigns → Brain (slice 4) ------------------------------------------
// Campaigns are a 7th source. They mirror in as `campaign_ref` nodes that
// `targets` their persona and `relates_to` the CRM records they're aimed at, so
// recall can surface "we ran this campaign for this persona / these accounts".

const CAMPAIGN_NODE_KIND = "campaign_ref";

/** Idempotency handle for a campaign's Brain node. */
export function campaignNodeKey(id: string): string {
  return `campaign:${id}`;
}

/** Build a Brain node input from a raw `campaigns` row (pure). */
export function buildNodeInputForCampaign(row: Record<string, unknown>): KnowledgeNodeInput {
  const id = row.id as string;
  return {
    kind: CAMPAIGN_NODE_KIND,
    key: campaignNodeKey(id),
    label: (row.name as string) || "Campaign",
    summary: lines([
      ["Campaign", row.name], ["Persona", persona(row)],
      // Prefer the industry-neutral theme; fall back to the legacy restoration enum.
      ["Theme", row.campaign_theme || row.restoration_focus],
      ["Status", row.status], ["Objective", row.objective],
      ["Audience", row.audience_summary], ["Offer", row.offer_summary],
    ]),
    persona: persona(row),
    refTable: "campaigns",
    refId: id,
    source: "campaign-sync",
    tags: ["campaign"],
  };
}

/** Foreign keys on a campaign row → `relates_to` edges to those CRM records. */
const CAMPAIGN_CRM_REFS: Array<{ column: string; table: CrmIngestTable }> = [
  { column: "company_id", table: "companies" },
  { column: "contact_id", table: "contacts" },
  { column: "property_id", table: "properties" },
  { column: "lead_id", table: "leads" },
];

/**
 * Edges implied by a campaign row (pure): `targets` its persona node and
 * `relates_to` each CRM record it's aimed at (company / contact / property /
 * lead). Null FKs are skipped.
 */
export function buildEdgesForCampaign(row: Record<string, unknown>): CrmEdgeSpec[] {
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return [];
  const from = { kind: CAMPAIGN_NODE_KIND, key: campaignNodeKey(id) };
  const edges: CrmEdgeSpec[] = [];

  const p = persona(row);
  if (p) {
    edges.push({ fromKind: from.kind, fromKey: from.key, toKind: "persona", toKey: p, relation: "targets" });
  }

  for (const ref of CAMPAIGN_CRM_REFS) {
    const target = crmRef(ref.table, row[ref.column]);
    if (target && target.key !== from.key) {
      edges.push({ fromKind: from.kind, fromKey: from.key, toKind: target.kind, toKey: target.key, relation: "relates_to" });
    }
  }

  return edges;
}

// --- Media → Brain (slice 4) ----------------------------------------------
// Arc-available media mirrors in as `asset_ref` nodes so Arc can recall and
// prefer real, approved media. Standalone (no persona/campaign FK on the row).

export const MEDIA_NODE_KIND = "asset_ref";

/** Idempotency handle for a media asset's Brain node. */
export function mediaNodeKey(id: string): string {
  return `media:${id}`;
}

/** Build a Brain node input from a raw `media_assets` row (pure). */
export function buildNodeInputForMedia(row: Record<string, unknown>): KnowledgeNodeInput {
  const id = row.id as string;
  const tags = Array.isArray(row.tags) ? (row.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
  const mediaKind = typeof row.kind === "string" ? row.kind : null;
  return {
    kind: MEDIA_NODE_KIND,
    key: mediaNodeKey(id),
    label: (row.file_name as string) || "Media asset",
    summary: lines([
      ["Media", row.file_name], ["Kind", mediaKind], ["Source", row.source],
      ["Type", row.content_type], ["Tags", tags.length ? tags.join(", ") : null],
    ]),
    refTable: "media_assets",
    refId: id,
    source: "media-sync",
    tags: ["media", ...(mediaKind ? [mediaKind] : []), ...tags],
  };
}

// --- Performance (campaign_results) → Brain (slice 4) ----------------------
// Each result row mirrors in as a `signal` node that `learned_from` its campaign,
// so Arc can recall what a campaign actually did (impressions → jobs → revenue).

/** Idempotency handle for a campaign_results row's Brain node. */
export function campaignResultNodeKey(id: string): string {
  return `perf:${id}`;
}

/** Build a Brain node input from a raw `campaign_results` row (pure). */
export function buildNodeInputForCampaignResult(row: Record<string, unknown>): KnowledgeNodeInput {
  const id = row.id as string;
  const period = [row.period_start, row.period_end].filter(Boolean).join(" – ");
  const campaignId = typeof row.campaign_id === "string" ? row.campaign_id : null;
  return {
    kind: "signal",
    key: campaignResultNodeKey(id),
    label: `Campaign performance${period ? ` (${period})` : ""}`,
    summary: lines([
      ["Period", period || null], ["Channel", row.channel],
      ["Impressions", row.impressions], ["Clicks", row.clicks], ["Leads", row.leads],
      ["Jobs", row.jobs], ["Revenue", dollars(row.won_revenue_cents)], ["Spend", dollars(row.spend_cents)],
    ]),
    // Reference the campaign it measures (campaign_results isn't a referenceable
    // table; the edge below carries the precise link).
    refTable: campaignId ? "campaigns" : null,
    refId: campaignId,
    source: "performance-sync",
    tags: ["performance"],
  };
}

/** A performance signal `learned_from` its campaign. */
export function buildEdgesForCampaignResult(row: Record<string, unknown>): CrmEdgeSpec[] {
  const id = typeof row.id === "string" ? row.id : null;
  const campaignId = typeof row.campaign_id === "string" ? row.campaign_id : null;
  if (!id || !campaignId) return [];
  return [
    {
      fromKind: "signal",
      fromKey: campaignResultNodeKey(id),
      toKind: CAMPAIGN_NODE_KIND,
      toKey: campaignNodeKey(campaignId),
      relation: "learned_from",
    },
  ];
}

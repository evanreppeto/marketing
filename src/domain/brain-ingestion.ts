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

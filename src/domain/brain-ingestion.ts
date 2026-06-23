/**
 * CRM → Brain ingestion (pure). Turns a raw CRM DB row into a
 * `KnowledgeNodeInput` so creating/editing a CRM record can create/update a
 * matching reference node in the knowledge graph. No I/O — persistence and
 * wiring live in later layers.
 */

import {
  type KnowledgeNodeInput,
  type EdgeRelation,
  type ReferenceableTable,
} from "./knowledge-graph";

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

export type EdgeIntent = { toTable: ReferenceableTable; toId: string; relation: EdgeRelation };

/** FK → (target table, relation) wiring per CRM table. Only direct FKs. */
const EDGE_FK_MAP: Partial<Record<CrmIngestTable, Array<{ column: string; toTable: ReferenceableTable; relation: EdgeRelation }>>> = {
  contacts: [{ column: "company_id", toTable: "companies", relation: "belongs_to" }],
  properties: [
    { column: "company_id", toTable: "companies", relation: "belongs_to" },
    { column: "contact_id", toTable: "contacts", relation: "relates_to" },
  ],
  leads: [
    { column: "company_id", toTable: "companies", relation: "belongs_to" },
    { column: "contact_id", toTable: "contacts", relation: "belongs_to" },
    { column: "property_id", toTable: "properties", relation: "relates_to" },
    { column: "attributed_campaign_id", toTable: "campaigns", relation: "responds_to" },
  ],
  jobs: [
    { column: "lead_id", toTable: "leads", relation: "relates_to" },
    { column: "company_id", toTable: "companies", relation: "belongs_to" },
    { column: "property_id", toTable: "properties", relation: "relates_to" },
  ],
  outcomes: [
    { column: "job_id", toTable: "jobs", relation: "relates_to" },
    { column: "lead_id", toTable: "leads", relation: "relates_to" },
  ],
};

/** Build child->parent edge intents from a CRM row's FK columns. Blank/missing FKs omitted. */
export function buildEdgeIntentsForCrmRow(table: CrmIngestTable, row: Record<string, unknown>): EdgeIntent[] {
  const rules = EDGE_FK_MAP[table] ?? [];
  const out: EdgeIntent[] = [];
  for (const rule of rules) {
    const toId = row[rule.column];
    if (typeof toId === "string" && toId.length > 0) {
      out.push({ toTable: rule.toTable, toId, relation: rule.relation });
    }
  }
  return out;
}

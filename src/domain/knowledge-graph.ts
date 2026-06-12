/**
 * Marketing Brain — pure vocabulary, validation, and trust logic for the
 * knowledge graph. No I/O. The graph's vocabulary (node kinds, edge relations)
 * and its trust lifecycle live here so they stay deterministic and unit-testable
 * (the DB stores `kind`/`relation` as plain text validated against these lists).
 *
 * NOTE: This module intentionally uses `KnowledgeParseResult` instead of
 * `ParseResult` to avoid a duplicate-export conflict with `interactions.ts`
 * which also exports `ParseResult` through the domain barrel.
 */

export const NODE_KINDS = [
  "brand_fact",
  "persona",
  "segment",
  "service",
  "proof_point",
  "messaging_angle",
  "cta",
  "asset_ref",
  "learning",
  "signal",
  "crm_ref",
  "campaign_ref",
  "other",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Kinds whose content can govern outbound copy — gated behind operator approval. */
export const GATED_NODE_KINDS = ["brand_fact", "messaging_angle", "cta", "proof_point"] as const;
export type GatedNodeKind = (typeof GATED_NODE_KINDS)[number];

export const EDGE_RELATIONS = [
  "responds_to",
  "governs",
  "proves",
  "targets",
  "relates_to",
  "learned_from",
  "used_in",
  "belongs_to",
  "competes_with",
] as const;
export type EdgeRelation = (typeof EDGE_RELATIONS)[number];

export const TRUST_TIERS = ["observed", "proposed", "trusted", "rejected", "archived"] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

/** Existing typed tables a node may reference (instead of copying). */
export const REFERENCEABLE_TABLES = [
  "companies",
  "contacts",
  "properties",
  "leads",
  "jobs",
  "outcomes",
  "campaigns",
  "campaign_assets",
] as const;
export type ReferenceableTable = (typeof REFERENCEABLE_TABLES)[number];

export type NodeAuthor = "mark" | "operator";
export type ApprovalDecision = "approve" | "reject";

export type KnowledgeNodeInput = {
  kind: NodeKind;
  label: string;
  body?: string | null;
  summary?: string | null;
  persona?: string | null;
  confidence?: number | null;
  key?: string | null;
  refTable?: ReferenceableTable | null;
  refId?: string | null;
  source?: string | null;
  sourceReference?: string | null;
  tags?: string[];
  props?: Record<string, unknown>;
};

export type KnowledgeEdgeInput = {
  fromNodeId: string;
  toNodeId: string;
  relation: EdgeRelation;
  weight?: number | null;
  source?: string | null;
  props?: Record<string, unknown>;
};

/** Result type for this module. Named KnowledgeParseResult to avoid barrel conflict with interactions.ts ParseResult. */
export type KnowledgeParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const NODE_KIND_SET = new Set<string>(NODE_KINDS);
const GATED_KIND_SET = new Set<string>(GATED_NODE_KINDS);
const RELATION_SET = new Set<string>(EDGE_RELATIONS);
const REFERENCEABLE_SET = new Set<string>(REFERENCEABLE_TABLES);

export function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === "string" && NODE_KIND_SET.has(value);
}

export function isGatedKind(value: unknown): value is GatedNodeKind {
  return typeof value === "string" && GATED_KIND_SET.has(value);
}

export function isEdgeRelation(value: unknown): value is EdgeRelation {
  return typeof value === "string" && RELATION_SET.has(value);
}

/**
 * Initial trust tier for a new node. Operator writes are trusted immediately;
 * Mark's gated kinds enter the approval queue (proposed); Mark's other kinds are
 * recorded as observed (usable internally, flagged as not operator-verified).
 */
export function resolveInitialTrustTier(args: { kind: NodeKind; createdBy: NodeAuthor }): TrustTier {
  if (args.createdBy === "operator") return "trusted";
  return isGatedKind(args.kind) ? "proposed" : "observed";
}

/** Transition for an operator decision on a proposed node/edge. */
export function resolveDecisionTier(
  current: TrustTier,
  decision: ApprovalDecision,
): KnowledgeParseResult<TrustTier> {
  if (current !== "proposed") {
    return { ok: false, error: "Only a proposed item can be approved or rejected." };
  }
  return { ok: true, value: decision === "approve" ? "trusted" : "rejected" };
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateNodeInput(raw: {
  kind: unknown;
  label: unknown;
  body?: unknown;
  summary?: unknown;
  persona?: unknown;
  confidence?: unknown;
  key?: unknown;
  refTable?: unknown;
  refId?: unknown;
  source?: unknown;
  sourceReference?: unknown;
  tags?: unknown;
  props?: unknown;
}): KnowledgeParseResult<KnowledgeNodeInput> {
  if (!isNodeKind(raw.kind)) return { ok: false, error: "Unknown node kind." };
  const label = trimmed(raw.label);
  if (!label) return { ok: false, error: "A node needs a label." };

  const persona = raw.persona == null || raw.persona === "" ? null : trimmed(raw.persona);
  if (persona === "unassigned_persona") {
    return { ok: false, error: "unassigned_persona is internal-only and cannot be stored." };
  }

  const hasTable = raw.refTable != null && raw.refTable !== "";
  const hasId = raw.refId != null && raw.refId !== "";
  if (hasTable !== hasId) {
    return { ok: false, error: "A reference needs both a table and an id." };
  }
  if (hasTable && !REFERENCEABLE_SET.has(trimmed(raw.refTable))) {
    return { ok: false, error: "That table cannot be referenced." };
  }

  let confidence: number | null = null;
  if (raw.confidence != null && raw.confidence !== "") {
    const n = Number(raw.confidence);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { ok: false, error: "Confidence must be between 0 and 100." };
    }
    confidence = Math.round(n);
  }

  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [];
  const props =
    raw.props && typeof raw.props === "object" && !Array.isArray(raw.props)
      ? (raw.props as Record<string, unknown>)
      : {};

  return {
    ok: true,
    value: {
      kind: raw.kind,
      label,
      body: trimmed(raw.body) || null,
      summary: trimmed(raw.summary) || null,
      persona: persona || null,
      confidence,
      key: trimmed(raw.key) || null,
      refTable: hasTable ? (trimmed(raw.refTable) as ReferenceableTable) : null,
      refId: hasId ? trimmed(raw.refId) : null,
      source: trimmed(raw.source) || null,
      sourceReference: trimmed(raw.sourceReference) || null,
      tags,
      props,
    },
  };
}

export function validateEdgeInput(raw: {
  fromNodeId: unknown;
  toNodeId: unknown;
  relation: unknown;
  weight?: unknown;
  source?: unknown;
  props?: unknown;
}): KnowledgeParseResult<KnowledgeEdgeInput> {
  const fromNodeId = trimmed(raw.fromNodeId);
  const toNodeId = trimmed(raw.toNodeId);
  if (!fromNodeId || !toNodeId) return { ok: false, error: "An edge needs two node ids." };
  if (fromNodeId === toNodeId) return { ok: false, error: "An edge cannot link a node to itself." };
  if (!isEdgeRelation(raw.relation)) return { ok: false, error: "Unknown relation." };

  let weight: number | null = null;
  if (raw.weight != null && raw.weight !== "") {
    const n = Number(raw.weight);
    if (!Number.isFinite(n)) return { ok: false, error: "Weight must be a number." };
    weight = n;
  }
  const props =
    raw.props && typeof raw.props === "object" && !Array.isArray(raw.props)
      ? (raw.props as Record<string, unknown>)
      : {};

  return {
    ok: true,
    value: {
      fromNodeId,
      toNodeId,
      relation: raw.relation,
      weight,
      source: trimmed(raw.source) || null,
      props,
    },
  };
}

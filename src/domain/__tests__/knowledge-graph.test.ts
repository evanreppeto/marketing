import { describe, expect, it } from "vitest";

import {
  GATED_NODE_KINDS,
  isGatedKind,
  MAX_TAGS,
  normalizeKind,
  normalizeTags,
  resolveInitialTrustTier,
  resolveDecisionTier,
  validateNodeInput,
  validateEdgeInput,
} from "../knowledge-graph";

describe("normalizeKind", () => {
  it("slugifies free text into a safe kind", () => {
    expect(normalizeKind("Weather Signal")).toBe("weather_signal");
    expect(normalizeKind("  Proof / Asset  ")).toBe("proof_asset");
    expect(normalizeKind("brand_fact")).toBe("brand_fact");
  });
  it("rejects values that can't start with a letter", () => {
    expect(normalizeKind("")).toBe("");
    expect(normalizeKind("123")).toBe("");
    expect(normalizeKind("!!!")).toBe("");
    expect(normalizeKind(42)).toBe("");
  });
});

describe("custom kinds and gating safety", () => {
  it("never auto-gates a custom kind Arc creates", () => {
    expect(resolveInitialTrustTier({ kind: "weather_signal", createdBy: "arc" })).toBe("observed");
    expect(isGatedKind("weather_signal")).toBe(false);
  });
  it("still gates the built-in outbound-governing kinds", () => {
    expect(resolveInitialTrustTier({ kind: "brand_fact", createdBy: "arc" })).toBe("proposed");
  });
  it("accepts a custom kind through validateNodeInput", () => {
    const result = validateNodeInput({ kind: "Weather Signal", label: "Hailstorm in Evanston" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe("weather_signal");
  });
});

describe("normalizeTags", () => {
  it("trims, drops empties, and collapses inner whitespace", () => {
    expect(normalizeTags(["  water  ", "", "  ", "fire   damage"])).toEqual(["water", "fire damage"]);
  });
  it("dedupes case-insensitively, keeping first-seen casing", () => {
    expect(normalizeTags(["Water", "water", "WATER"])).toEqual(["Water"]);
  });
  it("caps the number of tags", () => {
    const many = Array.from({ length: MAX_TAGS + 5 }, (_, i) => `tag-${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS);
  });
  it("ignores non-arrays and non-strings", () => {
    expect(normalizeTags("water")).toEqual([]);
    expect(normalizeTags([1, null, "ok", {}])).toEqual(["ok"]);
  });
});

describe("isGatedKind", () => {
  it("flags the outbound-governing kinds", () => {
    expect(GATED_NODE_KINDS).toContain("brand_fact");
    expect(isGatedKind("brand_fact")).toBe(true);
    expect(isGatedKind("cta")).toBe(true);
    expect(isGatedKind("learning")).toBe(false);
    expect(isGatedKind("persona")).toBe(false);
  });
});

describe("resolveInitialTrustTier", () => {
  it("trusts everything an operator creates", () => {
    expect(resolveInitialTrustTier({ kind: "brand_fact", createdBy: "operator" })).toBe("trusted");
    expect(resolveInitialTrustTier({ kind: "learning", createdBy: "operator" })).toBe("trusted");
  });
  it("proposes gated kinds Arc creates", () => {
    expect(resolveInitialTrustTier({ kind: "brand_fact", createdBy: "arc" })).toBe("proposed");
    expect(resolveInitialTrustTier({ kind: "cta", createdBy: "arc" })).toBe("proposed");
  });
  it("lets Arc observe non-gated kinds freely", () => {
    expect(resolveInitialTrustTier({ kind: "learning", createdBy: "arc" })).toBe("observed");
    expect(resolveInitialTrustTier({ kind: "signal", createdBy: "arc" })).toBe("observed");
  });
});

describe("resolveDecisionTier", () => {
  it("approves a proposed node to trusted", () => {
    expect(resolveDecisionTier("proposed", "approve")).toEqual({ ok: true, value: "trusted" });
  });
  it("rejects a proposed node", () => {
    expect(resolveDecisionTier("proposed", "reject")).toEqual({ ok: true, value: "rejected" });
  });
  it("refuses to decide on a node that is not proposed", () => {
    const result = resolveDecisionTier("trusted", "approve");
    expect(result.ok).toBe(false);
  });
});

describe("validateNodeInput", () => {
  it("accepts a minimal valid node", () => {
    const result = validateNodeInput({ kind: "brand_fact", label: "We answer 24/7" });
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ kind: "brand_fact", label: "We answer 24/7" }),
    });
  });
  it("accepts a custom kind, normalizing it to a slug", () => {
    const result = validateNodeInput({ kind: "Field Note", label: "x" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe("field_note");
  });
  it("rejects a kind that can't be made a valid slug", () => {
    expect(validateNodeInput({ kind: "  ", label: "x" }).ok).toBe(false);
    expect(validateNodeInput({ kind: "123", label: "x" }).ok).toBe(false);
  });
  it("rejects an empty label", () => {
    expect(validateNodeInput({ kind: "learning", label: "  " }).ok).toBe(false);
  });
  it("rejects the internal-only persona", () => {
    expect(validateNodeInput({ kind: "persona", label: "p", persona: "unassigned_persona" }).ok).toBe(false);
  });
  it("requires ref_table and ref_id together", () => {
    expect(validateNodeInput({ kind: "crm_ref", label: "Acme", refTable: "companies" }).ok).toBe(false);
    expect(validateNodeInput({ kind: "crm_ref", label: "Acme", refId: "abc" }).ok).toBe(false);
  });
  it("rejects an un-referenceable ref_table", () => {
    expect(
      validateNodeInput({ kind: "crm_ref", label: "x", refTable: "secrets", refId: "abc" }).ok,
    ).toBe(false);
  });
  it("accepts a valid ref pair", () => {
    const result = validateNodeInput({ kind: "crm_ref", label: "Acme", refTable: "companies", refId: "abc" });
    expect(result.ok).toBe(true);
  });
  it("rejects out-of-range confidence", () => {
    expect(validateNodeInput({ kind: "learning", label: "x", confidence: 140 }).ok).toBe(false);
  });
});

describe("validateEdgeInput", () => {
  it("accepts a known relation between two distinct nodes", () => {
    const result = validateEdgeInput({ fromNodeId: "a", toNodeId: "b", relation: "proves" });
    expect(result.ok).toBe(true);
  });
  it("rejects an unknown relation", () => {
    expect(validateEdgeInput({ fromNodeId: "a", toNodeId: "b", relation: "frobnicates" }).ok).toBe(false);
  });
  it("rejects a self-loop", () => {
    expect(validateEdgeInput({ fromNodeId: "a", toNodeId: "a", relation: "proves" }).ok).toBe(false);
  });
  it("rejects missing endpoints", () => {
    expect(validateEdgeInput({ fromNodeId: "", toNodeId: "b", relation: "proves" }).ok).toBe(false);
  });
});

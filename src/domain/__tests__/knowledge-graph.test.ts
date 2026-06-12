import { describe, expect, it } from "vitest";

import {
  GATED_NODE_KINDS,
  isGatedKind,
  resolveInitialTrustTier,
  resolveDecisionTier,
  validateNodeInput,
  validateEdgeInput,
} from "../knowledge-graph";

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
  it("proposes gated kinds Mark creates", () => {
    expect(resolveInitialTrustTier({ kind: "brand_fact", createdBy: "mark" })).toBe("proposed");
    expect(resolveInitialTrustTier({ kind: "cta", createdBy: "mark" })).toBe("proposed");
  });
  it("lets Mark observe non-gated kinds freely", () => {
    expect(resolveInitialTrustTier({ kind: "learning", createdBy: "mark" })).toBe("observed");
    expect(resolveInitialTrustTier({ kind: "signal", createdBy: "mark" })).toBe("observed");
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
  it("rejects an unknown kind", () => {
    expect(validateNodeInput({ kind: "nonsense", label: "x" }).ok).toBe(false);
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

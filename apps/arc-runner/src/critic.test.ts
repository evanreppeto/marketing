import { describe, expect, it } from "vitest";

import { riskFlagsFromFindings, riskFromFindings, type CriticFinding } from "./critic";

function finding(verdict: CriticFinding["verdict"], claim = "a claim"): CriticFinding {
  return { claim, verdict, note: "note" };
}

describe("riskFromFindings", () => {
  it("reserves `low` for copy a reviewer actually grounded", () => {
    expect(riskFromFindings([finding("grounded"), finding("grounded")])).toBe("low");
  });

  it("treats an unsupported claim as medium", () => {
    expect(riskFromFindings([finding("grounded"), finding("unsupported")])).toBe("medium");
  });

  it("treats a fabricated claim as high, even alongside grounded ones", () => {
    expect(riskFromFindings([finding("grounded"), finding("unsupported"), finding("fabricated")])).toBe("high");
  });

  it("never returns `blocked` — that means a banned phrase, which only the deterministic screen can prove", () => {
    const worst = riskFromFindings([finding("fabricated"), finding("fabricated")]);
    expect(worst).not.toBe("blocked");
    expect(worst).toBe("high");
  });

  it("calls a draft with no checkable claims low rather than inventing a concern", () => {
    expect(riskFromFindings([])).toBe("low");
  });
});

describe("riskFlagsFromFindings", () => {
  it("names the problem types and says nothing about grounded claims", () => {
    const flags = riskFlagsFromFindings([finding("grounded"), finding("unsupported"), finding("fabricated")]);
    expect(flags).toContain("claim_risk");
    expect(flags).toContain("unsupported_claim");
    expect(flags).toHaveLength(2);
  });

  it("is empty for clean copy", () => {
    expect(riskFlagsFromFindings([finding("grounded")])).toEqual([]);
  });
});

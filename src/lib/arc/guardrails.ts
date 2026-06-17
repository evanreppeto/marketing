export type ArcRiskLevel = "low" | "medium" | "high" | "blocked";

export type ArcGuardrailResult = {
  riskLevel: ArcRiskLevel;
  approvalStatus: "needs_compliance" | "pending_owner_approval";
  complianceNotes: string;
  flags: string[];
  blockedPhrases: string[];
};

/**
 * Industry-agnostic guardrail check for Arc-generated copy.
 *
 * Two non-negotiable baseline flags are ALWAYS applied (human review + outbound
 * locked) — Arc never sends without human approval. Beyond that, copy is blocked
 * only when it contains one of the org's configured banned phrases (from the
 * Brand Kit). Business-specific rules (e.g. BSR's insurance-claim phrases) live
 * in that per-org list, not in this engine.
 */
export function checkArcGeneratedCopy(input: {
  draftOutput: string;
  bannedPhrases?: string[];
  complianceNotes?: string;
}): ArcGuardrailResult {
  const haystack = input.draftOutput.toLowerCase();
  const blockedPhrases = (input.bannedPhrases ?? [])
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0 && haystack.includes(phrase.toLowerCase()));

  const flags = new Set<string>(["Human review required", "Outbound locked until approved"]);

  if (blockedPhrases.length > 0) {
    flags.add("Banned phrase detected");
    return {
      riskLevel: "blocked",
      approvalStatus: "needs_compliance",
      complianceNotes:
        input.complianceNotes ?? "Blocked by guardrails: contains disallowed language. Rewrite before owner approval.",
      flags: [...flags],
      blockedPhrases,
    };
  }

  flags.add("No banned phrase detected");
  return {
    riskLevel: "low",
    approvalStatus: "pending_owner_approval",
    complianceNotes: input.complianceNotes ?? "Review before outbound. No disallowed language detected.",
    flags: [...flags],
    blockedPhrases: [],
  };
}

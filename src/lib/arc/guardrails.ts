export type ArcRiskLevel = "low" | "medium" | "high" | "blocked";

export type ArcGuardrailResult = {
  riskLevel: ArcRiskLevel;
  approvalStatus: "needs_compliance" | "pending_owner_approval";
  complianceNotes: string;
  flags: string[];
  blockedPhrases: string[];
};

const BLOCKED_COPY_PATTERNS: Array<[RegExp, string]> = [
  [/\binsurance\s+(will|is going to|should)\s+(cover|pay|approve)\b/i, "Insurance outcome promise"],
  [/\bclaim\s+(will|is going to|should)\s+be\s+approved\b/i, "Claim approval promise"],
  [/\bguaranteed\s+(payout|coverage|approval|payment)\b/i, "Guaranteed insurance result"],
  [/\bwe\s+guarantee\b/i, "Unsupported guarantee"],
];

const OFF_SCOPE_LOSS_PATTERNS = [/\bhail[-\s]?only\b/i, /\bwind[-\s]?only\b/i, /\broof[-\s]?only\b/i, /\bexterior[-\s]?only\b/i];

export function checkArcGeneratedCopy(input: {
  draftOutput: string;
  lossSignals?: string[];
  restorationFocus?: string;
}): ArcGuardrailResult {
  const blockedPhrases = BLOCKED_COPY_PATTERNS
    .filter(([pattern]) => pattern.test(input.draftOutput))
    .map(([, label]) => label);
  const lossText = [input.restorationFocus, ...(input.lossSignals ?? [])].filter(Boolean).join(" ");
  const offScopeLoss = OFF_SCOPE_LOSS_PATTERNS.some((pattern) => pattern.test(lossText));
  const flags = new Set<string>();

  flags.add("Human review required");
  flags.add("Outbound locked until approved");

  if (blockedPhrases.length > 0) {
    flags.add("Coverage or guarantee language blocked");
  } else {
    flags.add("No coverage promise detected");
    flags.add("No claim approval language detected");
  }

  if (offScopeLoss) {
    flags.add("Off-scope exterior-only loss blocked");
  }

  if (blockedPhrases.length > 0 || offScopeLoss) {
    return {
      riskLevel: "blocked",
      approvalStatus: "needs_compliance",
      complianceNotes: "Blocked by Arc guardrails. Rewrite before owner approval.",
      flags: [...flags],
      blockedPhrases,
    };
  }

  const insuranceMentioned = /\binsurance|claim|coverage\b/i.test(input.draftOutput);

  return {
    riskLevel: insuranceMentioned ? "medium" : "low",
    approvalStatus: "pending_owner_approval",
    complianceNotes: insuranceMentioned
      ? "Review before outbound. Draft is coverage-neutral and avoids insurance outcome promises."
      : "Review before outbound. Draft avoids coverage, claim approval, and payout promises.",
    flags: [...flags],
    blockedPhrases,
  };
}

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  OPPORTUNITY_KINDS,
  OPPORTUNITY_SUBJECT_TYPES,
  normalizeOpportunityKind,
  normalizeOpportunitySubjectType,
} from "../opportunity-kinds";
import { parseOpportunityProposal } from "../opportunity-proposal";

describe("normalizeOpportunityKind", () => {
  it.each(OPPORTUNITY_KINDS)("passes canonical kind %s through unchanged", (kind) => {
    expect(normalizeOpportunityKind(kind)).toBe(kind);
  });

  // Every pair below is drift a real prod scan actually wrote. Both halves landed
  // in the inbox as separate open cards because kind is part of the dedup key.
  it.each([
    ["dormant_account", "crm_inactivity"],
    ["reactivation", "crm_inactivity"],
    ["segment_gap", "persona_segment_gap"],
    ["persona_gap", "persona_segment_gap"],
    ["expansion", "account_expansion"],
    ["lifecycle_upsell", "account_expansion"],
    ["storm_response", "weather_event"],
    ["data_quality_gap", "attribution_gap"],
  ])("folds the observed synonym %s onto %s", (raw, canonical) => {
    expect(normalizeOpportunityKind(raw)).toBe(canonical);
  });

  it("tolerates shape without forking the dedup key", () => {
    // "Persona Gap" and "persona-gap" mean the same thing; only the shape varies.
    for (const raw of ["Persona Gap", "persona-gap", "  PERSONA_GAP  "]) {
      expect(normalizeOpportunityKind(raw)).toBe("persona_segment_gap");
    }
  });

  it("refuses an unknown kind rather than inventing a dedup key", () => {
    expect(normalizeOpportunityKind("vibes_gap")).toBeNull();
    expect(normalizeOpportunityKind("")).toBeNull();
  });

  it("maps every alias onto a real canonical kind", () => {
    // An alias pointing at a typo would be worse than no alias at all.
    for (const kind of OPPORTUNITY_KINDS) expect(OPPORTUNITY_KINDS).toContain(kind);
    for (const raw of ["dormant_account", "expansion", "storm_response", "referral"]) {
      expect(OPPORTUNITY_KINDS).toContain(normalizeOpportunityKind(raw));
    }
  });
});

describe("normalizeOpportunitySubjectType", () => {
  it.each(OPPORTUNITY_SUBJECT_TYPES)("accepts %s", (t) => {
    expect(normalizeOpportunitySubjectType(t)).toBe(t);
  });

  it("rejects anything off-vocabulary", () => {
    expect(normalizeOpportunitySubjectType("companies")).toBeNull();
  });
});

describe("parseOpportunityProposal vocabulary", () => {
  const base = {
    subject_type: "persona",
    subject_id: "persona_landlord",
    title: "Landlord segment has zero pipeline",
    summary: "Highest-margin persona, no active campaign.",
  };

  it("normalizes a synonym kind so it collides with the existing open card", () => {
    // The real bug: this arrived as segment_gap on 07-11 and persona_gap on 07-14
    // for persona_landlord, and the unique index saw two different keys.
    const a = parseOpportunityProposal({ ...base, kind: "segment_gap" });
    const b = parseOpportunityProposal({ ...base, kind: "persona_gap" });
    expect(a.ok && b.ok).toBe(true);
    expect(a.ok && a.candidate.kind).toBe("persona_segment_gap");
    expect(b.ok && b.candidate.kind).toBe("persona_segment_gap");
  });

  it("rejects an off-vocabulary kind and names the vocabulary", () => {
    const result = parseOpportunityProposal({ ...base, kind: "vibes_gap" });
    expect(result.ok).toBe(false);
    // The caller is an agent that can read the error and retry.
    expect(!result.ok && result.error).toContain("persona_segment_gap");
  });

  it("rejects an off-vocabulary subject_type", () => {
    const result = parseOpportunityProposal({ ...base, kind: "persona_gap", subject_type: "vibe" });
    expect(result.ok).toBe(false);
  });

  it("still requires the core fields", () => {
    expect(parseOpportunityProposal({ kind: "crm_inactivity" }).ok).toBe(false);
  });
});

/**
 * The runner is a standalone package (own package.json + npm ci) and cannot import
 * @/domain, so its enum is a hand-mirror of this list. If they drift, Arc proposes a
 * kind the API then rejects — the scan quietly stops filing that category, and
 * nothing fails loudly. Cheaper to pin it here than to debug that.
 */
describe("arc-runner tool enum stays in step with the domain", () => {
  const SOURCE = readFileSync(
    join(__dirname, "..", "..", "..", "apps", "arc-runner", "src", "tools", "opportunities.ts"),
    "utf8",
  );

  const listInSource = (name: string): string[] => {
    const body = SOURCE.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const`))?.[1] ?? "";
    return [...body.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  };

  it("declares the same kinds as the domain", () => {
    expect(listInSource("OPPORTUNITY_KINDS")).toEqual([...OPPORTUNITY_KINDS]);
  });

  it("declares the same subject types as the domain", () => {
    expect(listInSource("OPPORTUNITY_SUBJECT_TYPES")).toEqual([...OPPORTUNITY_SUBJECT_TYPES]);
  });

  it("constrains both with z.enum rather than a free string", () => {
    // The regression that caused this: z.string() with the values only suggested
    // in .describe(), which the model is free to ignore — and did, most days.
    expect(SOURCE).toMatch(/kind:\s*z\.enum\(OPPORTUNITY_KINDS\)/);
    expect(SOURCE).toMatch(/subject_type:\s*z\.enum\(OPPORTUNITY_SUBJECT_TYPES\)/);
  });
});

describe("parseOpportunityProposal persona", () => {
  const base = {
    kind: "dormant_account",
    subject_type: "company",
    subject_id: "co-1",
    title: "Dormant account worth re-engaging",
    summary: "No activity in 90 days.",
  };

  function candidateFor(raw: Record<string, unknown>) {
    const parsed = parseOpportunityProposal(raw);
    if (!parsed.ok) throw new Error(`expected ok, got: ${parsed.error}`);
    return parsed.candidate;
  }

  it("normalizes a top-level persona into evidence, where the drafting path reads it", () => {
    // The producer and the consumer disagreed: propose_opportunity had no
    // persona arg at all, while getOpportunityForCampaign reads evidence.persona
    // and a campaign cannot be created without one.
    const candidate = candidateFor({ ...base, persona: "persona_property_manager" });
    expect(candidate.evidence.persona).toBe("persona_property_manager");
  });

  it("still accepts a persona nested in the free-form evidence blob", () => {
    const candidate = candidateFor({ ...base, evidence: { persona: "persona_landlord", src: "crm" } });
    expect(candidate.evidence.persona).toBe("persona_landlord");
    expect(candidate.evidence.src).toBe("crm");
  });

  it("prefers the explicit argument over a nested one", () => {
    const candidate = candidateFor({
      ...base,
      persona: "persona_property_manager",
      evidence: { persona: "persona_landlord" },
    });
    expect(candidate.evidence.persona).toBe("persona_property_manager");
  });

  it("leaves no persona key when none is supplied", () => {
    // An absent persona must stay absent rather than becoming "", which would
    // read as present downstream and fail the allowed-persona check instead of
    // the clearer no-persona skip.
    const candidate = candidateFor(base);
    expect(candidate.evidence.persona).toBeUndefined();
    expect("persona" in candidate.evidence).toBe(false);
  });

  it("treats a blank or whitespace persona as absent", () => {
    for (const persona of ["", "   "]) {
      const candidate = candidateFor({ ...base, persona });
      expect("persona" in candidate.evidence).toBe(false);
    }
  });

  it("does not mutate the caller's evidence object", () => {
    const evidence = { src: "crm" };
    candidateFor({ ...base, persona: "persona_landlord", evidence });
    expect(evidence).toEqual({ src: "crm" });
  });
});

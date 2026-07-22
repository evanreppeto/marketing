import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_EXEMPLARS,
  HEAVY_REVISION_COUNT,
  MAX_EXEMPLAR_BODY_CHARS,
  MIN_SENDS_FOR_ENGAGEMENT,
  renderExemplarSkill,
  selectExemplars,
  type ExemplarCandidate,
} from "../exemplar-skills";
import { MAX_CUSTOM_SKILL_INSTRUCTIONS } from "@/lib/arc-skills/custom";

/** Distinct bodies — dedup is Jaccard-based, so fixtures must not share vocabulary. */
const BODIES = [
  "Your basement flooded last night and every hour compounds the damage. We can be there before noon.",
  "Frozen pipes burst without warning. Our crew restores heat, dries structures, and documents everything for insurance.",
  "Storm damage on the north side? Certified technicians, same-day board-up, direct billing to your carrier.",
  "Smoke residue keeps eating surfaces long after flames stop. Book a free soot assessment this week.",
  "Mold behind drywall spreads quietly for months. Independent air quality testing included with every remediation.",
  "Commercial kitchens face grease fires yearly. Ask about our overnight cleanup so you open on schedule.",
];

function candidate(overrides: Partial<ExemplarCandidate> & { assetId: string }): ExemplarCandidate {
  return {
    assetType: "email",
    channel: "email",
    persona: "persona_landlord",
    title: `Asset ${overrides.assetId}`,
    body: BODIES[0]!,
    approvedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function approved(assetId: string, body: string, approvedUnchanged = true): ExemplarCandidate {
  return candidate({
    assetId,
    body,
    approval: { approved: true, approvedUnchanged, revisionCount: approvedUnchanged ? 0 : 1, declined: false },
  });
}

/** Still in the queue — a human has requested changes but never accepted it. */
function pending(assetId: string, body: string, revisionCount = 1): ExemplarCandidate {
  return candidate({
    assetId,
    body,
    approval: { approved: false, approvedUnchanged: false, revisionCount, declined: false },
  });
}

function converted(assetId: string, body: string, jobs: number, wonRevenueCents = 0): ExemplarCandidate {
  return candidate({
    assetId,
    body,
    approval: { approved: true, approvedUnchanged: true, revisionCount: 0, declined: false },
    outcome: { impressions: 1000, clicks: 40, leads: jobs * 2, jobs, wonRevenueCents, spendCents: 10000 },
  });
}

describe("selectExemplars — refusal", () => {
  it("refuses when nothing matches the asset type / persona filter", () => {
    const result = selectExemplars({
      candidates: [approved("a", BODIES[0]!), approved("b", BODIES[1]!), approved("c", BODIES[2]!)],
      assetType: "landing_page",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_candidates");
  });

  it("refuses when the matching assets have no copy on them", () => {
    const result = selectExemplars({
      candidates: [approved("a", "   "), approved("b", ""), approved("c", "\n")],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_usable_bodies");
  });

  it("refuses below the minimum rather than emitting a thin skill", () => {
    const result = selectExemplars({
      candidates: [approved("a", BODIES[0]!), approved("b", BODIES[1]!)],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("insufficient_evidence");
    expect(result.usable).toBe(2);
    expect(result.needed).toBe(DEFAULT_MIN_EXEMPLARS);
    // The operator is told the actual shortfall, not a generic failure.
    expect(result.detail).toContain("2");
    expect(result.detail).toContain("3");
  });

  it("refuses when enough assets exist but they are near-copies of each other", () => {
    const nearCopy = `${BODIES[0]!} Call today.`;
    const result = selectExemplars({
      candidates: [approved("a", BODIES[0]!), approved("b", nearCopy), approved("c", `${BODIES[0]!} Call now.`)],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("insufficient_evidence");
    expect(result.detail).toContain("de-duplication");
  });

  it("does not count declined or heavily-revised copy toward the minimum", () => {
    const result = selectExemplars({
      candidates: [
        approved("a", BODIES[0]!),
        approved("b", BODIES[1]!),
        candidate({ assetId: "c", body: BODIES[2]!, approval: { approved: false, approvedUnchanged: false, revisionCount: 0, declined: true } }),
        candidate({
          assetId: "d",
          body: BODIES[3]!,
          approval: { approved: true, approvedUnchanged: false, revisionCount: HEAVY_REVISION_COUNT, declined: false },
        }),
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.usable).toBe(2);
  });

  it("never treats copy still sitting in the approval queue as an exemplar", () => {
    // A revision request is evidence AGAINST the draft. Unapproved copy carries
    // no human endorsement at all, so it cannot teach the workspace's voice.
    const result = selectExemplars({
      candidates: [pending("a", BODIES[0]!), pending("b", BODIES[1]!), pending("c", BODIES[2]!), pending("d", BODIES[3]!)],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("insufficient_evidence");
    expect(result.usable).toBe(0);
  });

  it("excludes pending copy but still counts the approved copy alongside it", () => {
    const result = selectExemplars({
      candidates: [approved("a", BODIES[0]!), approved("b", BODIES[1]!), pending("c", BODIES[2]!), approved("d", BODIES[3]!)],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exemplars.map((e) => e.candidate.assetId)).toEqual(["a", "b", "d"]);
  });
});

describe("selectExemplars — tier resolution", () => {
  it("uses outcome evidence when enough assets have converted", () => {
    const result = selectExemplars({
      candidates: [
        converted("a", BODIES[0]!, 5, 900_000),
        converted("b", BODIES[1]!, 2, 300_000),
        converted("c", BODIES[2]!, 9, 100_000),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tier).toBe("outcome");
    // Ranked by jobs desc, not by revenue and not by recency.
    expect(result.exemplars.map((e) => e.candidate.assetId)).toEqual(["c", "a", "b"]);
  });

  it("falls back to approval when only one asset converted", () => {
    const result = selectExemplars({
      candidates: [
        converted("a", BODIES[0]!, 5, 900_000),
        approved("b", BODIES[1]!),
        approved("c", BODIES[2]!),
        approved("d", BODIES[3]!),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A single converted asset must not produce a one-example skill labelled "outcome".
    expect(result.tier).toBe("approval");
    expect(result.exemplars).toHaveLength(4);
  });

  it("ignores engagement rates from too few sends", () => {
    const thin = (assetId: string, body: string): ExemplarCandidate =>
      candidate({
        assetId,
        body,
        approval: { approved: true, approvedUnchanged: true, revisionCount: 0, declined: false },
        engagement: { sends: MIN_SENDS_FOR_ENGAGEMENT - 1, opens: 10, clicks: 9 },
      });
    const result = selectExemplars({ candidates: [thin("a", BODIES[0]!), thin("b", BODIES[1]!), thin("c", BODIES[2]!)] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tier).toBe("approval");
  });

  it("ranks engagement-tier exemplars by click rate, not raw clicks", () => {
    const withEngagement = (assetId: string, body: string, sends: number, clicks: number): ExemplarCandidate =>
      candidate({
        assetId,
        body,
        approval: { approved: true, approvedUnchanged: true, revisionCount: 0, declined: false },
        engagement: { sends, opens: clicks * 3, clicks },
      });
    const result = selectExemplars({
      candidates: [
        withEngagement("high-volume", BODIES[0]!, 10_000, 200), // 2%
        withEngagement("high-rate", BODIES[1]!, 100, 20), // 20%
        withEngagement("mid", BODIES[2]!, 1_000, 50), // 5%
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tier).toBe("engagement");
    expect(result.exemplars.map((e) => e.candidate.assetId)).toEqual(["high-rate", "mid", "high-volume"]);
  });

  it("prefers approved-unchanged over revised copy within the approval tier", () => {
    const result = selectExemplars({
      candidates: [approved("revised", BODIES[0]!, false), approved("clean", BODIES[1]!), approved("also-clean", BODIES[2]!)],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exemplars[0]!.candidate.assetId).not.toBe("revised");
    expect(result.exemplars.at(-1)!.candidate.assetId).toBe("revised");
  });
});

describe("selectExemplars — selection mechanics", () => {
  it("filters by asset type and persona", () => {
    const result = selectExemplars({
      candidates: [
        approved("a", BODIES[0]!),
        approved("b", BODIES[1]!),
        approved("c", BODIES[2]!),
        candidate({ assetId: "sms", body: BODIES[3]!, assetType: "sms", approval: { approved: true, approvedUnchanged: true, revisionCount: 0, declined: false } }),
        candidate({ assetId: "other-persona", body: BODIES[4]!, persona: "persona_property_manager", approval: { approved: true, approvedUnchanged: true, revisionCount: 0, declined: false } }),
      ],
      assetType: "email",
      persona: "persona_landlord",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exemplars.map((e) => e.candidate.assetId)).toEqual(["a", "b", "c"]);
  });

  it("drops near-duplicates but keeps the higher-ranked one", () => {
    const result = selectExemplars({
      candidates: [
        converted("winner", BODIES[0]!, 10),
        converted("near-copy", `${BODIES[0]!} Call today.`, 1),
        converted("distinct-1", BODIES[1]!, 5),
        converted("distinct-2", BODIES[2]!, 4),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skippedAsDuplicate).toBe(1);
    expect(result.exemplars.map((e) => e.candidate.assetId)).toEqual(["winner", "distinct-1", "distinct-2"]);
  });

  it("caps the exemplar count and reports what it dropped", () => {
    const many = BODIES.map((body, i) => converted(`a${i}`, body, BODIES.length - i));
    const result = selectExemplars({ candidates: many, maxExemplars: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exemplars).toHaveLength(3);
    expect(result.skippedForBudget).toBe(BODIES.length - 3);
  });

  it("stops adding exemplars once the character budget is spent", () => {
    const long = BODIES.map((body, i) => converted(`a${i}`, body.repeat(20), BODIES.length - i));
    const result = selectExemplars({ candidates: long, bodyBudgetChars: 6_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const spent = result.exemplars.reduce((sum, e) => sum + e.body.length, 0);
    expect(spent).toBeLessThanOrEqual(6_000);
    expect(result.skippedForBudget).toBeGreaterThan(0);
  });

  it("honours the minimum even when the budget is too small for it", () => {
    // A budget this tight would otherwise starve the selection into a refusal.
    // Each body is capped at MAX_EXEMPLAR_BODY_CHARS, so the minimum is always
    // affordable against the real constraint (the instruction cap).
    const long = BODIES.map((body, i) => converted(`a${i}`, body.repeat(20), BODIES.length - i));
    const result = selectExemplars({ candidates: long, bodyBudgetChars: 10 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exemplars).toHaveLength(DEFAULT_MIN_EXEMPLARS);
    expect(result.exemplars.reduce((sum, e) => sum + e.body.length, 0)).toBeLessThanOrEqual(
      DEFAULT_MIN_EXEMPLARS * MAX_EXEMPLAR_BODY_CHARS,
    );
  });

  it("truncates an oversized body at a word boundary and flags it", () => {
    const result = selectExemplars({
      candidates: [converted("long", "word ".repeat(2000), 5), converted("b", BODIES[1]!, 4), converted("c", BODIES[2]!, 3)],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const long = result.exemplars.find((e) => e.candidate.assetId === "long")!;
    expect(long.truncated).toBe(true);
    expect(long.body.length).toBeLessThanOrEqual(MAX_EXEMPLAR_BODY_CHARS + 1);
    expect(long.body.endsWith("…")).toBe(true);
  });

  it("collects declined and heavily-revised copy as counter-examples", () => {
    const result = selectExemplars({
      candidates: [
        approved("a", BODIES[0]!),
        approved("b", BODIES[1]!),
        approved("c", BODIES[2]!),
        candidate({ assetId: "declined", body: BODIES[3]!, approval: { approved: false, approvedUnchanged: false, revisionCount: 0, declined: true } }),
        candidate({ assetId: "churned", body: BODIES[4]!, approval: { approved: true, approvedUnchanged: false, revisionCount: 4, declined: false } }),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counterExamples.map((c) => c.candidate.assetId)).toEqual(["declined", "churned"]);
    // Counter-examples never leak into the positive set.
    expect(result.exemplars.map((e) => e.candidate.assetId)).not.toContain("declined");
  });

  it("is deterministic — same input, same order out", () => {
    const input = { candidates: [converted("a", BODIES[0]!, 3), converted("b", BODIES[1]!, 3), converted("c", BODIES[2]!, 3)] };
    const first = selectExemplars(input);
    const second = selectExemplars(input);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("renderExemplarSkill", () => {
  const selection = selectExemplars({
    candidates: [
      converted("a", BODIES[0]!, 9, 900_000),
      converted("b", BODIES[1]!, 4, 200_000),
      converted("c", BODIES[2]!, 2, 100_000),
      candidate({ assetId: "declined", body: BODIES[3]!, approval: { approved: false, approvedUnchanged: false, revisionCount: 0, declined: true } }),
    ],
  });

  function render() {
    if (!selection.ok) throw new Error("fixture should select");
    return renderExemplarSkill({
      selection,
      workspaceName: "Big Shoulders Restoration",
      assetType: "email",
      persona: "persona_landlord",
      generatedAt: "2026-07-22T12:00:00.000Z",
    });
  }

  it("emits frontmatter the skill parser can read", () => {
    const out = render();
    expect(out.markdown.startsWith("---\n")).toBe(true);
    expect(out.markdown).toContain(`name: ${out.name}`);
    expect(out.markdown).toContain(`description: ${out.description}`);
    expect(out.markdown).toContain(`command: ${out.command}`);
    expect(out.command.startsWith("/")).toBe(true);
    expect(out.name.length).toBeLessThanOrEqual(72);
    expect(out.description.length).toBeLessThanOrEqual(180);
    expect(out.key.length).toBeLessThanOrEqual(100);
  });

  it("discloses the evidence tier in the body, not just the frontmatter", () => {
    const out = render();
    expect(out.markdown).toContain("evidence_tier: outcome");
    expect(out.markdown).toContain("booked work and won revenue");
  });

  it("labels an approval-tier skill as unproven", () => {
    const approvalSelection = selectExemplars({
      candidates: [approved("a", BODIES[0]!), approved("b", BODIES[1]!), approved("c", BODIES[2]!)],
    });
    expect(approvalSelection.ok).toBe(true);
    if (!approvalSelection.ok) return;
    const out = renderExemplarSkill({
      selection: approvalSelection,
      workspaceName: "Summit",
      assetType: "email",
      generatedAt: "2026-07-22T12:00:00.000Z",
    });
    expect(out.markdown).toContain("No send or performance data backs them yet");
  });

  it("includes each exemplar body and its rationale", () => {
    const out = render();
    for (const exemplar of selection.ok ? selection.exemplars : []) {
      expect(out.markdown).toContain(exemplar.body);
      expect(out.markdown).toContain(exemplar.rationale);
    }
    expect(out.markdown).toContain("9 booked jobs");
  });

  it("includes counter-examples under their own heading", () => {
    const out = render();
    expect(out.markdown).toContain("What this workspace rejects");
    expect(out.markdown).toContain(BODIES[3]!);
  });

  it("tells the reader to copy patterns, not sentences or claims", () => {
    const out = render();
    expect(out.markdown).toContain("Do not copy their sentences");
    expect(out.markdown).toContain("claim, number, or customer detail");
  });

  it("restates that output stays approval-gated", () => {
    const out = render();
    expect(out.markdown).toContain("stays a draft for human approval");
  });

  it("fits inside the custom-skill instruction cap even at full budget", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      converted(`a${i}`, `${BODIES[i % BODIES.length]!} variant ${i} ${"filler ".repeat(400)}`, 12 - i),
    );
    const full = selectExemplars({ candidates: many });
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    const out = renderExemplarSkill({
      selection: full,
      workspaceName: "Big Shoulders Restoration",
      assetType: "email",
      persona: "persona_landlord",
      generatedAt: "2026-07-22T12:00:00.000Z",
    });
    expect(out.markdown.length).toBeLessThanOrEqual(MAX_CUSTOM_SKILL_INSTRUCTIONS);
  });

  it("omits the counter-example section when there are none", () => {
    const clean = selectExemplars({
      candidates: [converted("a", BODIES[0]!, 3), converted("b", BODIES[1]!, 2), converted("c", BODIES[2]!, 1)],
    });
    expect(clean.ok).toBe(true);
    if (!clean.ok) return;
    const out = renderExemplarSkill({
      selection: clean,
      workspaceName: "Summit",
      generatedAt: "2026-07-22T12:00:00.000Z",
    });
    expect(out.markdown).not.toContain("What this workspace rejects");
  });
});

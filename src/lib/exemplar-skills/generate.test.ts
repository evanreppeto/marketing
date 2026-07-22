import { describe, expect, it } from "vitest";

import { type ExemplarCandidate } from "@/domain";

import { generateExemplarSkill } from "./generate";

const BODIES = [
  "Your tenant called at 2am about water on the floor. We answered in four minutes and had a truck there by three.",
  "Last January we pulled forty-one burst-pipe calls in eleven days. Nearly every one was preventable with insulation.",
  "Roof opened up in the wind? Board-up first, paperwork second. We bill your carrier directly and send the claim packet.",
  "Smoke residue keeps eating surfaces long after flames stop. Book a free soot assessment before the damage sets.",
];

function candidate(assetId: string, body: string, jobs = 0): ExemplarCandidate {
  return {
    assetId,
    assetType: "email",
    channel: "email",
    persona: "persona_landlord",
    title: `Asset ${assetId}`,
    body,
    approvedAt: "2026-07-01T00:00:00.000Z",
    approval: { approved: true, approvedUnchanged: true, revisionCount: 0, declined: false },
    outcome: jobs > 0 ? { impressions: 100, clicks: 10, leads: jobs * 2, jobs, wonRevenueCents: jobs * 1000, spendCents: 500 } : null,
  };
}

const GENERATED_AT = "2026-07-22T12:00:00.000Z";

function live(candidates: ExemplarCandidate[]) {
  return { status: "live" as const, candidates };
}

describe("generateExemplarSkill", () => {
  it("renders a skill with provenance when there is enough evidence", async () => {
    const result = await generateExemplarSkill({
      orgId: "org-1",
      workspaceName: "Big Shoulders Restoration",
      assetType: "email",
      persona: "persona_landlord",
      generatedAt: GENERATED_AT,
      candidates: live([candidate("a", BODIES[0]!, 9), candidate("b", BODIES[1]!, 4), candidate("c", BODIES[2]!, 2)]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tier).toBe("outcome");
    expect(result.exemplarCount).toBe(3);
    // Provenance is ordered by rank, so a reviewer sees the top example first.
    expect(result.sourceAssetIds).toEqual(["a", "b", "c"]);
    expect(result.skill.markdown).toContain("evidence_tier: outcome");
    expect(result.skill.command).toBe("/write-email-persona-landlord");
  });

  it("reports insufficient evidence with the domain's own explanation", async () => {
    const result = await generateExemplarSkill({
      orgId: "org-1",
      workspaceName: "Summit",
      generatedAt: GENERATED_AT,
      candidates: live([candidate("a", BODIES[0]!)]),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("insufficient");
    expect(result.message).toContain("need 3");
  });

  it("distinguishes an infrastructure failure from a data shortfall", async () => {
    const result = await generateExemplarSkill({
      orgId: "org-1",
      workspaceName: "Summit",
      generatedAt: GENERATED_AT,
      candidates: { status: "unavailable", message: "Supabase env vars are not configured." },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // These must not collapse into one reason: "we can't reach the database" and
    // "you haven't approved enough copy yet" call for completely different fixes.
    expect(result.reason).toBe("unavailable");
    expect(result.message).toContain("Supabase");
  });

  it("records counter-examples separately from the exemplars it learned from", async () => {
    const declined: ExemplarCandidate = {
      ...candidate("declined", BODIES[3]!),
      approval: { approved: false, approvedUnchanged: false, revisionCount: 0, declined: true },
    };
    const result = await generateExemplarSkill({
      orgId: "org-1",
      workspaceName: "Summit",
      generatedAt: GENERATED_AT,
      candidates: live([candidate("a", BODIES[0]!), candidate("b", BODIES[1]!), candidate("c", BODIES[2]!), declined]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counterExampleAssetIds).toEqual(["declined"]);
    expect(result.sourceAssetIds).not.toContain("declined");
  });

  it("passes the asset-type and persona filter through to selection", async () => {
    const smsCandidates = [candidate("s1", BODIES[0]!), candidate("s2", BODIES[1]!), candidate("s3", BODIES[2]!)].map((c) => ({
      ...c,
      assetType: "sms" as const,
    }));
    const result = await generateExemplarSkill({
      orgId: "org-1",
      workspaceName: "Summit",
      assetType: "email",
      generatedAt: GENERATED_AT,
      candidates: live(smsCandidates),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("insufficient");
  });

  it("is reproducible — the same history renders the same skill", async () => {
    const input = {
      orgId: "org-1",
      workspaceName: "Summit",
      generatedAt: GENERATED_AT,
      candidates: live([candidate("a", BODIES[0]!, 3), candidate("b", BODIES[1]!, 2), candidate("c", BODIES[2]!, 1)]),
    };
    const first = await generateExemplarSkill(input);
    const second = await generateExemplarSkill(input);
    expect(first).toEqual(second);
  });
});

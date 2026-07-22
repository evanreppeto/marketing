import { describe, expect, it } from "vitest";

import { buildOpportunityPackageDrafts, type OpportunityPackageBrief , customerSafeAngle, resolveAudienceKind } from "../opportunity-package";

const BRIEF: OpportunityPackageBrief = {
  title: "Re-engage cold property-manager lead",
  angle: "Send a vendor packet and book a walkthrough.",
  personaLabel: "Property manager",
  focusLabel: "Water backup",
  urgency: "high",
  subjectLabel: "Lead",
};

describe("buildOpportunityPackageDrafts", () => {
  it("produces the four channels with valid campaign_asset_type values", () => {
    const drafts = buildOpportunityPackageDrafts(BRIEF);
    expect(drafts.map((d) => d.assetType)).toEqual(["email", "sms", "social_ad", "landing_page"]);
    drafts.forEach((d) => {
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.body.trim().length).toBeGreaterThan(0);
    });
  });

  it("weaves a customer-facing angle into the copy", () => {
    const drafts = buildOpportunityPackageDrafts(BRIEF);
    const email = drafts.find((d) => d.assetType === "email")!;
    expect(email.body).toContain("Send a vendor packet and book a walkthrough");
    // The deliverable *title* is internal (it labels the asset in the review
    // queue), so the opportunity title still belongs there — just not in the body.
    expect(email.title).toContain(BRIEF.title);
  });

  it("no longer names the audience in body copy — a known trade-off", () => {
    // This used to read "helps property managers like you". Per-org persona
    // labels are not guaranteed to be person-nouns: "Homeowner Preventative"
    // produced "helps homeowner preventative like you". A deterministic template
    // cannot inflect an arbitrary label, so the clause is gone. Persona still
    // drives the subject line and focus. Restoring it needs person-noun labels.
    const email = buildOpportunityPackageDrafts(BRIEF).find((d) => d.assetType === "email")!;
    expect(email.body.toLowerCase()).not.toContain("property manager");
  });

  it("is deterministic — same brief yields identical copy", () => {
    expect(buildOpportunityPackageDrafts(BRIEF)).toEqual(buildOpportunityPackageDrafts(BRIEF));
  });

  it("keeps the SMS to a single segment", () => {
    const sms = buildOpportunityPackageDrafts(BRIEF).find((d) => d.assetType === "sms")!;
    expect(sms.body.length).toBeLessThanOrEqual(320);
  });

  it("stays coverage-neutral — no insurance/claim guarantees (BSR do-not-say)", () => {
    const all = buildOpportunityPackageDrafts(BRIEF)
      .map((d) => `${d.title}\n${d.body}`)
      .join("\n")
      .toLowerCase();
    expect(all).not.toMatch(/insurance|coverage|claim|covered|deductible|guarantee/);
  });

  it("names no business and no vertical when given no context (tenant-neutral)", () => {
    const blob = buildOpportunityPackageDrafts(BRIEF).map((d) => d.body).join("\n");
    expect(blob).not.toMatch(/Big Shoulders Restoration/i);
    expect(blob).not.toMatch(/Chicagoland|IICRC|restoration technician/i);
    // Degrades to a pronoun + generic sign-off.
    const email = buildOpportunityPackageDrafts(BRIEF).find((d) => d.assetType === "email")!;
    expect(email.body).toContain("we can help");
    expect(email.body).toContain("— The team");
  });

  it("weaves the workspace's own business name + proof points into the copy", () => {
    const drafts = buildOpportunityPackageDrafts(BRIEF, {
      businessName: "Lakeside Events Co.",
      proofPoints: ["Booked 200+ weddings", "Same-week quotes"],
    });
    const blob = drafts.map((d) => d.body).join("\n");
    expect(blob).toContain("Lakeside Events Co.");
    expect(blob).toContain("Booked 200+ weddings");
    const email = drafts.find((d) => d.assetType === "email")!;
    expect(email.body).toContain("Lakeside Events Co. can help");
    expect(email.body).toContain("— The Lakeside Events Co. team");
  });

  it("treats getBusinessContext's empty-name fallback ('the business') as unnamed", () => {
    const email = buildOpportunityPackageDrafts(BRIEF, { businessName: "the business" }).find((d) => d.assetType === "email")!;
    expect(email.body).toContain("we can help");
    expect(email.body).not.toMatch(/the business/i);
  });

  it("degrades gracefully with an empty persona/focus/angle", () => {
    const drafts = buildOpportunityPackageDrafts({
      title: "Untitled opportunity",
      angle: "",
      personaLabel: "",
      focusLabel: "",
      urgency: "low",
    });
    expect(drafts).toHaveLength(4);
    drafts.forEach((d) => expect(d.body.trim().length).toBeGreaterThan(0));
  });
});

describe("copy never leaks internal language", () => {
  const ctx = { businessName: "Acme Restoration", proofPoints: ["24/7 response"] };
  const brief = {
    title: "Dana Whitfield (Southside Water & Gas) — quiet 53 days",
    angle: "Re-engage with a persona-tailored campaign",
    personaLabel: "persona_homeowner_preventative",
    focusLabel: "Water backup",
    urgency: "high" as const,
  };
  const all = () => buildOpportunityPackageDrafts(brief, ctx).map((d) => d.body).join("\n");

  it("never prints a raw persona key", () => {
    // Shipped live: "helps persona_homeowner_preventative like you".
    expect(all()).not.toContain("persona_");
    expect(all()).not.toMatch(/\b\w+_\w+\b/);
  });

  it("never prints internal jargon the recipient has no context for", () => {
    // "Re-engage with a persona-tailored campaign" is not a work order and
    // cleared the verb filter, but still exposes our vocabulary.
    const body = all();
    for (const word of ["persona-tailored", "campaign", "package"]) {
      expect(body.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it("never uses the internal opportunity title as a subject or headline", () => {
    // "… — quiet 53 days" reads as surveillance.
    expect(all()).not.toContain("quiet 53 days");
    expect(all()).not.toContain(brief.title);
  });

  it("drops a work order aimed at the operator", () => {
    const body = buildOpportunityPackageDrafts(
      {
        ...brief,
        angle:
          "Prepare a Property-Manager re-engagement package for North Shore (multi-unit angle) for human approval; no outbound until approved",
      },
      ctx,
    )
      .map((d) => d.body)
      .join("\n");
    // The live drafts told the customer "no outbound until approved".
    expect(body).not.toContain("no outbound");
    expect(body).not.toContain("human approval");
    expect(body).not.toContain("Prepare a");
  });
});

describe("customerSafeAngle", () => {
  it("keeps a genuinely customer-facing angle", () => {
    expect(customerSafeAngle("Book a free storm inspection this week")).toBe(
      "Book a free storm inspection this week",
    );
  });

  it("strips an approval clause but keeps the rest when the lead is customer-facing", () => {
    expect(customerSafeAngle("Book a free inspection; no outbound until approved")).toBe(
      "Book a free inspection",
    );
  });

  it("rejects a work order outright", () => {
    for (const angle of [
      "Queue a human-reviewed persona back-fill",
      "Assemble an insurance-agent referral-partner prospect list",
      "Review the evidence and approve a partner outreach package draft",
    ]) {
      expect(customerSafeAngle(angle)).toBe("");
    }
  });

  it("rejects internal vocabulary even without a work-order verb", () => {
    expect(customerSafeAngle("Re-engage with a persona-tailored campaign")).toBe("");
  });

  it("returns empty for empty input rather than inventing copy", () => {
    expect(customerSafeAngle("")).toBe("");
  });
});

describe("partner recruitment is a different offer", () => {
  const ctx = { businessName: "Acme Restoration", proofPoints: ["4.9★ across 380 reviews"] };
  const partnerBrief = {
    title: "Ravenswood Rooter — partner referral opportunity",
    angle: "Review the evidence and approve a partner outreach package draft",
    personaLabel: "Plumbing Partner",
    focusLabel: "Water Backup",
    urgency: "medium" as const,
    campaignType: "referral_outreach",
  };
  const bodies = (b = partnerBrief) => buildOpportunityPackageDrafts(b, ctx).map((d) => d.body).join("\n");

  it("never tells a contractor their own property is at risk", () => {
    // The live bug: a plumbing partner being recruited for referrals was told
    // "Staying ahead of water backup protects your property and your budget."
    const body = bodies();
    expect(body).not.toContain("your property");
    expect(body).not.toContain("your budget");
    expect(body).not.toContain("no-obligation assessment");
  });

  it("offers a referral handoff instead of an assessment", () => {
    const body = bodies();
    expect(body).toContain("referral handoff");
    expect(body.toLowerCase()).toContain("keep the customer");
  });

  it("agrees subject and verb for a named business", () => {
    expect(bodies()).toContain("Acme Restoration handles that side");
  });

  it("uses the plural verb when the workspace is unnamed", () => {
    expect(buildOpportunityPackageDrafts(partnerBrief).map((d) => d.body).join("\n")).toContain("We handle that side");
  });

  it("leaves customer campaigns on the customer path", () => {
    const customer = buildOpportunityPackageDrafts({ ...partnerBrief, personaLabel: "Landlord", campaignType: "re_engagement" }, ctx)
      .map((d) => d.body)
      .join("\n");
    expect(customer).toContain("no-obligation assessment");
    expect(customer).not.toContain("referral handoff");
  });
});

describe("resolveAudienceKind", () => {
  it("detects a partner from the persona label", () => {
    expect(resolveAudienceKind("Plumbing Partner")).toBe("partner");
    expect(resolveAudienceKind("HVAC Roof Electrical Partner")).toBe("partner");
  });

  it("detects a partner from the campaign type when the persona is silent", () => {
    // "Insurance Agent" has no "partner" in it, but partner_recruitment does.
    expect(resolveAudienceKind("Insurance Agent", "partner_recruitment")).toBe("partner");
    expect(resolveAudienceKind("Listing Agent", "referral_outreach")).toBe("partner");
  });

  it("defaults to customer", () => {
    // Keyword-based on purpose: personas are per-org, so a hardcoded roster
    // would mis-address every workspace but the one it was written for.
    expect(resolveAudienceKind("Landlord", "re_engagement")).toBe("customer");
    expect(resolveAudienceKind("")).toBe("customer");
  });
});

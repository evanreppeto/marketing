import { describe, expect, it } from "vitest";

import { buildOpportunityPackageDrafts, type OpportunityPackageBrief } from "../opportunity-package";

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

  it("weaves the angle and audience into the copy", () => {
    const drafts = buildOpportunityPackageDrafts(BRIEF);
    const email = drafts.find((d) => d.assetType === "email")!;
    expect(email.body).toContain("Send a vendor packet and book a walkthrough");
    expect(email.body.toLowerCase()).toContain("property manager");
    expect(email.title).toContain(BRIEF.title);
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
    expect(email.body).toContain("we help");
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
    expect(email.body).toContain("Lakeside Events Co. helps");
    expect(email.body).toContain("— The Lakeside Events Co. team");
  });

  it("treats getBusinessContext's empty-name fallback ('the business') as unnamed", () => {
    const email = buildOpportunityPackageDrafts(BRIEF, { businessName: "the business" }).find((d) => d.assetType === "email")!;
    expect(email.body).toContain("we help");
    expect(email.body).not.toMatch(/the business helps/i);
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

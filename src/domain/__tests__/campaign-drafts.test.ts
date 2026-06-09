import { describe, expect, it } from "vitest";

import { CampaignDraftValidationError, parseCampaignDraft } from "../campaign-drafts";

const base = {
  name: "  Spring flood push  ",
  persona: "persona_homeowner_emergency",
  restorationFocus: "flood",
};

describe("parseCampaignDraft", () => {
  it("normalizes a valid draft (trims strings, drops empties)", () => {
    const out = parseCampaignDraft({ ...base, audienceSummary: "  North side  ", objective: "", channel: "social" });
    expect(out).toMatchObject({
      name: "Spring flood push",
      persona: "persona_homeowner_emergency",
      restorationFocus: "flood",
      audienceSummary: "North side",
      channel: "social",
    });
    expect(out.objective).toBeUndefined();
  });

  it("rejects a missing/blank title", () => {
    expect(() => parseCampaignDraft({ ...base, name: "   " })).toThrow(CampaignDraftValidationError);
  });

  it("rejects a persona that isn't an official persona", () => {
    expect(() => parseCampaignDraft({ ...base, persona: "unassigned_persona" })).toThrow(/persona/i);
    expect(() => parseCampaignDraft({ ...base, persona: "nope" })).toThrow(/persona/i);
  });

  it("rejects an invalid restoration focus", () => {
    expect(() => parseCampaignDraft({ ...base, restorationFocus: "earthquake" })).toThrow(/restoration/i);
  });

  it("validates optional lead/company UUIDs when present", () => {
    expect(() => parseCampaignDraft({ ...base, leadId: "not-a-uuid" })).toThrow(/uuid/i);
    const out = parseCampaignDraft({ ...base, leadId: "11111111-1111-1111-1111-111111111111" });
    expect(out.leadId).toBe("11111111-1111-1111-1111-111111111111");
  });
});

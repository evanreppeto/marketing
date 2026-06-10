import { describe, expect, it } from "vitest";

import { classifyCampaignKind } from "@/domain";

describe("classifyCampaignKind", () => {
  it("treats any email/social/landing asset as outbound", () => {
    expect(classifyCampaignKind({ assetTypes: ["Email", "Campaign Brief"], objective: "Intro Goode" })).toBe("outbound");
    expect(classifyCampaignKind({ assetTypes: ["Social Ad"], objective: "Storm safety" })).toBe("outbound");
    expect(classifyCampaignKind({ assetTypes: ["Email", "Crm Lead List Review"], objective: "Apex handoff" })).toBe("outbound");
  });

  it("treats pure CRM/list/enrichment work as internal", () => {
    expect(classifyCampaignKind({ assetTypes: ["Crm Population Batch"], objective: "Populate partner records" })).toBe("internal");
    expect(classifyCampaignKind({ assetTypes: ["Partner Lead List"], objective: "Discovery recommendations" })).toBe("internal");
  });

  it("does NOT misread 'lead' as the 'ad' channel", () => {
    expect(classifyCampaignKind({ assetTypes: ["Crm Lead List Review"], objective: "Review list" })).toBe("internal");
  });

  it("defaults unknown shapes to outbound so real campaigns are never hidden", () => {
    expect(classifyCampaignKind({ assetTypes: [], objective: "" })).toBe("outbound");
    expect(classifyCampaignKind({ assetTypes: ["Mystery Asset"], objective: "Something new" })).toBe("outbound");
  });
});

import { describe, expect, it } from "vitest";

import { auditActionLabel } from "./workspace-audit";

describe("auditActionLabel", () => {
  it("maps known workspace actions to friendly labels", () => {
    expect(auditActionLabel("member.role_changed")).toBe("Role changed");
    expect(auditActionLabel("invite.created")).toBe("Invite created");
    expect(auditActionLabel("member.removed")).toBe("Member removed");
  });

  it("humanizes unknown actions instead of showing the raw key", () => {
    expect(auditActionLabel("campaign.published")).toBe("Campaign published");
  });
});

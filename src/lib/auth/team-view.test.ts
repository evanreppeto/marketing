import { describe, expect, it } from "vitest";

import { roleLabelOf, toTeamView } from "./team-view";

const NOW = Date.parse("2026-07-08T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("toTeamView", () => {
  it("maps members and invites into the Settings team view-model", () => {
    const view = toTeamView(
      "ws-1",
      [
        { id: "m1", email: "owner@bsr.test", role: "owner", status: "active" },
        { id: "m2", email: "dana@bsr.test", role: "marketer", status: "active" },
        { id: "m3", email: null, role: "reviewer", status: "invited" },
      ],
      [{ id: "i1", invitedEmail: "jordan@bsr.test", role: "admin", expiresAt: new Date(NOW + 12 * DAY).toISOString() }],
      false,
      NOW,
    );

    expect(view.workspaceId).toBe("ws-1");
    expect(view.members[0]).toMatchObject({ id: "m1", email: "owner@bsr.test", roleLabel: "Owner", isOwner: true, pending: false });
    expect(view.members[1]).toMatchObject({ roleLabel: "Marketer", isOwner: false });
    // A null-email invited membership still renders a friendly placeholder + pending flag.
    expect(view.members[2]).toMatchObject({ email: "Workspace member", pending: true, isOwner: false });
    expect(view.invites[0]).toMatchObject({ email: "jordan@bsr.test", role: "Admin", note: "Admin · expires in 12 days" });
  });

  it("marks an expired invite and title-cases unknown roles", () => {
    const view = toTeamView(
      null,
      [],
      [{ id: "i2", invitedEmail: "x@bsr.test", role: "custom", expiresAt: new Date(NOW - DAY).toISOString() }],
      true,
      NOW,
    );
    expect(view.invites[0].note).toBe("Custom · expired");
    expect(view.isDemo).toBe(true);
  });

  it("roleLabelOf handles known + unknown roles", () => {
    expect(roleLabelOf("owner")).toBe("Owner");
    expect(roleLabelOf("VIEWER")).toBe("Viewer");
    expect(roleLabelOf("")).toBe("Member");
  });
});

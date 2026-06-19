import { describe, expect, it } from "vitest";

import { buildSignUpIntent } from "./sign-up-intent";

describe("buildSignUpIntent", () => {
  it("normalizes account and workspace setup metadata for Supabase sign up", () => {
    expect(
      buildSignUpIntent({
        fullName: "  Evan Ryan  ",
        inviteCode: "",
        organizationName: "  Big Shoulders Restoration  ",
        workspaceType: "agency",
        workspaceIntent: "create",
      }),
    ).toEqual({
      metadata: {
        full_name: "Evan Ryan",
        pending_organization_name: "Big Shoulders Restoration",
        pending_workspace_intent: "create",
        pending_workspace_type: "agency",
      },
      ok: true,
    });
  });

  it("rejects missing required setup details before Supabase receives the request", () => {
    expect(
      buildSignUpIntent({
        fullName: " ",
        inviteCode: "",
        organizationName: "",
        workspaceType: "company",
        workspaceIntent: "create",
      }),
    ).toEqual({ error: "profile", ok: false });

    expect(
      buildSignUpIntent({
        fullName: "Evan Ryan",
        inviteCode: "",
        organizationName: " ",
        workspaceType: "company",
        workspaceIntent: "create",
      }),
    ).toEqual({ error: "organization", ok: false });
  });

  it("keeps join intent light and defaults unknown workspace types to company", () => {
    expect(
      buildSignUpIntent({
        fullName: "Jordan Demo",
        inviteCode: "",
        organizationName: "",
        workspaceType: "not-real",
        workspaceIntent: "join",
      }),
    ).toEqual({
      metadata: {
        full_name: "Jordan Demo",
        pending_workspace_intent: "join",
        pending_workspace_type: "company",
      },
      ok: true,
    });
  });

  it("builds the profile name from separate first and last name fields", () => {
    expect(
      buildSignUpIntent({
        firstName: "  Evan  ",
        fullName: "",
        inviteCode: "",
        lastName: "  Ryan  ",
        organizationName: "Big Shoulders Restoration",
        workspaceType: "company",
        workspaceIntent: "create",
      }),
    ).toEqual({
      metadata: {
        full_name: "Evan Ryan",
        pending_organization_name: "Big Shoulders Restoration",
        pending_workspace_intent: "create",
        pending_workspace_type: "company",
      },
      ok: true,
    });
  });

  it("normalizes invite codes for join intent without granting authorization", () => {
    expect(
      buildSignUpIntent({
        fullName: "Jordan Demo",
        inviteCode: "  bsr 7k2m  ",
        organizationName: "",
        workspaceType: "company",
        workspaceIntent: "join",
      }),
    ).toEqual({
      metadata: {
        full_name: "Jordan Demo",
        pending_invite_code: "BSR7K2M",
        pending_workspace_intent: "join",
        pending_workspace_type: "company",
      },
      ok: true,
    });
  });
});

import { describe, expect, it } from "vitest";

import { getWorkspaceAccessDecision } from "./route-protection";

describe("getWorkspaceAccessDecision", () => {
  it("sends signed-in users without workspace access to onboarding", () => {
    expect(
      getWorkspaceAccessDecision({
        hasWorkspace: false,
        isSignedIn: true,
        pathname: "/arc",
      }),
    ).toEqual({ action: "onboarding" });
  });

  it("allows onboarding while a signed-in user is still creating a workspace", () => {
    expect(
      getWorkspaceAccessDecision({
        hasWorkspace: false,
        isSignedIn: true,
        pathname: "/onboarding",
      }),
    ).toEqual({ action: "allow" });
  });

  it("sends logged-out users to login", () => {
    expect(
      getWorkspaceAccessDecision({
        hasWorkspace: false,
        isSignedIn: false,
        pathname: "/arc",
      }),
    ).toEqual({ action: "login" });
  });
});

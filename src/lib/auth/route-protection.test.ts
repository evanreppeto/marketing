import { describe, expect, it } from "vitest";

import { getWorkspaceAccessDecision, isPublicMockupPath } from "./route-protection";

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

describe("isPublicMockupPath", () => {
  it("keeps static assets public in every mode", () => {
    for (const mode of ["open", "operator", "supabase"] as const) {
      expect(isPublicMockupPath("/gallery-nav.js", mode)).toBe(true);
      expect(isPublicMockupPath("/gallery-fix.css", mode)).toBe(true);
      expect(isPublicMockupPath("/some-logo.png", mode)).toBe(true);
    }
  });

  it("keeps the landing public in every mode", () => {
    for (const mode of ["open", "operator", "supabase"] as const) {
      expect(isPublicMockupPath("/", mode)).toBe(true);
      expect(isPublicMockupPath("/build-home.html", mode)).toBe(true);
    }
  });

  it("leaves the whole gallery public in open/operator mode (current demo)", () => {
    expect(isPublicMockupPath("/build-crm.html", "open")).toBe(true);
    expect(isPublicMockupPath("/build-campaigns.html", "operator")).toBe(true);
  });

  it("gates the app screens in supabase mode", () => {
    expect(isPublicMockupPath("/build-crm.html", "supabase")).toBe(false);
    expect(isPublicMockupPath("/build-campaigns.html", "supabase")).toBe(false);
  });

  it("gates real (extensionless) app routes in supabase mode", () => {
    expect(isPublicMockupPath("/crm", "supabase")).toBe(false);
    expect(isPublicMockupPath("/arc", "supabase")).toBe(false);
  });
});

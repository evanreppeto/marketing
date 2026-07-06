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

  it("sends a signed-in member off the mockup front door into the real app", () => {
    for (const pathname of ["/", "/build-home.html"]) {
      expect(
        getWorkspaceAccessDecision({ hasWorkspace: true, isSignedIn: true, pathname }),
      ).toEqual({ action: "app" });
    }
  });

  it("allows a signed-in member into real routes and still-mockup deep screens", () => {
    for (const pathname of ["/home", "/campaigns", "/settings/team", "/build-crm.html"]) {
      expect(
        getWorkspaceAccessDecision({ hasWorkspace: true, isSignedIn: true, pathname }),
      ).toEqual({ action: "allow" });
    }
  });

  it("still sends a logged-out visitor on the front door to login (no app redirect)", () => {
    expect(
      getWorkspaceAccessDecision({ hasWorkspace: false, isSignedIn: false, pathname: "/" }),
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

  it("keeps the landing public in open/operator mode but gates it in supabase mode", () => {
    for (const mode of ["open", "operator"] as const) {
      expect(isPublicMockupPath("/", mode)).toBe(true);
      expect(isPublicMockupPath("/build-home.html", mode)).toBe(true);
    }
    // Supabase mode: the landing is gated so an unauthenticated visitor is sent
    // to the standalone /login screen instead of the mockup home.
    expect(isPublicMockupPath("/", "supabase")).toBe(false);
    expect(isPublicMockupPath("/build-home.html", "supabase")).toBe(false);
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

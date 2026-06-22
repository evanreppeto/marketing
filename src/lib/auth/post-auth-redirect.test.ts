import { describe, expect, it } from "vitest";

import { authedRedirectLocation } from "./post-auth-redirect";

const ORIGIN = "https://app.example.com";

describe("authedRedirectLocation", () => {
  it("sends invited members to /welcome", () => {
    const location = authedRedirectLocation(
      { ok: true, status: "invited_member", orgId: "org-1", workspaceId: "ws-1" },
      "/campaigns",
      ORIGIN,
    );
    expect(location).toBe("https://app.example.com/welcome?from=%2Fcampaigns");
  });

  it("sends profile-only users to /onboarding", () => {
    const location = authedRedirectLocation(
      { ok: true, status: "profile_only", orgId: null, workspaceId: null },
      "/",
      ORIGIN,
    );
    expect(location).toBe("https://app.example.com/onboarding?from=%2F");
  });

  it("sends existing members to the next path", () => {
    const location = authedRedirectLocation(
      { ok: true, status: "existing_member", orgId: "org-1", workspaceId: "ws-1" },
      "/arc",
      ORIGIN,
    );
    expect(location).toBe("https://app.example.com/arc");
  });

  it("sends failed provisioning back to login with a provision error", () => {
    const location = authedRedirectLocation(
      { ok: false, status: "failed", message: "nope" },
      "/arc",
      ORIGIN,
    );
    expect(location).toBe("https://app.example.com/login?error=provision&from=%2Farc");
  });
});

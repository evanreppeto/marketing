import { describe, expect, it } from "vitest";

import { buildGoogleDriveAuthUrl, resolveGoogleDriveConfig } from "./oauth";

describe("resolveGoogleDriveConfig", () => {
  it("reports the missing env vars needed for Drive OAuth", () => {
    expect(resolveGoogleDriveConfig({}, "https://app.example.com").missing).toEqual([
      "GOOGLE_DRIVE_CLIENT_ID",
      "GOOGLE_DRIVE_CLIENT_SECRET",
    ]);
  });
});

describe("buildGoogleDriveAuthUrl", () => {
  it("requests offline read-only Drive access for manual imports", () => {
    const url = new URL(
      buildGoogleDriveAuthUrl({
        clientId: "client-id",
        redirectUri: "https://app.example.com/api/integrations/google-drive/callback",
        state: "nonce",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/drive.readonly");
  });
});

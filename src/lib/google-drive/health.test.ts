import { describe, expect, it } from "vitest";

import { type GoogleDriveConnectionRow } from "./connection";
import { buildGoogleDriveHealth } from "./health";
import { type GoogleDriveConfig, type GoogleDrivePickerConfig } from "./oauth";

const oauthOk: GoogleDriveConfig = {
  ok: true,
  clientId: "client-id",
  clientSecret: "secret",
  redirectUri: "https://app.example.com/api/integrations/google-drive/callback",
  missing: [],
};

const pickerOk: GoogleDrivePickerConfig = {
  ok: true,
  apiKey: "picker-key",
  appId: "app-id",
  missing: [],
};

const connection = {
  org_id: "org-1",
  connected_by: "operator@example.com",
  refresh_token_ref: "secret-ref",
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  connected_email: "operator@gmail.com",
  connected_at: "2026-06-20T12:00:00.000Z",
  last_import_at: "2026-06-20T12:30:00.000Z",
  last_error: null,
} satisfies GoogleDriveConnectionRow;

describe("buildGoogleDriveHealth", () => {
  it("blocks when OAuth credentials are missing", () => {
    const health = buildGoogleDriveHealth({
      oauth: {
        ok: false,
        clientId: null,
        clientSecret: null,
        redirectUri: "http://localhost:3000/api/integrations/google-drive/callback",
        missing: ["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET"],
      },
      picker: pickerOk,
      connection: null,
    });

    expect(health.status).toBe("blocked");
    expect(health.missingOAuthEnv).toEqual(["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET"]);
    expect(health.checks.find((check) => check.key === "oauth")).toMatchObject({ status: "blocked", tone: "red" });
  });

  it("reports connected but not fully healthy when no reusable folders are saved", () => {
    const health = buildGoogleDriveHealth({
      oauth: oauthOk,
      picker: pickerOk,
      connection,
      sources: [],
    });

    expect(health.status).toBe("ready");
    expect(health.connectedEmail).toBe("operator@gmail.com");
    expect(health.checks.find((check) => check.key === "sources")).toMatchObject({
      status: "attention",
      detail: "No reusable Drive folders are saved yet.",
    });
  });

  it("flags Picker config separately from OAuth connection state", () => {
    const health = buildGoogleDriveHealth({
      oauth: oauthOk,
      picker: { ok: false, apiKey: null, appId: "app-id", missing: ["GOOGLE_DRIVE_PICKER_API_KEY"] },
      connection,
      sources: [
        {
          id: "source-1",
          driveFolderId: "folder-1",
          driveFolderName: "Brand Library",
          libraryFolderId: null,
          status: "active",
          lastSyncedAt: "2026-06-20T13:00:00.000Z",
          lastError: null,
          lastImportedCount: 3,
        },
      ],
    });

    expect(health.status).toBe("attention");
    expect(health.missingPickerEnv).toEqual(["GOOGLE_DRIVE_PICKER_API_KEY"]);
    expect(health.checks.find((check) => check.key === "picker")).toMatchObject({ status: "attention", tone: "amber" });
  });

  it("is healthy when OAuth, Picker, operator connection, and saved sources are clean", () => {
    const health = buildGoogleDriveHealth({
      oauth: oauthOk,
      picker: pickerOk,
      connection,
      sources: [
        {
          id: "source-1",
          driveFolderId: "folder-1",
          driveFolderName: "Brand Library",
          libraryFolderId: null,
          status: "active",
          lastSyncedAt: "2026-06-20T13:00:00.000Z",
          lastError: null,
          lastImportedCount: 3,
        },
      ],
    });

    expect(health.status).toBe("healthy");
    expect(health.sources).toEqual([
      expect.objectContaining({
        id: "source-1",
        label: "Brand Library",
        tone: "green",
        lastImportedCount: 3,
      }),
    ]);
  });

  it("surfaces sync errors from saved folder sources", () => {
    const health = buildGoogleDriveHealth({
      oauth: oauthOk,
      picker: pickerOk,
      connection,
      sources: [
        {
          id: "source-1",
          driveFolderId: "folder-1",
          driveFolderName: "Brand Library",
          libraryFolderId: null,
          status: "error",
          lastSyncedAt: "2026-06-20T13:00:00.000Z",
          lastError: "Access denied",
          lastImportedCount: 0,
        },
      ],
    });

    expect(health.status).toBe("attention");
    expect(health.errorSourceCount).toBe(1);
    expect(health.checks.find((check) => check.key === "sync")).toMatchObject({
      status: "attention",
      tone: "red",
      detail: "1 saved folder source needs attention.",
    });
  });
});

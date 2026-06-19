import { describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";

import { saveGoogleDriveConnection } from "./connection";

describe("saveGoogleDriveConnection", () => {
  it("stores a Drive connection for the current workspace user, not a hardcoded company account", async () => {
    let upsertValues: Record<string, unknown> | null = null;
    let upsertOptions: { onConflict?: string } | undefined;
    const client = {
      rpc: async (fn: string) => ({ data: fn === "arc_create_vault_secret" ? "vault-secret-ref" : null, error: null }),
      from: () => ({
        upsert: async (values: Record<string, unknown>, options?: { onConflict?: string }) => {
          upsertValues = values;
          upsertOptions = options;
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    await saveGoogleDriveConnection({
      orgId: "org-1",
      connectedBy: "user@example.com",
      tokenSet: {
        accessToken: "access",
        refreshToken: "refresh",
        expiresIn: 3600,
        scope: "https://www.googleapis.com/auth/drive.readonly",
      },
      client,
    });

    expect(upsertValues).toMatchObject({
      org_id: "org-1",
      connected_by: "user@example.com",
      refresh_token_ref: "vault-secret-ref",
    });
    expect(upsertOptions).toEqual({ onConflict: "org_id,connected_by" });
  });

  it("accepts Supabase Vault row-shaped create_secret responses", async () => {
    let refreshTokenRef: unknown = null;
    const client = {
      rpc: async () => ({ data: { id: "vault-row-id" }, error: null }),
      from: () => ({
        upsert: async (values: Record<string, unknown>) => {
          refreshTokenRef = values.refresh_token_ref;
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    await saveGoogleDriveConnection({
      orgId: "org-1",
      connectedBy: "user@example.com",
      tokenSet: {
        accessToken: "access",
        refreshToken: "refresh",
        expiresIn: 3600,
        scope: "https://www.googleapis.com/auth/drive.readonly",
      },
      client,
    });

    expect(refreshTokenRef).toBe("vault-row-id");
  });
});

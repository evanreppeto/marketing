import { afterEach, describe, expect, it, vi } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";

import { resolveGoogleDriveAccessToken, saveGoogleDriveConnection } from "./connection";

afterEach(() => vi.unstubAllEnvs());

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

describe("resolveGoogleDriveAccessToken", () => {
  it("falls back to the legacy operator row so existing production Drive connections keep working", async () => {
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "secret");

    const connectedByLookups: string[] = [];
    const client = {
      from: (table: string) => {
        if (table === "google_drive_connections") {
          return {
            select: () => ({
              eq: (_column: string, value: string) => ({
                eq: (_nextColumn: string, nextValue: string) => {
                  connectedByLookups.push(nextValue);
                  return {
                    maybeSingle: async () => ({
                      data:
                        nextValue === "Operator"
                          ? {
                              org_id: "org-1",
                              connected_by: "Operator",
                              refresh_token_ref: "vault-secret-ref",
                              scopes: ["https://www.googleapis.com/auth/drive.readonly"],
                              connected_email: null,
                              connected_at: "2026-06-19T17:59:57.226Z",
                              last_import_at: null,
                              last_error: null,
                            }
                          : null,
                      error: null,
                    }),
                  };
                },
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { decrypted_secret: "refresh-token" }, error: null }),
            }),
          }),
        };
      },
      rpc: async () => ({ data: "refresh-token", error: null }),
    } as unknown as SupabaseClient;

    const accessToken = await resolveGoogleDriveAccessToken({
      orgId: "org-1",
      connectedBy: "user@example.com",
      client,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            access_token: "access-token",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/drive.readonly",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    expect(accessToken).toBe("access-token");
    expect(connectedByLookups).toEqual(["user@example.com", "Operator"]);
  });
});

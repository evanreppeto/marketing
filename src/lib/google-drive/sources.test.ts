import { type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { listGoogleDriveSources, recordGoogleDriveSourceSync, saveGoogleDriveSource } from "./sources";

describe("google drive sources", () => {
  it("saves a Drive folder source for the current operator", async () => {
    let upsertValues: Record<string, unknown> | null = null;
    let upsertOptions: { onConflict?: string } | undefined;
    const client = {
      from: (table: string) => ({
        upsert: async (values: Record<string, unknown>, options?: { onConflict?: string }) => {
          upsertValues = { table, ...values };
          upsertOptions = options;
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    await saveGoogleDriveSource({
      orgId: "org-1",
      connectedBy: "user@example.com",
      driveFolderId: "drive-folder-1",
      driveFolderName: "Brand Library",
      libraryFolderId: "media-folder-1",
      client,
    });

    expect(upsertValues).toMatchObject({
      table: "google_drive_sources",
      org_id: "org-1",
      connected_by: "user@example.com",
      drive_folder_id: "drive-folder-1",
      drive_folder_name: "Brand Library",
      library_folder_id: "media-folder-1",
      status: "active",
    });
    expect(upsertOptions).toEqual({ onConflict: "org_id,connected_by,drive_folder_id" });
  });

  it("maps stored Drive source rows into UI-safe view models", async () => {
    const client = {
      from: () => {
        const chain = {
          eq: () => chain,
          order: async () => ({
            error: null,
            data: [
              {
                id: "source-1",
                org_id: "org-1",
                connected_by: "user@example.com",
                library_folder_id: null,
                drive_folder_id: "drive-folder-1",
                drive_folder_name: "Brand Library",
                status: "active",
                last_synced_at: "2026-06-20T12:00:00.000Z",
                last_error: null,
                last_imported_count: 4,
                last_seen_file_ids: ["file-1"],
                created_at: "2026-06-20T11:00:00.000Z",
                updated_at: "2026-06-20T12:00:00.000Z",
              },
            ],
          }),
        };
        return { select: () => chain };
      },
    } as unknown as SupabaseClient;

    const sources = await listGoogleDriveSources({ orgId: "org-1", connectedBy: "user@example.com", client });

    expect(sources).toEqual([
      {
        id: "source-1",
        driveFolderId: "drive-folder-1",
        driveFolderName: "Brand Library",
        libraryFolderId: null,
        status: "active",
        lastSyncedAt: "2026-06-20T12:00:00.000Z",
        lastError: null,
        lastImportedCount: 4,
      },
    ]);
  });

  it("records source sync status without exposing credentials", async () => {
    const captured: { updateValues?: Record<string, unknown> } = {};
    const client = {
      from: () => ({
        update: (values: Record<string, unknown>) => {
          captured.updateValues = values;
          const chain = {
            eq: () => chain,
            then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
          };
          return chain;
        },
      }),
    } as unknown as SupabaseClient;

    await recordGoogleDriveSourceSync({
      id: "source-1",
      orgId: "org-1",
      connectedBy: "user@example.com",
      importedCount: 3,
      fileIds: ["file-1", "file-2"],
      ok: true,
      client,
    });

    expect(captured.updateValues).toMatchObject({
      status: "active",
      last_imported_count: 3,
      last_seen_file_ids: ["file-1", "file-2"],
      last_error: null,
    });
    expect(captured.updateValues?.last_synced_at).toEqual(expect.any(String));
  });
});

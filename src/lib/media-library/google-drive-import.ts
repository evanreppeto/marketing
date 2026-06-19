import { classifyKind } from "@/domain";
import {
  downloadGoogleDriveFile,
  type DownloadGoogleDriveFileInput,
  type GoogleDriveDownloadedFile,
} from "@/lib/google-drive/drive-client";

import { insertAsset, type InsertAssetInput } from "./persistence";

export type GoogleDriveImportResult = {
  imported: number;
  skipped: number;
  assetIds: string[];
  errors: string[];
};

export type ImportGoogleDriveFilesInput = {
  orgId: string;
  folderId: string | null;
  fileIds: string[];
  uploadedBy: string;
  accessToken: string;
  downloader?: (input: DownloadGoogleDriveFileInput) => Promise<GoogleDriveDownloadedFile>;
  insert?: (input: InsertAssetInput) => Promise<string>;
};

export async function importGoogleDriveFiles(input: ImportGoogleDriveFilesInput): Promise<GoogleDriveImportResult> {
  const uniqueFileIds = [...new Set(input.fileIds.map((id) => id.trim()).filter(Boolean))];
  const result: GoogleDriveImportResult = { imported: 0, skipped: 0, assetIds: [], errors: [] };
  const downloader = input.downloader ?? downloadGoogleDriveFile;
  const insert = input.insert ?? insertAsset;

  for (const fileId of uniqueFileIds) {
    try {
      const file = await downloader({ fileId, accessToken: input.accessToken });
      const assetId = await insert({
        orgId: input.orgId,
        folderId: input.folderId,
        fileName: file.name,
        bytes: file.bytes,
        contentType: file.mimeType,
        kind: classifyKind(file.mimeType, file.name),
        byteSize: file.size,
        source: "google_drive",
        provenance: {
          googleDriveFileId: file.fileId,
          googleDriveWebUrl: file.webViewLink,
          googleDriveModifiedTime: file.modifiedTime,
        },
        uploadedBy: input.uploadedBy,
      });
      result.imported += 1;
      result.assetIds.push(assetId);
    } catch (error) {
      result.skipped += 1;
      result.errors.push(error instanceof Error ? error.message : `Could not import ${fileId}.`);
    }
  }

  return result;
}

const FILE_ID_PATTERNS = [
  /\/(?:file|document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/g,
  /[?&]id=([a-zA-Z0-9_-]+)/g,
] as const;

const FOLDER_ID_PATTERNS = [
  /\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/g,
  /[?&]folder=([a-zA-Z0-9_-]+)/g,
] as const;

const RAW_ID_PATTERN = /^(?=.*[A-Z0-9_])[a-zA-Z0-9_-]{8,}$/;

export function parseGoogleDriveFileIds(input: string): string[] {
  const ids = new Set<string>();

  for (const pattern of FILE_ID_PATTERNS) {
    for (const match of input.matchAll(pattern)) {
      if (match[1]) ids.add(match[1]);
    }
  }

  for (const token of input.split(/\s+/)) {
    const cleaned = token.trim().replace(/[,;]+$/, "");
    if (!/^https?:\/\//i.test(cleaned) && RAW_ID_PATTERN.test(cleaned)) {
      ids.add(cleaned);
    }
  }

  return [...ids];
}

export function parseGoogleDriveFolderIds(input: string): string[] {
  const ids = new Set<string>();

  for (const pattern of FOLDER_ID_PATTERNS) {
    for (const match of input.matchAll(pattern)) {
      if (match[1]) ids.add(match[1]);
    }
  }

  for (const token of input.split(/\s+/)) {
    const cleaned = token.trim().replace(/[,;]+$/, "");
    if (!/^https?:\/\//i.test(cleaned) && RAW_ID_PATTERN.test(cleaned)) {
      ids.add(cleaned);
    }
  }

  return [...ids];
}

export type GoogleDriveDownloadedFile = {
  fileId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  webViewLink: string | null;
  modifiedTime: string | null;
  size: number;
  plainText?: string | null;
};

export type GoogleDriveFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  modifiedTime: string | null;
};

export type DownloadGoogleDriveFileInput = {
  fileId: string;
  accessToken: string;
  fetcher?: typeof fetch;
};

type DriveFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  modifiedTime?: string;
};

type DriveFileListItem = {
  id: string;
  name?: string;
  mimeType: string;
};

type DriveFileListResponse = {
  files?: DriveFileListItem[];
  nextPageToken?: string;
};

const GOOGLE_APPS_PREFIX = "application/vnd.google-apps.";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";

export type ListGoogleDriveFolderFilesInput = {
  folderIds: string[];
  accessToken: string;
  recursive?: boolean;
  maxFiles?: number;
  maxFolders?: number;
  fetcher?: typeof fetch;
};

export type GoogleDriveFolderFileList = {
  fileIds: string[];
  scannedFolders: number;
  skippedFolders: number;
  truncated: boolean;
  errors: string[];
};

export type GetGoogleDriveFileMetadataInput = {
  fileId: string;
  accessToken: string;
  fetcher?: typeof fetch;
};

function ensurePdfName(name: string): string {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

async function parseDriveJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(body || `Google Drive request failed (${response.status})`);
  }
  return JSON.parse(body) as T;
}

export async function getGoogleDriveFileMetadata({
  fileId,
  accessToken,
  fetcher = fetch,
}: GetGoogleDriveFileMetadataInput): Promise<GoogleDriveFileMetadata> {
  const metadataUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  metadataUrl.searchParams.set("fields", "id,name,mimeType,webViewLink,modifiedTime");
  metadataUrl.searchParams.set("supportsAllDrives", "true");

  const metadataResponse = await fetcher(metadataUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const metadata = await parseDriveJson<DriveFileMetadata>(metadataResponse);

  return {
    id: metadata.id,
    name: metadata.name,
    mimeType: metadata.mimeType,
    webViewLink: metadata.webViewLink ?? null,
    modifiedTime: metadata.modifiedTime ?? null,
  };
}

export async function listGoogleDriveFolderFileIds({
  folderIds,
  accessToken,
  recursive = true,
  maxFiles = 100,
  maxFolders = 25,
  fetcher = fetch,
}: ListGoogleDriveFolderFilesInput): Promise<GoogleDriveFolderFileList> {
  const queue = [...new Set(folderIds.map((id) => id.trim()).filter(Boolean))];
  const seenFolders = new Set<string>();
  const fileIds = new Set<string>();
  const errors: string[] = [];
  let scannedFolders = 0;
  let skippedFolders = 0;
  let truncated = false;

  while (queue.length > 0 && !truncated) {
    const folderId = queue.shift()!;
    if (seenFolders.has(folderId)) continue;
    if (seenFolders.size >= maxFolders) {
      skippedFolders += 1 + queue.length;
      truncated = true;
      break;
    }

    seenFolders.add(folderId);
    scannedFolders += 1;

    try {
      let pageToken: string | undefined;
      do {
        const url = new URL("https://www.googleapis.com/drive/v3/files");
        url.searchParams.set("q", `'${folderId.replace(/'/g, "\\'")}' in parents and trashed=false`);
        url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType)");
        url.searchParams.set("pageSize", "100");
        url.searchParams.set("supportsAllDrives", "true");
        url.searchParams.set("includeItemsFromAllDrives", "true");
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const response = await fetcher(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const payload = await parseDriveJson<DriveFileListResponse>(response);

        for (const file of payload.files ?? []) {
          if (file.mimeType === GOOGLE_FOLDER_MIME) {
            if (recursive && !seenFolders.has(file.id)) queue.push(file.id);
            else skippedFolders += 1;
            continue;
          }

          fileIds.add(file.id);
          if (fileIds.size >= maxFiles) {
            truncated = true;
            break;
          }
        }

        pageToken = truncated ? undefined : payload.nextPageToken;
      } while (pageToken);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Could not scan Drive folder ${folderId}.`);
    }
  }

  return { fileIds: [...fileIds], scannedFolders, skippedFolders, truncated, errors };
}

export async function downloadGoogleDriveFile({
  fileId,
  accessToken,
  fetcher = fetch,
}: DownloadGoogleDriveFileInput): Promise<GoogleDriveDownloadedFile> {
  const metadataUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  metadataUrl.searchParams.set("fields", "id,name,mimeType,size,webViewLink,modifiedTime");

  const metadataResponse = await fetcher(metadataUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const metadata = await parseDriveJson<DriveFileMetadata>(metadataResponse);

  const isGoogleWorkspaceFile = metadata.mimeType.startsWith(GOOGLE_APPS_PREFIX);
  const isGoogleDoc = metadata.mimeType === GOOGLE_DOC_MIME;
  const downloadUrl = isGoogleWorkspaceFile
    ? new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`)
    : new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  if (isGoogleWorkspaceFile) {
    downloadUrl.searchParams.set("mimeType", "application/pdf");
  } else {
    downloadUrl.searchParams.set("alt", "media");
  }

  const fileResponse = await fetcher(downloadUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!fileResponse.ok) {
    throw new Error(await fileResponse.text());
  }

  const bytes = new Uint8Array(await fileResponse.arrayBuffer());
  const mimeType = isGoogleWorkspaceFile
    ? "application/pdf"
    : (fileResponse.headers.get("content-type")?.split(";")[0] || metadata.mimeType);
  let plainText: string | null = null;
  if (isGoogleDoc) {
    const textUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`);
    textUrl.searchParams.set("mimeType", "text/plain");
    const textResponse = await fetcher(textUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (textResponse.ok) {
      plainText = (await textResponse.text()).trim() || null;
    }
  }

  return {
    fileId: metadata.id,
    name: isGoogleWorkspaceFile ? ensurePdfName(metadata.name) : metadata.name,
    mimeType,
    bytes,
    webViewLink: metadata.webViewLink ?? null,
    modifiedTime: metadata.modifiedTime ?? null,
    size: Number(metadata.size ?? bytes.byteLength),
    plainText,
  };
}

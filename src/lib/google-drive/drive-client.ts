const FILE_ID_PATTERNS = [
  /\/(?:file|document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/g,
  /[?&]id=([a-zA-Z0-9_-]+)/g,
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

export type GoogleDriveDownloadedFile = {
  fileId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  webViewLink: string | null;
  modifiedTime: string | null;
  size: number;
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

const GOOGLE_APPS_PREFIX = "application/vnd.google-apps.";

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

  return {
    fileId: metadata.id,
    name: isGoogleWorkspaceFile ? ensurePdfName(metadata.name) : metadata.name,
    mimeType,
    bytes,
    webViewLink: metadata.webViewLink ?? null,
    modifiedTime: metadata.modifiedTime ?? null,
    size: Number(metadata.size ?? bytes.byteLength),
  };
}

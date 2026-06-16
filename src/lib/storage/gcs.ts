import { Storage } from "@google-cloud/storage";

/**
 * Google Cloud Storage access for operator-uploaded reference images. The
 * browser uploads straight to the bucket via a v4 signed URL — image bytes
 * never pass through the app server. Config-guarded: without env, the feature
 * degrades gracefully (the same posture as Supabase).
 *
 * Env:
 *   GCS_BUCKET                — the bucket name.
 *   GCS_SERVICE_ACCOUNT_KEY   — the service-account JSON, base64-encoded
 *                               (single line). On *nix:  base64 -w0 key.json
 *                               In PowerShell: [Convert]::ToBase64String(
 *                                 [IO.File]::ReadAllBytes("key.json"))
 */

type ServiceAccount = { client_email: string; private_key: string; project_id?: string };

let cachedStorage: Storage | null = null;

function readCredentials(): ServiceAccount | null {
  const raw = process.env.GCS_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Partial<ServiceAccount>;
    if (typeof json.client_email === "string" && typeof json.private_key === "string") {
      return { client_email: json.client_email, private_key: json.private_key, project_id: json.project_id };
    }
    return null;
  } catch {
    return null;
  }
}

export function isGcsConfigured(): boolean {
  return Boolean(process.env.GCS_BUCKET?.trim() && readCredentials());
}

function getBucketName(): string {
  const bucket = process.env.GCS_BUCKET?.trim();
  if (!bucket) throw new Error("GCS_BUCKET is not set");
  return bucket;
}

function getStorage(): Storage {
  if (cachedStorage) return cachedStorage;
  const creds = readCredentials();
  if (!creds) throw new Error("GCS service account is not configured");
  cachedStorage = new Storage({
    projectId: creds.project_id,
    credentials: { client_email: creds.client_email, private_key: creds.private_key },
  });
  return cachedStorage;
}

/** A v4 signed PUT URL the browser uses to upload one object directly. */
export async function createSignedUploadUrl(
  objectPath: string,
  contentType: string,
): Promise<{ uploadUrl: string; objectPath: string }> {
  const [uploadUrl] = await getStorage()
    .bucket(getBucketName())
    .file(objectPath)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 10 * 60 * 1000,
      contentType,
    });
  return { uploadUrl, objectPath };
}

/** A v4 signed GET URL to read an uploaded object (display / hand to Arc). */
export async function createSignedReadUrl(objectPath: string, ttlMs = 60 * 60 * 1000): Promise<string> {
  const [url] = await getStorage()
    .bucket(getBucketName())
    .file(objectPath)
    .getSignedUrl({ version: "v4", action: "read", expires: Date.now() + ttlMs });
  return url;
}

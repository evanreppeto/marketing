/** Pure media-library helpers. No I/O — unit-tested in domain/__tests__. */

export type MediaKind = "image" | "video" | "logo" | "document";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const DOC_TYPES = ["application/pdf"];

export function classifyKind(contentType: string, fileName: string): MediaKind {
  if (contentType === "image/svg+xml" || fileName.toLowerCase().endsWith(".svg")) return "logo";
  if (IMAGE_TYPES.includes(contentType)) return "image";
  if (VIDEO_TYPES.includes(contentType)) return "video";
  if (DOC_TYPES.includes(contentType)) return "document";
  return "document";
}

export type UploadCheck = { contentType: string; byteSize: number };
export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateUpload({ contentType, byteSize }: UploadCheck): ValidationResult {
  const allowed = [...IMAGE_TYPES, ...VIDEO_TYPES, ...DOC_TYPES, "image/svg+xml"];
  if (!allowed.includes(contentType)) return { ok: false, reason: `Unsupported file type: ${contentType}` };
  if (byteSize > MAX_UPLOAD_BYTES) return { ok: false, reason: "File exceeds the 50 MB limit." };
  return { ok: true };
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  const kb = bytes / 1_000;
  if (kb < 1_000) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1_000;
  if (mb < 1_000) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1_000;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}

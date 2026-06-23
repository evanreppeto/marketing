/** Single source of truth for which uploads Arc accepts + how to treat them.
 *  Claude (the runner's model) natively reads images, PDFs, and plain text. */
export const ACCEPTED_ATTACHMENT_MIME = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
] as const;

const ACCEPTED = new Set<string>(ACCEPTED_ATTACHMENT_MIME);

export function isAcceptedAttachment(contentType: string): boolean {
  return ACCEPTED.has(contentType);
}

export type AttachmentKind = "image" | "pdf" | "text" | "other";

export function attachmentKind(contentType: string): AttachmentKind {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("text/")) return "text";
  return "other";
}

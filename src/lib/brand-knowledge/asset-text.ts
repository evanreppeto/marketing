const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/x-markdown", "text/csv"]);

export function isTextLikeContentType(contentType: string | null | undefined): boolean {
  return Boolean(contentType && TEXT_TYPES.has(contentType));
}

function clean(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Turn uploaded bytes into plain text for the brand-knowledge pipeline.
 * - text/markdown/csv  -> UTF-8 decode (zero dependencies)
 * - .docx              -> mammoth raw-text extraction (server-only, dynamic import)
 * - pdf / images       -> null; Gemini reads these natively from the inline bytes
 * Never throws: on any failure it returns null so the upload still proceeds.
 */
export async function extractAssetText(input: {
  bytes: Uint8Array;
  contentType: string | null | undefined;
  fileName: string;
}): Promise<string | null> {
  try {
    if (isTextLikeContentType(input.contentType)) {
      return clean(new TextDecoder("utf-8").decode(input.bytes));
    }
    if (input.contentType === DOCX_TYPE || input.fileName.toLowerCase().endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) });
      return clean(result.value ?? "");
    }
    return null;
  } catch {
    return null;
  }
}

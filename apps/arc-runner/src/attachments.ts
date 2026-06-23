import type { ArcAttachment } from "./types";

/**
 * Anthropic content block types.
 *
 * @anthropic-ai/sdk is not a direct dependency of the runner (only
 * @anthropic-ai/claude-agent-sdk is installed). These types mirror the
 * Anthropic API's content-block shapes verbatim so the runner stays
 * self-contained without a version-pinned duplicate SDK install.
 *
 * Verified against the Anthropic Messages API spec:
 *   - TextBlockParam:     { type: "text"; text: string }
 *   - ImageBlockParam:    { type: "image"; source: URLImageSource }
 *   - DocumentBlockParam: { type: "document"; source: URLPDFSource; title?: string }
 *   - URLImageSource:     { type: "url"; url: string }
 *   - URLPDFSource:       { type: "url"; url: string }
 */
type URLImageSource = { type: "url"; url: string };
type URLPDFSource = { type: "url"; url: string };

type TextBlockParam = { type: "text"; text: string };
type ImageBlockParam = { type: "image"; source: URLImageSource };
type DocumentBlockParam = { type: "document"; source: URLPDFSource; title?: string };

type ContentBlocks = Array<TextBlockParam | ImageBlockParam | DocumentBlockParam>;

/**
 * Build the model input for a turn. With no attachments we return the plain
 * prompt string (unchanged behavior). With attachments we return Anthropic
 * content blocks — text first, then a url image/document block per supported
 * file — so Arc actually sees what the operator uploaded. GCS signed read URLs
 * are fetched server-side by the API; unsupported types are dropped (the UI
 * already blocks them, this is defense-in-depth).
 */
export function buildTurnContent(
  text: string,
  attachments: ArcAttachment[] | undefined,
): string | ContentBlocks {
  const usable = (attachments ?? []).filter(
    (a) => a.contentType.startsWith("image/") || a.contentType === "application/pdf",
  );
  if (usable.length === 0) return text;

  const blocks: ContentBlocks = [{ type: "text", text }];
  for (const a of usable) {
    if (a.contentType.startsWith("image/")) {
      blocks.push({ type: "image", source: { type: "url", url: a.url } });
    } else {
      blocks.push({ type: "document", source: { type: "url", url: a.url }, title: a.name });
    }
  }
  return blocks;
}

const TEXT_CAP = 50_000;

/** Fetch text/* attachments and return them as text content blocks (capped). */
export async function inlineTextAttachments(
  attachments: ArcAttachment[],
  fetchImpl: typeof fetch = fetch,
): Promise<ContentBlocks> {
  const out: ContentBlocks = [];
  for (const a of attachments) {
    if (!a.contentType.startsWith("text/")) continue;
    try {
      const res = await fetchImpl(a.url);
      if (!res.ok) continue;
      const body = (await res.text()).slice(0, TEXT_CAP);
      out.push({ type: "text", text: `Attached file ${a.name}:\n\n${body}` });
    } catch {
      // ignore unreadable attachment; UI already confirmed the upload
    }
  }
  return out;
}

/** Async variant of buildTurnContent that also inlines text files. */
export async function buildTurnContentAsync(
  text: string,
  attachments: ArcAttachment[] | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string | ContentBlocks> {
  const list = attachments ?? [];
  const base = buildTurnContent(text, list);
  const textBlocks = await inlineTextAttachments(list, fetchImpl);
  if (typeof base === "string") {
    return textBlocks.length > 0 ? [{ type: "text", text }, ...textBlocks] : text;
  }
  return [...base, ...textBlocks];
}

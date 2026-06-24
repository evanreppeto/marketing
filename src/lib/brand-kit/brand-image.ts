import { classifyKind } from "@/domain";
import { insertAssetWithUrl } from "@/lib/media-library/persistence";

import { fetchPublicImage } from "./design-fetch";

/**
 * Download a public image (SSRF-guarded) and store it as a Library asset, returning
 * the hosted URL — or null if the fetch/store fails. Shared by the operator's
 * apply-design action and Arc's propose-brand-profile route so brand logos/favicons
 * are always hosted, never hotlinked.
 */
export async function storeBrandImageFromUrl(args: {
  orgId: string;
  url: string;
  role: "logo" | "favicon";
  sourceUrl: string;
  uploadedBy: string;
}): Promise<string | null> {
  const image = await fetchPublicImage(args.url);
  if (!image.ok) return null;
  const host = (() => {
    try {
      return new URL(args.sourceUrl || args.url).hostname.replace(/^www\./, "");
    } catch {
      return args.role;
    }
  })();
  const safeName = host.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || args.role;
  const ext = image.contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const fileName = `${args.role}-${safeName}.${ext}`;
  const result = await insertAssetWithUrl({
    orgId: args.orgId,
    folderId: null,
    fileName,
    bytes: image.bytes,
    contentType: image.contentType,
    kind: classifyKind(image.contentType, fileName),
    byteSize: image.bytes.byteLength,
    source: "url",
    provenance: { brandRole: args.role, sourceUrl: args.sourceUrl },
    uploadedBy: args.uploadedBy,
  });
  return result.url;
}

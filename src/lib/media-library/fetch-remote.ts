import { lookup as dnsLookup } from "node:dns/promises";

import { acceptUpload, MAX_UPLOAD_BYTES } from "./upload-policy";

/**
 * Fetch remote media for ingest (the URL-import path and the public media API).
 * The URL is caller-supplied, so this is a server-side request forgery surface:
 * https only, the hostname must not resolve to loopback / private / link-local
 * address space, and the body is capped at the shared upload limit. DNS is
 * checked at fetch time; redirects are followed by fetch itself, so the final
 * response is all we trust for content type.
 */

export type FetchRemoteMediaResult =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; error: string };

type Deps = {
  fetcher?: typeof fetch;
  lookup?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
};

function isPrivateAddress(address: string, family: number): boolean {
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice("::ffff:".length), 4); // v4-mapped
    return false;
  }
  const octets = address.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = octets as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export async function fetchRemoteMedia(
  input: { url: string; fileName: string; contentTypeOverride?: string | null },
  deps: Deps = {},
): Promise<FetchRemoteMediaResult> {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { ok: false, error: "That is not a valid URL." };
  }
  if (parsed.protocol !== "https:") return { ok: false, error: "Only https:// URLs can be imported." };

  const lookup =
    deps.lookup ?? (async (hostname: string) => (await dnsLookup(hostname, { all: true })).map((r) => ({ address: r.address, family: r.family })));
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(parsed.hostname);
  } catch {
    return { ok: false, error: "That host could not be resolved." };
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address, entry.family))) {
    return { ok: false, error: "That host is not reachable from here." };
  }

  const fetcher = deps.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(parsed.toString(), { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  } catch {
    return { ok: false, error: "The file could not be downloaded." };
  }
  if (!response.ok) return { ok: false, error: `The source responded ${response.status}.` };

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_UPLOAD_BYTES) return { ok: false, error: "File is too large — keep it under 50MB." };

  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength === 0) return { ok: false, error: "The source returned an empty file." };
  if (buffer.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: "File is too large — keep it under 50MB." };

  const headerType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
  const accepted = acceptUpload(input.fileName, input.contentTypeOverride?.trim() || headerType);
  if (!accepted.ok) {
    return { ok: false, error: "Unsupported file type — use an image, MP4/MOV/WEBM video, PDF, or a .docx/.md/.csv/.txt document." };
  }
  return { ok: true, bytes: buffer, contentType: accepted.contentType };
}

import { NextResponse } from "next/server";

import { classifyKind, parseMediaIngestPayload } from "@/domain";
import { TOKEN_SCOPE_MEDIA_INGEST } from "@/lib/agent/tokens";
import { checkWorkspaceBearer } from "@/lib/auth/api-token";
import { getCurrentOrgId } from "@/lib/auth/org";
import { fetchRemoteMedia } from "@/lib/media-library/fetch-remote";
import { scanMediaIngest } from "@/lib/media-library/ingest-intelligence";
import { insertAssetWithUrl } from "@/lib/media-library/persistence";
import { acceptUpload, MAX_UPLOAD_BYTES } from "@/lib/media-library/upload-policy";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Public media ingest — the universal "bring your own tools" on-ramp. Any
 * external tool, script, or automation pushes finished creative here (a
 * Higgsfield render, a Gemini image, a photographer's export) and it lands in
 * the Library exactly like an operator upload: org-scoped, provenance-tagged
 * (external lineage recorded when declared, honest "unverified" flags when
 * not), risk-scanned at ingest, and HELD FOR REVIEW — `availableToArc`
 * defaults to false and nothing here can reach the outside world.
 *
 *   POST /api/v1/media   Authorization: Bearer <MEDIA_INGEST_API_TOKEN or workspace token with media:ingest>
 *   { fileName, sourceUrl | contentBase64, contentType?, folderId?, tags?,
 *     availableToArc?, provenance?: { tool, model, prompt, jobId, sourceUrl } }
 *
 * Status codes mirror the lead-ingest contract: 400 validation, 202 accepted
 * without persistence (Supabase unconfigured — dev/contract mode), 201 stored,
 * 502 fetch/persist failure.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const persistenceConfigured = isSupabaseAdminConfigured();
  const auth = await checkWorkspaceBearer(request, "MEDIA_INGEST_API_TOKEN", {
    required: persistenceConfigured,
    scope: TOKEN_SCOPE_MEDIA_INGEST,
  });
  if (!auth.ok) {
    const notConfigured = auth.reason === "not_configured";
    return NextResponse.json(
      {
        ok: false,
        status: notConfigured ? "not_configured" : "unauthorized",
        errors: [
          {
            code: notConfigured ? "not_configured" : "unauthorized",
            message: notConfigured
              ? "Set MEDIA_INGEST_API_TOKEN (or issue a workspace token with media:ingest) before pushing media."
              : "Media ingest requires a valid bearer token.",
          },
        ],
      },
      { status: auth.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, status: "invalid", errors: [{ code: "invalid_json", message: "Body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const parsed = parseMediaIngestPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, status: "invalid", errors: parsed.errors }, { status: 400 });
  }
  const payload = parsed.value;

  // Resolve the bytes. Base64 is decoded and size/type-checked against the same
  // policy as browser uploads; URLs go through the SSRF-guarded fetcher.
  let bytes: Uint8Array;
  let contentType: string;
  if (payload.contentBase64) {
    let decoded: Buffer;
    try {
      decoded = Buffer.from(payload.contentBase64, "base64");
    } catch {
      decoded = Buffer.alloc(0);
    }
    if (decoded.byteLength === 0) {
      return NextResponse.json(
        { ok: false, status: "invalid", errors: [{ code: "content_invalid", message: "contentBase64 did not decode to a file." }] },
        { status: 400 },
      );
    }
    if (decoded.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, status: "invalid", errors: [{ code: "content_too_large", message: "File is too large — keep it under 50MB." }] },
        { status: 400 },
      );
    }
    const accepted = acceptUpload(payload.fileName, payload.contentType ?? "");
    if (!accepted.ok) {
      return NextResponse.json(
        { ok: false, status: "invalid", errors: [{ code: "unsupported_type", message: "Unsupported file type for the library." }] },
        { status: 400 },
      );
    }
    bytes = new Uint8Array(decoded);
    contentType = accepted.contentType;
  } else {
    const fetched = await fetchRemoteMedia({
      url: payload.sourceUrl!,
      fileName: payload.fileName,
      contentTypeOverride: payload.contentType,
    });
    if (!fetched.ok) {
      return NextResponse.json(
        { ok: false, status: "fetch_failed", errors: [{ code: "fetch_failed", message: fetched.error }] },
        { status: 502 },
      );
    }
    bytes = fetched.bytes;
    contentType = fetched.contentType;
  }

  const kind = classifyKind(contentType, payload.fileName);
  const scan = scanMediaIngest({ fileName: payload.fileName, kind, provenance: payload.provenance });
  const tags = [...new Set([...scan.tags, ...payload.tags])];

  if (!persistenceConfigured) {
    // Contract mode: everything validated and scanned, nothing written.
    return NextResponse.json(
      { ok: true, status: "accepted", persistence: { status: "not_configured" }, scan: { riskFlags: scan.riskFlags, tags } },
      { status: 202 },
    );
  }

  try {
    const orgId = auth.orgId ?? (await getCurrentOrgId());
    const { id, url } = await insertAssetWithUrl({
      orgId,
      folderId: payload.folderId,
      fileName: payload.fileName,
      bytes,
      contentType,
      kind,
      byteSize: bytes.byteLength,
      // "external" is the schema-allowed value for pushes from outside tools
      // (media_assets_source_check); the API's own identity lives in provenance.
      source: "external",
      provenance: {
        origin: "api_import",
        ...(payload.sourceUrl ? { fetchedFrom: payload.sourceUrl } : {}),
        ...payload.provenance,
      },
      riskFlags: scan.riskFlags,
      tags,
      availableToArc: payload.availableToArc,
      uploadedBy: payload.provenance.tool ? `api:${payload.provenance.tool}` : "api",
    });
    return NextResponse.json(
      {
        ok: true,
        status: "stored",
        asset: { id, url, kind, contentType, byteSize: bytes.byteLength, riskFlags: scan.riskFlags, tags, availableToArc: payload.availableToArc },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "persistence_failed",
        errors: [{ code: "persistence_failed", message: error instanceof Error ? error.message : "The asset could not be stored." }],
      },
      { status: 502 },
    );
  }
}

import { INVALID_JSON, arcGuard, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { isWebSearchConfigured, searchWeb } from "@/lib/web-search/provider";

const DEFAULT_RESULTS = 5;
const MAX_RESULTS = 10;

/**
 * Arc web search, mediated by the app. Returns normalized results; never
 * contacts anyone. not_configured when WEB_SEARCH_API_KEY is unset.
 *
 *   POST /api/v1/arc/web/search  { query, max_results? }
 *   -> 200 { ok, results: [{ title, url, snippet }] }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  if (!isWebSearchConfigured()) {
    return fail("not_configured", "Web search is not configured (set WEB_SEARCH_API_KEY).", 503);
  }

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }
  const payload = body as Record<string, unknown>;
  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (!query) return fail("invalid_request", 'Field "query" is required.', 400);

  const requested = typeof payload.max_results === "number" ? Math.floor(payload.max_results) : DEFAULT_RESULTS;
  const maxResults = Math.max(1, Math.min(MAX_RESULTS, requested));

  try {
    const results = await searchWeb(query, maxResults);
    return ok({ results });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Web search failed.", 502);
  }
}

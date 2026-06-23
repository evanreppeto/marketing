import { INVALID_JSON, arcGuard, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { searchWebWithGemini } from "@/lib/research/gemini-web-search";

export const runtime = "nodejs";

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength).trim() : "";
}

/**
 * Read-only external research for Arc. Uses Gemini Grounding with Google Search
 * and returns citations; it does not create leads, opportunities, or outbound work.
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return fail("not_configured", "Gemini web search isn't enabled (needs GEMINI_API_KEY).", 503);
  }

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }

  const body = payload as Record<string, unknown>;
  const query = cleanText(body.query, 1000);
  const context = cleanText(body.context, 4000) || undefined;
  if (!query) return fail("rejected", "query is required.", 400);

  try {
    const research = await searchWebWithGemini({
      query,
      context,
      apiKey,
      model: process.env.GEMINI_WEB_SEARCH_MODEL?.trim() || undefined,
    });
    return ok({ research });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Gemini web search failed.", 502);
  }
}

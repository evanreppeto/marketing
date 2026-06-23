/**
 * Web search for Arc, mediated by the app (secret stays server-side, the app
 * meters + logs). Default provider: Tavily (agent-oriented search). Degrades
 * gracefully — with no key configured, isWebSearchConfigured() is false and the
 * routes return not_configured (same pattern as Supabase).
 */

export type WebSearchResult = { title: string; url: string; snippet: string };

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

export function isWebSearchConfigured(): boolean {
  return Boolean(process.env.WEB_SEARCH_API_KEY?.trim());
}

/** Pure: normalize a Tavily response body to WebSearchResult[]. */
export function normalizeTavilyResults(body: unknown): WebSearchResult[] {
  const results =
    typeof body === "object" && body !== null && Array.isArray((body as { results?: unknown }).results)
      ? ((body as { results: unknown[] }).results)
      : [];
  return results.map((r) => {
    const row = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    return {
      title: typeof row.title === "string" ? row.title : "",
      url: typeof row.url === "string" ? row.url : "",
      snippet: typeof row.content === "string" ? row.content : "",
    };
  });
}

/**
 * Run a web search. Throws on misconfiguration or provider error (the route maps
 * those to not_configured / 502). maxResults is clamped 1..10 by the caller.
 */
export async function searchWeb(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const apiKey = process.env.WEB_SEARCH_API_KEY?.trim();
  if (!apiKey) throw new Error("Web search is not configured.");

  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: "basic",
    }),
  });
  if (!res.ok) {
    throw new Error(`Search provider returned ${res.status}.`);
  }
  const body = await res.json().catch(() => ({}));
  return normalizeTavilyResults(body);
}

# Arc Web Access + Discovery → Propose (Phase 2a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Arc app-mediated web access (search + read pages) so it can find information and prospect for net-new leads, with discovered leads landing as `proposed` for a human Confirm/Dismiss gate.

**Architecture:** Mirror the existing `analyze_website` tool: the app owns the external calls (provider secret server-side, SSRF guard, metering); the runner gets thin delegating tools. New app routes `/api/v1/arc/web/search` (Tavily provider) + `/api/v1/arc/web/fetch` (reuses the SSRF-guarded fetch already in the brand route). Runner tools `web_search`/`web_fetch` in read-tools. Prompt teaches the search→read→`create_lead`(proposed)→cite loop. A human-only Confirm/Dismiss action on proposed leads closes the gate.

**Tech Stack:** Next.js 16 route handlers, Tavily search API, Node `fetch` + `node:dns`, Zod, `@anthropic-ai/claude-agent-sdk` (runner), Vitest, pnpm. Builds on PR #194 (`create_lead`, `origin`/`review_status`).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/web-search/provider.ts` | **Create.** `isWebSearchConfigured()`, `searchWeb()`, pure `normalizeTavilyResults()`, `WebSearchResult` type. |
| `src/lib/web-search/__tests__/provider.test.ts` | **Create.** Unit-test the pure normalizer + config gate. |
| `src/lib/web-fetch/fetch-public-page.ts` | **Create.** Shared SSRF-guarded fetch+extract (lifted from the brand route). `fetchPublicPage()` + pure `isPrivateAddress()`. |
| `src/lib/web-fetch/__tests__/fetch-public-page.test.ts` | **Create.** Unit-test the `isPrivateAddress` classifier. |
| `src/app/api/v1/arc/brand/analyze-website/route.ts` | **Modify.** Refactor to call the shared `fetchPublicPage` (DRY; one SSRF source of truth). |
| `src/app/api/v1/arc/web/search/route.ts` | **Create.** `POST` — Arc web search. |
| `src/app/api/v1/arc/web/fetch/route.ts` | **Create.** `POST` — Arc page fetch. |
| `apps/arc-runner/src/tools/web.ts` | **Create.** `web_search` + `web_fetch` runner tools. |
| `apps/arc-runner/src/tools/index.ts` | **Modify.** Register web tools in `readTools`. |
| `apps/arc-runner/src/prompt.ts` | **Modify.** Add web + prospecting protocol. |
| `src/app/crm/actions.ts` | **Modify.** Add `setLeadReviewStatusAction` (Confirm/Dismiss). |
| `src/app/crm/_components/crm-record-page.tsx` + `crm-record-detail.tsx` | **Modify.** Proposed-lead review banner. |
| `src/lib/crm/read-model.ts` | **Modify.** Add `review_status` to the lead record (select + type). |
| `.env.example` | **Modify.** Document `WEB_SEARCH_API_KEY` + `WEB_SEARCH_PROVIDER`. |

---

## Task 1: Web search provider module

**Files:**
- Create: `src/lib/web-search/provider.ts`
- Test: `src/lib/web-search/__tests__/provider.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/web-search/__tests__/provider.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { isWebSearchConfigured, normalizeTavilyResults } from "../provider";

describe("normalizeTavilyResults", () => {
  it("maps tavily results to {title, url, snippet}", () => {
    const out = normalizeTavilyResults({
      results: [
        { title: "Joe Plumbing", url: "https://joe.example", content: "Chicago plumber", score: 0.9 },
        { title: "Acme HVAC", url: "https://acme.example", content: "heating", score: 0.5 },
      ],
    });
    expect(out).toEqual([
      { title: "Joe Plumbing", url: "https://joe.example", snippet: "Chicago plumber" },
      { title: "Acme HVAC", url: "https://acme.example", snippet: "heating" },
    ]);
  });

  it("tolerates missing/extra fields and a missing results array", () => {
    expect(normalizeTavilyResults({})).toEqual([]);
    expect(normalizeTavilyResults({ results: [{ url: "https://x.example" }] })).toEqual([
      { title: "", url: "https://x.example", snippet: "" },
    ]);
  });
});

describe("isWebSearchConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("is false without a key, true with one", () => {
    vi.stubEnv("WEB_SEARCH_API_KEY", "");
    expect(isWebSearchConfigured()).toBe(false);
    vi.stubEnv("WEB_SEARCH_API_KEY", "tvly-abc");
    expect(isWebSearchConfigured()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `pnpm test src/lib/web-search/__tests__/provider.test.ts`
Expected: FAIL — cannot find module '../provider'.

- [ ] **Step 3: Implement `src/lib/web-search/provider.ts`**

```typescript
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
```

- [ ] **Step 4: Run the test, verify it PASSES**

Run: `pnpm test src/lib/web-search/__tests__/provider.test.ts`
Expected: PASS (4 assertions across 3 tests).

- [ ] **Step 5: Document the env vars** — append to `.env.example`:

```
# Web search for Arc (Tavily by default). Leave unset to disable Arc web access
# (tools return not_configured). Get a key at https://tavily.com.
WEB_SEARCH_API_KEY=
WEB_SEARCH_PROVIDER=tavily
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` → PASS.
```bash
git add src/lib/web-search/provider.ts src/lib/web-search/__tests__/provider.test.ts .env.example
git commit -m "feat(web-search): app-mediated Tavily search provider (graceful not_configured)"
```

---

## Task 2: Shared SSRF-guarded page fetch

Lift the SSRF fetch loop out of the brand route into a reusable helper so `/web/fetch` and `analyze-website` share one hardened implementation.

**Files:**
- Create: `src/lib/web-fetch/fetch-public-page.ts`
- Test: `src/lib/web-fetch/__tests__/fetch-public-page.test.ts`
- Modify: `src/app/api/v1/arc/brand/analyze-website/route.ts`

- [ ] **Step 1: Write the failing test for the IP classifier**

```typescript
// src/lib/web-fetch/__tests__/fetch-public-page.test.ts
import { describe, expect, it } from "vitest";

import { isPrivateAddress } from "../fetch-public-page";

describe("isPrivateAddress", () => {
  it("rejects loopback, private, link-local, and metadata IPv4", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "0.0.0.0"]) {
      expect(isPrivateAddress(ip, 4)).toBe(true);
    }
  });
  it("rejects IPv6 loopback + unique/link-local", () => {
    expect(isPrivateAddress("::1", 6)).toBe(true);
    expect(isPrivateAddress("fe80::1", 6)).toBe(true);
    expect(isPrivateAddress("fd00::1", 6)).toBe(true);
  });
  it("allows public addresses", () => {
    expect(isPrivateAddress("8.8.8.8", 4)).toBe(false);
    expect(isPrivateAddress("172.32.0.1", 4)).toBe(false);
    expect(isPrivateAddress("2606:4700::1111", 6)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `pnpm test src/lib/web-fetch/__tests__/fetch-public-page.test.ts`
Expected: FAIL — cannot find module '../fetch-public-page'.

- [ ] **Step 3: Implement `src/lib/web-fetch/fetch-public-page.ts`**

This lifts the exact logic currently inline in `analyze-website/route.ts` (the `isPrivateAddress` fn + the redirect-revalidating fetch loop) and reuses `assertPublicHttpUrl` + `extractBrandSignal` from `@/lib/brand-kit/website`.

```typescript
import { lookup } from "node:dns/promises";

import { assertPublicHttpUrl, extractBrandSignal, type BrandSignal } from "@/lib/brand-kit/website";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 2;

/** True for private/loopback/link-local/metadata addresses. Pure. */
export function isPrivateAddress(address: string, family: number): boolean {
  if (family === 6) {
    const a = address.toLowerCase();
    return a === "::1" || a.startsWith("fe80") || a.startsWith("fc") || a.startsWith("fd");
  }
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  const [a, b] = p;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export type FetchedPage = { url: string; signal: BrandSignal };

export type FetchPublicPageResult =
  | { ok: true; page: FetchedPage }
  | { ok: false; status: number; message: string };

async function resolvedIsPrivate(hostname: string): Promise<boolean> {
  try {
    const r = await lookup(hostname);
    return isPrivateAddress(r.address, r.family);
  } catch {
    return false; // lookup unavailable — best effort, allow
  }
}

/**
 * Fetch a PUBLIC http(s) page with SSRF protection: literal + DNS-resolved
 * private/loopback hosts rejected, redirects re-validated each hop, 5s timeout,
 * 1MB cap. Returns the extracted readable signal. Never throws for expected
 * failures — returns { ok:false, status, message } (status is an HTTP-ish code).
 */
export async function fetchPublicPage(urlRaw: string): Promise<FetchPublicPageResult> {
  let url: URL;
  try {
    url = assertPublicHttpUrl(urlRaw);
  } catch (error) {
    return { ok: false, status: 400, message: error instanceof Error ? error.message : "Unsafe URL." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      let safe: URL;
      try {
        safe = assertPublicHttpUrl(current.toString());
      } catch (error) {
        return { ok: false, status: 400, message: error instanceof Error ? error.message : "Unsafe redirect target." };
      }
      if (await resolvedIsPrivate(safe.hostname)) {
        return { ok: false, status: 400, message: "Refusing to fetch a private/loopback address." };
      }

      const res = await fetch(safe, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "ArcBot/1.0" },
      });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= MAX_REDIRECTS) return { ok: false, status: 502, message: "Too many redirects." };
        try {
          current = new URL(location, safe);
        } catch {
          return { ok: false, status: 502, message: "Invalid redirect location." };
        }
        continue;
      }

      if (!res.ok) return { ok: false, status: 502, message: `Site returned ${res.status}.` };
      const raw = await res.text();
      const signal = extractBrandSignal(raw.slice(0, MAX_BYTES), safe.toString());
      return { ok: true, page: { url: safe.toString(), signal } };
    }
  } catch (error) {
    return { ok: false, status: 502, message: error instanceof Error ? error.message : "Failed to fetch the page." };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run the test, verify it PASSES**

Run: `pnpm test src/lib/web-fetch/__tests__/fetch-public-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `analyze-website/route.ts` to use the helper**

Replace the entire body of `src/app/api/v1/arc/brand/analyze-website/route.ts` with this thin version (preserves the exact same response shape `{ title, description, faviconUrl, text }`):

```typescript
import { INVALID_JSON, arcGuard, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { fetchPublicPage } from "@/lib/web-fetch/fetch-public-page";

export const runtime = "nodejs"; // needs node:dns + fetch with redirect control

/**
 * Fetch a public website and extract brand signal (title, description, favicon,
 * readable text) for Arc to reason over. SSRF guard + extraction live in
 * fetchPublicPage. No LLM here — Arc structures the result.
 *
 *   POST /api/v1/arc/brand/analyze-website  { url }
 *   -> 200 { ok, title, description, faviconUrl, text }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const urlRaw =
    typeof (payload as Record<string, unknown>).url === "string"
      ? ((payload as Record<string, unknown>).url as string).trim()
      : "";
  if (!urlRaw) return fail("rejected", "url is required.", 400);

  const result = await fetchPublicPage(urlRaw);
  if (!result.ok) {
    return fail(result.status === 400 ? "rejected" : "failed", result.message, result.status);
  }
  const { signal } = result.page;
  return ok({ title: signal.title, description: signal.description, faviconUrl: signal.faviconUrl, text: signal.text });
}
```

- [ ] **Step 6: Verify the brand route still works + typecheck**

Run: `pnpm test 2>&1 | tail -5` (confirm no existing brand/website tests regressed) and `pnpm exec tsc --noEmit` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/web-fetch/ src/app/api/v1/arc/brand/analyze-website/route.ts
git commit -m "refactor(web-fetch): shared SSRF-guarded fetchPublicPage; reuse in analyze-website"
```

---

## Task 3: `POST /api/v1/arc/web/search`

**Files:**
- Create: `src/app/api/v1/arc/web/search/route.ts`

- [ ] **Step 1: Write the handler**

```typescript
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
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` → PASS.
```bash
git add src/app/api/v1/arc/web/search/route.ts
git commit -m "feat(arc-api): POST /api/v1/arc/web/search"
```

---

## Task 4: `POST /api/v1/arc/web/fetch`

**Files:**
- Create: `src/app/api/v1/arc/web/fetch/route.ts`

- [ ] **Step 1: Write the handler**

```typescript
import { INVALID_JSON, arcGuard, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { fetchPublicPage } from "@/lib/web-fetch/fetch-public-page";

export const runtime = "nodejs"; // needs node:dns + fetch with redirect control

/**
 * Arc reads a public web page (SSRF-guarded). Returns readable text + title for
 * Arc to reason over / extract from. Internal only — no outbound side effects.
 *
 *   POST /api/v1/arc/web/fetch  { url }
 *   -> 200 { ok, url, title, text }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }
  const urlRaw = typeof (body as Record<string, unknown>).url === "string"
    ? ((body as Record<string, unknown>).url as string).trim()
    : "";
  if (!urlRaw) return fail("invalid_request", 'Field "url" is required.', 400);

  const result = await fetchPublicPage(urlRaw);
  if (!result.ok) {
    return fail(result.status === 400 ? "invalid_request" : "failed", result.message, result.status);
  }
  const { url, signal } = result.page;
  return ok({ url, title: signal.title, text: signal.text });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` → PASS.
```bash
git add src/app/api/v1/arc/web/fetch/route.ts
git commit -m "feat(arc-api): POST /api/v1/arc/web/fetch (SSRF-guarded)"
```

---

## Task 5: Runner tools `web_search` + `web_fetch`

**Files:**
- Create: `apps/arc-runner/src/tools/web.ts`
- Modify: `apps/arc-runner/src/tools/index.ts`

- [ ] **Step 1: Write the tool module** (mirrors `tools/brand.ts` `analyze_website`)

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Web access for Arc, available in every mode (reading the web is not a
 * mutation). Both delegate to app routes that own the secret + SSRF guard. If
 * web access isn't configured the route returns not_configured and Arc says so.
 */
export function webTools(client: ArcClient, step: StepFn) {
  const webSearch = tool(
    "web_search",
    "Search the public web for current information (businesses, prices, news, competitors). Returns title/url/snippet results. Use to find prospects or ground a decision, then cite_sources what you used. To turn a found business into a lead, call create_lead with review_status:'proposed'.",
    {
      query: z.string().describe("The search query"),
      max_results: z.number().optional().describe("1-10, default 5"),
    },
    async (args) =>
      runTool(step, `Searching the web: ${args.query}`, async () =>
        client.apiPost("/api/v1/arc/web/search", { query: args.query, max_results: args.max_results }),
      ),
  );

  const webFetch = tool(
    "web_fetch",
    "Read a public web page (http/https) and get its readable text + title. Use to read a promising search result or directory listing and extract details (business name, phone, address). Internal only — never contacts anyone.",
    { url: z.string().describe("The page URL (http or https)") },
    async (args) =>
      runTool(step, "Reading a web page", async () =>
        client.apiPost("/api/v1/arc/web/fetch", { url: args.url }),
      ),
  );

  return [webSearch, webFetch];
}
```

- [ ] **Step 2: Register in `apps/arc-runner/src/tools/index.ts`**

Add the import alongside the others (e.g. after the `crmReadTools` import):
```typescript
import { webTools } from "./web";
```

Add web tools to `readTools` (available in every mode). Change the `readTools` return array to include `...webTools(client, step)` — add it after `...crmReadTools(client, step),`:
```typescript
function readTools(client: ArcClient, step: StepFn, sink: TurnSink) {
  return [
    ...crmReadTools(client, step),
    ...webTools(client, step),
    ...brainReadTools(client, step),
    ...campaignReadTools(client, step),
    ...performanceReadTools(client, step),
    ...intelligenceTools(client, step),
    ...libraryReadTools(client, step),
    emitCardTool(sink.card),
    suggestFollowupsTool(sink.suggestion),
    citeSourcesTool(sink.source),
    askOperatorTool(sink.question),
  ];
}
```

- [ ] **Step 3: Typecheck the runner + commit**

Run: `cd apps/arc-runner && pnpm exec tsc --noEmit` → PASS. (`mcp__arc__web_search`/`mcp__arc__web_fetch` now appear in every mode's allowlist.)
```bash
git add apps/arc-runner/src/tools/web.ts apps/arc-runner/src/tools/index.ts
git commit -m "feat(arc-runner): web_search + web_fetch tools (all modes)"
```

---

## Task 6: Prompt — web + prospecting protocol

**Files:**
- Modify: `apps/arc-runner/src/prompt.ts`

- [ ] **Step 1: Add a paragraph after the existing "Tools:" paragraph** (the one rewritten in PR #194 that ends "Your available tools depend on the current mode."). Insert this as a new paragraph immediately after it:

```
Web: you can reach the internet with web_search (find businesses, prices, news, competitor and local info) and web_fetch (read a public page's text). You are not limited to data already in the app — use the web to find information and net-new prospects, and always cite_sources the pages you used. To prospect: search (e.g. "water damage restoration referral partners 60614"), web_fetch the promising listing/directory pages, extract each business's name, phone, and address, and call create_lead for each with source:"arc_web_discovery", review_status:"proposed", and an agent_confidence — they land in the operator's review queue as proposals, never live and never contacted. If web access is unavailable (not configured), say so plainly instead of inventing results.
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd apps/arc-runner && pnpm exec tsc --noEmit` → PASS.
```bash
git add apps/arc-runner/src/prompt.ts
git commit -m "feat(arc-runner): prompt — web access + search->read->propose prospecting loop"
```

---

## Task 7: Confirm/Dismiss operator action

The human gate. Operator-only (Arc can't change `review_status`). Mirrors `updateCrmRecordAction` in the same file.

**Files:**
- Modify: `src/app/crm/actions.ts`

- [ ] **Step 1: Add the action** at the end of `src/app/crm/actions.ts`:

```typescript
export async function setLeadReviewStatusAction(formData: FormData) {
  await requireOperator();

  const recordId = str(formData, "recordId");
  const decision = str(formData, "decision"); // "confirm" | "dismiss"
  if (!recordId || (decision !== "confirm" && decision !== "dismiss")) {
    redirect("/crm/leads?action=crm-error");
  }

  if (!isSupabaseAdminConfigured()) {
    redirect(`/crm/leads/${recordId}?action=not-configured`);
  }

  const reviewStatus = decision === "confirm" ? "active" : "dismissed";
  const supabase = getSupabaseAdminClient();
  const orgId = await getCurrentOrgId();
  const { error } = await supabase
    .from("leads")
    .update({ review_status: reviewStatus } as TablesUpdate<"leads">)
    .eq("id", recordId)
    .eq("org_id", orgId);
  if (error) {
    redirect(`/crm/leads/${recordId}?action=crm-error&message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/crm/leads/${recordId}`);
  revalidatePath("/crm/leads");
  redirect(`/crm/leads/${recordId}?action=${decision === "confirm" ? "lead-confirmed" : "lead-dismissed"}`);
}
```

NOTE: `recordId`/`decision` come in via `str()` which trims and returns `undefined` when blank — the guard above handles that. The two new `action` feedback keys (`lead-confirmed`, `lead-dismissed`) are surfaced in Task 8.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` → PASS. (`TablesUpdate` + `requireOperator` + `getCurrentOrgId` + `str` are already imported in this file.)
```bash
git add src/app/crm/actions.ts
git commit -m "feat(crm): operator-only Confirm/Dismiss action for Arc-proposed leads"
```

---

## Task 8: Proposed-lead review banner

Surface `review_status` on the lead record and show a Confirm/Dismiss banner when it's `proposed`.

**Files:**
- Modify: `src/lib/crm/read-model.ts`
- Modify: `src/app/crm/_components/crm-record-page.tsx`
- Modify: `src/app/crm/_components/crm-record-detail.tsx`

- [ ] **Step 1: Add `review_status` to the lead record read-model**

In `src/lib/crm/read-model.ts`:
- Add `reviewStatus: "active" | "proposed" | "dismissed"` to the `CrmRecordData` type (next to the `origin` field added in PR #194).
- Add `review_status` to the `leads` `LeadRow` type and to the leads `.select(...)` string (the one that already ends in `,origin`).
- Where the record object is built (`buildRecordDataFromBundle`, next to the `origin` mapping), add:
```typescript
reviewStatus:
  ((record as { review_status?: string | null }).review_status as "active" | "proposed" | "dismissed" | undefined) ??
  "active",
```

- [ ] **Step 2: Add the two feedback messages** to the `RECORD_FEEDBACK` list and `ActionFeedback` messages in `src/app/crm/_components/crm-record-page.tsx`:
  - Add `"lead-confirmed"` and `"lead-dismissed"` to the `RECORD_FEEDBACK` array.
  - Add to the `messages` map: `"lead-confirmed": "Lead confirmed — now active.", "lead-dismissed": "Lead dismissed."`.

- [ ] **Step 3: Render the banner**

In `src/app/crm/_components/crm-record-page.tsx`, just below `<RecordHeaderBand record={record} />`, add (only for leads that are proposed):

```tsx
{record.key === "leads" && record.reviewStatus === "proposed" ? (
  <Panel>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[var(--text-secondary)]">
        Arc proposed this lead from outside the app. Review and confirm to make it active, or dismiss it.
      </p>
      <div className="flex gap-2">
        <form action={setLeadReviewStatusAction}>
          <input type="hidden" name="recordId" value={record.id} />
          <input type="hidden" name="decision" value="confirm" />
          <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white">
            Confirm
          </button>
        </form>
        <form action={setLeadReviewStatusAction}>
          <input type="hidden" name="recordId" value={record.id} />
          <input type="hidden" name="decision" value="dismiss" />
          <button type="submit" className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm">
            Dismiss
          </button>
        </form>
      </div>
    </div>
  </Panel>
) : null}
```

Add the imports at the top of `crm-record-page.tsx`: `Panel` from `../../_components/page-header` (join the existing import from that module), and `setLeadReviewStatusAction` from `../actions`. NOTE: confirm `Panel` is exported from `page-header.tsx` (it is — it's listed among the shared primitives) and that `--accent`/`--border`/`--text-secondary` are real theme tokens (check `src/app/_components/theme.ts`; if a token name differs, use the real one — do NOT invent tokens, per the `no bare --surface token` lesson). Match the styling of nearby panels/buttons rather than copying these classes blindly.

- [ ] **Step 4: Typecheck + verify in preview**

Run: `pnpm exec tsc --noEmit` → PASS.
Then verify with preview tools: open an Arc-proposed lead record (`review_status='proposed'`) and confirm the banner + buttons render; use `preview_snapshot`/`preview_inspect` (not `preview_screenshot` — the particle canvas hangs it, per project memory). Confirm clicking Confirm flips it to active (banner disappears on reload).

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/read-model.ts src/app/crm/_components/crm-record-page.tsx src/app/crm/_components/crm-record-detail.tsx
git commit -m "feat(crm-ui): Confirm/Dismiss review banner on Arc-proposed leads"
```

---

## Task 9: Full verification pass

- [ ] **Step 1:** `pnpm test` → all pass (incl. new provider + fetch-public-page tests).
- [ ] **Step 2:** `pnpm exec tsc --noEmit` (app) and `cd apps/arc-runner && pnpm exec tsc --noEmit` → both clean.
- [ ] **Step 3:** Scoped lint:
  `pnpm exec eslint src/lib/web-search src/lib/web-fetch "src/app/api/v1/arc/web/search/route.ts" "src/app/api/v1/arc/web/fetch/route.ts" "src/app/api/v1/arc/brand/analyze-website/route.ts" src/app/crm/actions.ts src/lib/crm/read-model.ts apps/arc-runner/src/tools/web.ts apps/arc-runner/src/prompt.ts`
  → no errors on changed files.
- [ ] **Step 4:** `pnpm build` → succeeds (catches typed-Supabase-client errors that incremental tsc can miss — if `review_status` on the leads select trips a generated-types error like in PR #194, add `review_status: string` to the `leads` Row/Insert/Update in `src/lib/supabase/database.types.ts`).
- [ ] **Step 5:** Commit any fixes.

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** §1 provider → Task 1. §2 routes → Tasks 3-4 (search) + Task 4 (fetch), SSRF helper → Task 2. §3 runner tools → Task 5. §4 prompt → Task 6. §5 review affordance → Tasks 7-8 (Confirm/Dismiss action + record banner). §6 cost/safety → caps in Tasks 1/3 + SSRF in Task 2. Testing → per-task + Task 9.
- **Scoping note (tell the reviewer):** §5 mentioned a "Proposed filter on the leads list." This plan delivers the human gate as a **Confirm/Dismiss banner on the lead record page** (proposed leads are already visible in the leads list via the PR #194 "Added by Arc" pill). A dedicated filtered "Proposed queue" list view is a recommended fast-follow, deferred to avoid deep `crm-object-page`/read-model list surgery in this plan.
- **Out of scope (do NOT build):** Apollo/Google Places structured prospecting, sub-agent fan-out, scheduled/autonomous discovery, autonomous outbound. The confirm action only touches the lead's `review_status` (linked company/contact keep theirs — acceptable for v1).
- **Non-negotiable:** web tools read only; discovery creates `proposed` (review-gated) leads; Arc can't self-confirm (no `review_status` in its update whitelist) and never contacts anyone. SSRF guard is mandatory and unit-tested (Task 2).
- **Deploy:** set `WEB_SEARCH_API_KEY` in the app (Vercel) for prod; redeploy the runner for the new tools/prompt.
```

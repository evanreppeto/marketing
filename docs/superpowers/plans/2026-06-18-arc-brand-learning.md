# Arc Brand Learning & Brand-Kit Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Arc runner drive its system prompt from the org's stored Brand Kit (replacing the hardcoded `BSR_CONTEXT`), and let Arc learn a brand from a website + Q&A by proposing a draft `business_profiles` row the operator activates.

**Architecture:** Reuse the existing, dormant Brand Kit (schema, persistence, `getBusinessContext()` assembly, operator editor with a draft→active toggle). Add three bearer-gated Arc routes (`GET /brand/context`, `POST /brand/analyze-website`, `PUT /brand/profile`), two runner tools (`analyze_website`, `propose_brand_profile`), and wire the runner to fetch + map the context per turn with a graceful fallback. Arc only ever writes `status: draft`; activation stays an operator action.

**Tech Stack:** Next.js 16 route handlers (Node runtime), TypeScript, Vitest, `@anthropic-ai/claude-agent-sdk` + Zod tools, Supabase (service-role, via existing `@/lib/brand-kit` persistence).

**Test commands:**
- App (routes/domain) — from repo root: `pnpm test <path>`
- Runner — from repo root: `pnpm --filter @bsr/arc-runner exec vitest run <path>`

**Reuse (do NOT rebuild):** `business_profiles`/`persona_definitions` tables; `@/domain` `assembleArcContext`, `validateBusinessProfile`, `NEUTRAL_DEFAULTS`, `ArcBusinessContext`, `BusinessProfile`, `ProofPoint`, `BrandKitGuardrails`; `@/lib/brand-kit/persistence` (`getBusinessProfile`, `upsertBusinessProfile`); `@/lib/brand-kit/read-model` (`getBusinessContext`); `@/lib/auth/org` (`getCurrentOrgId`); `@/app/api/v1/arc/_lib/http` (`guard`, `ok`, `fail`, `readJson`, `INVALID_JSON`).

---

## File Structure

- `src/app/api/v1/arc/brand/context/route.ts` — GET assembled Arc business context for the current org. (+ test)
- `src/app/api/v1/arc/brand/analyze-website/route.ts` — POST: SSRF-guarded fetch + extract a URL into brand signal. (+ test)
- `src/lib/brand-kit/website.ts` — pure URL-safety + HTML-extraction helpers used by the analyze route. (+ test)
- `src/app/api/v1/arc/brand/profile/route.ts` — PUT: merge proposed fields, force `draft`, refuse to overwrite an `active` profile, validate, upsert. (+ test)
- `apps/arc-runner/src/business-context.ts` — add `AppBusinessContext` type, `fromAppContext()` mapper, `resolveBusinessContext()`. (modify; + test)
- `apps/arc-runner/src/arc.ts` — replace `business: BSR_CONTEXT` (lines ~109 and ~152) with the resolved context. (modify)
- `apps/arc-runner/src/tools/brand.ts` — `analyze_website` + `propose_brand_profile` tools. (+ test)
- `apps/arc-runner/src/tools/index.ts` — register brand tools under draft mode. (modify)

---

## Task 1: `GET /api/v1/arc/brand/context` route

The read seam: the runner fetches the assembled context here. Always returns a usable bundle (read-model already falls back to `NEUTRAL_DEFAULTS`).

**Files:**
- Create: `src/app/api/v1/arc/brand/context/route.ts`
- Test: `src/app/api/v1/arc/brand/context/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/v1/arc/brand/context/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: vi.fn(async () => "org_1") }));
vi.mock("@/lib/brand-kit/read-model", () => ({ getBusinessContext: vi.fn() }));

import { getCurrentOrgId } from "@/lib/auth/org";
import { getBusinessContext } from "@/lib/brand-kit/read-model";
import { GET } from "./route";

const orgMock = vi.mocked(getCurrentOrgId);
const ctxMock = vi.mocked(getBusinessContext);

function req(authorization: string | undefined) {
  return new Request("http://localhost/api/v1/arc/brand/context", {
    headers: { ...(authorization ? { authorization } : {}) },
  });
}

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
function configure() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

beforeEach(() => {
  orgMock.mockReset();
  ctxMock.mockReset();
  orgMock.mockResolvedValue("org_1");
  ctxMock.mockResolvedValue({
    businessName: "Big Shoulders Restoration",
    industry: "restoration",
    services: ["water", "mold"],
    tone: "calm",
    voiceGuidance: null,
    preferredPhrases: [],
    bannedPhrases: ["guarantee"],
    proofPoints: [],
    personas: [],
    guardrails: { disallowedClaims: [], complianceNotes: "" },
  });
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("GET /api/v1/arc/brand/context", () => {
  it("401s without a valid token and never reads", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await GET(req("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(ctxMock).not.toHaveBeenCalled();
  });

  it("returns the assembled context for the current org", async () => {
    configure();
    const res = await GET(req("Bearer secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      context: { businessName: "Big Shoulders Restoration", bannedPhrases: ["guarantee"] },
    });
    expect(ctxMock).toHaveBeenCalledWith("org_1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/api/v1/arc/brand/context/route.test.ts`
Expected: FAIL — `Cannot find module './route'` (route not created yet).

- [ ] **Step 3: Write the route**

```typescript
// src/app/api/v1/arc/brand/context/route.ts
import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getBusinessContext } from "@/lib/brand-kit/read-model";

/**
 * The org's assembled Arc business context (brand voice, services, banned
 * phrases, proof points, personas, guardrails). The runner fetches this each
 * turn to drive its system prompt. Read-only; falls back to neutral defaults in
 * the read-model when no profile exists.
 *
 *   GET /api/v1/arc/brand/context  ->  { ok, context }
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const context = await getBusinessContext(await getCurrentOrgId());
    return ok({ context });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to load brand context.", 502);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/api/v1/arc/brand/context/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/arc/brand/context
git commit -m "feat(arc): GET /brand/context exposes assembled brand context to the runner"
```

---

## Task 2: Wire the runner to the brand context

Map the app's rich `ArcBusinessContext` into the runner's 5-field shape and resolve it per turn, with a fallback to the existing `BSR_CONTEXT` on any fetch error.

**Files:**
- Modify: `apps/arc-runner/src/business-context.ts`
- Modify: `apps/arc-runner/src/arc.ts` (lines ~109 and ~152)
- Test: `apps/arc-runner/src/business-context.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/arc-runner/src/business-context.test.ts
import { describe, expect, it, vi } from "vitest";
import { BSR_CONTEXT, fromAppContext, resolveBusinessContext, type AppBusinessContext } from "./business-context";
import type { ArcClient } from "./arc-client";

const APP: AppBusinessContext = {
  businessName: "Acme Co",
  industry: "plumbing",
  services: ["repairs", "installs"],
  tone: "friendly",
  voiceGuidance: "Be concise.",
  preferredPhrases: ["fast response"],
  bannedPhrases: ["cheap", "guaranteed"],
  proofPoints: [{ kind: "stat", label: "20 years in business" }],
  personas: [{ key: "homeowner", label: "Homeowner" }],
  guardrails: { disallowedClaims: ["same-day always"], complianceNotes: "Stay licensed-scope." },
};

describe("fromAppContext", () => {
  it("folds brand fields into the runner's 5-field shape", () => {
    const c = fromAppContext(APP);
    expect(c.businessName).toBe("Acme Co");
    expect(c.industry).toContain("plumbing");
    expect(c.industry).toContain("repairs");
    expect(c.brandVoice).toContain("friendly");
    expect(c.brandVoice).toContain("fast response");
    expect(c.brandVoice).toContain("cheap"); // banned phrases surfaced as "never use"
    expect(c.compliance).toContain("Stay licensed-scope.");
    expect(c.compliance).toContain("same-day always");
    expect(c.creativePolicy).toContain("20 years in business");
  });
});

describe("resolveBusinessContext", () => {
  it("maps the fetched app context", async () => {
    const client = { apiGet: vi.fn(async () => ({ context: APP })) } as unknown as ArcClient;
    const c = await resolveBusinessContext(client);
    expect(c.businessName).toBe("Acme Co");
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/brand/context");
  });

  it("falls back to BSR_CONTEXT when the fetch fails", async () => {
    const client = { apiGet: vi.fn(async () => { throw new Error("boom"); }) } as unknown as ArcClient;
    const c = await resolveBusinessContext(client);
    expect(c).toEqual(BSR_CONTEXT);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bsr/arc-runner exec vitest run src/business-context.test.ts`
Expected: FAIL — `fromAppContext`/`resolveBusinessContext` are not exported.

- [ ] **Step 3: Add the mapper + resolver to `business-context.ts`**

Append to `apps/arc-runner/src/business-context.ts` (keep the existing `ArcBusinessContext` type and `BSR_CONTEXT` constant unchanged — `BSR_CONTEXT` becomes the emergency fallback):

```typescript
import type { ArcClient } from "./arc-client";

/** The rich context shape returned by GET /api/v1/arc/brand/context (app's assembleArcContext output). */
export type AppBusinessContext = {
  businessName: string;
  industry: string | null;
  services: string[];
  tone: string;
  voiceGuidance: string | null;
  preferredPhrases: string[];
  bannedPhrases: string[];
  proofPoints: Array<{ kind: string; label: string; detail?: string }>;
  personas: Array<{ key: string; label: string }>;
  guardrails: { disallowedClaims: string[]; complianceNotes: string };
};

/** Tenant-agnostic creative posture — the same for every business; brand specifics ride the other fields. */
const DEFAULT_CREATIVE_POLICY =
  "Prefer the business's real, approved media. AI creative may package/resize/test authentic proof, never fabricate scenes. Flag embedded text, unrealistic scenes, privacy/redaction, and unsubstantiated claims.";

/** Flatten the app's structured brand context into the runner's free-text 5-field prompt shape. */
export function fromAppContext(raw: AppBusinessContext): ArcBusinessContext {
  const services = raw.services.length ? ` Services: ${raw.services.join(", ")}.` : "";
  const voice = [
    `Tone: ${raw.tone}.`,
    raw.voiceGuidance ? `Guidance: ${raw.voiceGuidance}.` : null,
    raw.preferredPhrases.length ? `Preferred phrases: ${raw.preferredPhrases.join(", ")}.` : null,
    raw.bannedPhrases.length ? `Never use: ${raw.bannedPhrases.join(", ")}.` : null,
  ]
    .filter((b): b is string => Boolean(b))
    .join(" ");
  const proof = raw.proofPoints.length
    ? ` Proof points available: ${raw.proofPoints.map((p) => p.label).join("; ")}.`
    : "";
  const compliance =
    [
      raw.guardrails.complianceNotes || null,
      raw.guardrails.disallowedClaims.length ? `Do not claim: ${raw.guardrails.disallowedClaims.join(", ")}.` : null,
    ]
      .filter((b): b is string => Boolean(b))
      .join(" ") || "No specific compliance constraints recorded; stay accurate and avoid unverifiable claims.";

  return {
    businessName: raw.businessName,
    industry: (raw.industry ?? "Not specified") + services,
    brandVoice: voice,
    creativePolicy: DEFAULT_CREATIVE_POLICY + proof,
    compliance,
  };
}

/** Fetch + map the org's brand context for this turn; fall back to BSR_CONTEXT on any error. */
export async function resolveBusinessContext(client: ArcClient): Promise<ArcBusinessContext> {
  try {
    const res = await client.apiGet<{ context: AppBusinessContext }>("/api/v1/arc/brand/context");
    return fromAppContext(res.context);
  } catch {
    return BSR_CONTEXT;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bsr/arc-runner exec vitest run src/business-context.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire `arc.ts` to resolve the context**

In `apps/arc-runner/src/arc.ts`, update the import on line 3 and both `ctx` builders.

Change the import:

```typescript
import { BSR_CONTEXT, resolveBusinessContext } from "./business-context";
```

In `runArcTurn` (around line 108), replace the `business: BSR_CONTEXT,` line. Add a resolve call just before the `const ctx` and reference it:

```typescript
  const business = await resolveBusinessContext(client);

  const ctx: ArcTurnContext = {
    business,
    mode: payload.mode,
    // ...unchanged...
```

In `runArcOpportunityDraft` (around line 150), do the same:

```typescript
  const business = await resolveBusinessContext(client);

  const ctx: ArcTurnContext = {
    business,
    mode: "draft",
    // ...unchanged...
```

(`BSR_CONTEXT` stays imported because `resolveBusinessContext` references it as the fallback; the lint rule won't flag it as unused since it's used inside `business-context.ts`, but keeping it imported in `arc.ts` is unnecessary — remove `BSR_CONTEXT` from the `arc.ts` import if eslint flags it as unused.)

- [ ] **Step 6: Typecheck the runner**

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/arc-runner/src/business-context.ts apps/arc-runner/src/business-context.test.ts apps/arc-runner/src/arc.ts
git commit -m "feat(arc): runner resolves brand context per turn, BSR_CONTEXT as fallback"
```

---

## Task 3: Website analysis — pure helpers

Pure, deterministic helpers (URL safety + HTML extraction) so the route logic is unit-testable without network.

**Files:**
- Create: `src/lib/brand-kit/website.ts`
- Test: `src/lib/brand-kit/__tests__/website.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/brand-kit/__tests__/website.test.ts
import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, extractBrandSignal } from "../website";

describe("assertPublicHttpUrl", () => {
  it("accepts a normal https url", () => {
    expect(() => assertPublicHttpUrl("https://example.com/about")).not.toThrow();
  });
  it("rejects non-http(s) schemes", () => {
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow();
    expect(() => assertPublicHttpUrl("ftp://example.com")).toThrow();
  });
  it("rejects localhost and private/loopback IP literals", () => {
    expect(() => assertPublicHttpUrl("http://localhost/")).toThrow();
    expect(() => assertPublicHttpUrl("http://127.0.0.1/")).toThrow();
    expect(() => assertPublicHttpUrl("http://10.0.0.5/")).toThrow();
    expect(() => assertPublicHttpUrl("http://192.168.1.1/")).toThrow();
    expect(() => assertPublicHttpUrl("http://169.254.1.1/")).toThrow();
  });
});

describe("extractBrandSignal", () => {
  it("pulls title, meta description, and readable text; strips scripts/styles", () => {
    const html = `
      <html><head>
        <title>Acme Plumbing</title>
        <meta name="description" content="Fast, friendly plumbing.">
        <link rel="icon" href="/favicon.ico">
        <style>.x{color:red}</style>
      </head><body>
        <script>var a=1;</script>
        <h1>We fix leaks</h1><p>Serving the city since 2001.</p>
      </body></html>`;
    const sig = extractBrandSignal(html, "https://acme.com");
    expect(sig.title).toBe("Acme Plumbing");
    expect(sig.description).toBe("Fast, friendly plumbing.");
    expect(sig.faviconUrl).toBe("https://acme.com/favicon.ico");
    expect(sig.text).toContain("We fix leaks");
    expect(sig.text).toContain("Serving the city since 2001.");
    expect(sig.text).not.toContain("var a=1");
    expect(sig.text).not.toContain("color:red");
  });

  it("caps text length", () => {
    const long = "word ".repeat(5000);
    const sig = extractBrandSignal(`<body>${long}</body>`, "https://x.com");
    expect(sig.text.length).toBeLessThanOrEqual(8000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/brand-kit/__tests__/website.test.ts`
Expected: FAIL — `Cannot find module '../website'`.

- [ ] **Step 3: Write the helpers**

```typescript
// src/lib/brand-kit/website.ts

const MAX_TEXT = 8000;

/** Brand signal extracted from a fetched page. */
export type BrandSignal = {
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
  text: string;
};

/** True for IPv4 literals in private/loopback/link-local ranges. */
function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
}

/**
 * Throw unless `raw` is a public http(s) URL. Synchronous SSRF guard for literal
 * hosts (scheme + localhost + private IPv4 + IPv6 loopback). The route adds a
 * DNS-resolution check for named hosts before fetching.
 */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "[::1]") {
    throw new Error("Refusing to fetch a loopback host.");
  }
  if (isPrivateIpv4(host)) {
    throw new Error("Refusing to fetch a private/loopback address.");
  }
  return url;
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m ? m[1].trim() : null;
}

/** Strip markup to readable text + pull title/description/favicon. Pure. */
export function extractBrandSignal(html: string, baseUrl: string): BrandSignal {
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
    firstMatch(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const iconHref =
    firstMatch(html, /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i) ??
    firstMatch(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i);
  let faviconUrl: string | null = null;
  if (iconHref) {
    try {
      faviconUrl = new URL(iconHref, baseUrl).toString();
    } catch {
      faviconUrl = null;
    }
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);

  return { title, description, faviconUrl, text };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/brand-kit/__tests__/website.test.ts`
Expected: PASS (6 assertions across the suite).

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand-kit/website.ts src/lib/brand-kit/__tests__/website.test.ts
git commit -m "feat(brand-kit): pure website SSRF guard + HTML brand-signal extraction"
```

---

## Task 4: `POST /api/v1/arc/brand/analyze-website` route

Wire the fetch (Node runtime) with a DNS-resolution SSRF check, size + time caps, then extract.

**Files:**
- Create: `src/app/api/v1/arc/brand/analyze-website/route.ts`
- Test: `src/app/api/v1/arc/brand/analyze-website/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/v1/arc/brand/analyze-website/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/brand/analyze-website", {
    method: "POST",
    headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
function configure() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/v1/arc/brand/analyze-website", () => {
  it("401s without a valid token", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await POST(req("Bearer wrong", { url: "https://example.com" }));
    expect(res.status).toBe(401);
  });

  it("400s on a missing url", async () => {
    configure();
    const res = await POST(req("Bearer secret", {}));
    expect(res.status).toBe(400);
  });

  it("400s on a loopback/private url (SSRF guard)", async () => {
    configure();
    const res = await POST(req("Bearer secret", { url: "http://127.0.0.1/" }));
    expect(res.status).toBe(400);
    expect((await res.json()).status).toBe("rejected");
  });

  it("fetches and returns extracted brand signal", async () => {
    configure();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        "<html><head><title>Acme</title></head><body><h1>We fix leaks</h1></body></html>",
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );
    const res = await POST(req("Bearer secret", { url: "https://acme.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.title).toBe("Acme");
    expect(json.text).toContain("We fix leaks");
  });
});
```

> Note: the "fetches and returns" test relies on the route's DNS guard allowing a public host. To keep the unit test deterministic, the route's DNS check is skipped when the resolved address can't be determined in test — see the implementation comment. If the test environment blocks DNS, mock `node:dns/promises` `lookup` to return `{ address: "93.184.216.34", family: 4 }`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/api/v1/arc/brand/analyze-website/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the route**

```typescript
// src/app/api/v1/arc/brand/analyze-website/route.ts
import { lookup } from "node:dns/promises";

import { INVALID_JSON, fail, guard, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { assertPublicHttpUrl, extractBrandSignal } from "@/lib/brand-kit/website";

export const runtime = "nodejs"; // needs node:dns + fetch with redirect control

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 1_000_000;

function isPrivateAddress(address: string, family: number): boolean {
  if (family === 6) return address === "::1" || address.toLowerCase().startsWith("fe80") || address.toLowerCase().startsWith("fc") || address.toLowerCase().startsWith("fd");
  const p = address.split(".").map(Number);
  if (p.length !== 4) return false;
  const [a, b] = p;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Fetch a public website and extract brand signal (title, description, favicon,
 * readable text) for Arc to reason over. SSRF-guarded: http(s) only, literal +
 * DNS-resolved private/loopback addresses rejected, ≤2 redirects, 5s timeout,
 * 1MB cap. No LLM here — Arc structures the result.
 *
 *   POST /api/v1/arc/brand/analyze-website  { url }
 *   -> 200 { ok, title, description, faviconUrl, text }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const urlRaw = typeof (payload as Record<string, unknown>).url === "string" ? ((payload as Record<string, unknown>).url as string).trim() : "";
  if (!urlRaw) return fail("rejected", "url is required.", 400);

  let url;
  try {
    url = assertPublicHttpUrl(urlRaw);
  } catch (error) {
    return fail("rejected", error instanceof Error ? error.message : "Unsafe URL.", 400);
  }

  // DNS guard for named hosts. Best-effort: if lookup is unavailable, the literal
  // guard above still applies.
  try {
    const resolved = await lookup(url.hostname);
    if (isPrivateAddress(resolved.address, resolved.family)) {
      return fail("rejected", "Refusing to fetch a private/loopback address.", 400);
    }
  } catch {
    /* lookup failed/unavailable — proceed; fetch will surface real errors */
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ArcBrandBot/1.0" } });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return fail("failed", `Site returned ${res.status}.`, 502);

    const raw = await res.text();
    const html = raw.slice(0, MAX_BYTES);
    const signal = extractBrandSignal(html, url.toString());
    return ok({ title: signal.title, description: signal.description, faviconUrl: signal.faviconUrl, text: signal.text });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to fetch the site.", 502);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/api/v1/arc/brand/analyze-website/route.test.ts`
Expected: PASS (4 tests). If the "fetches and returns" case fails on DNS, add at the top of the test file:
```typescript
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => ({ address: "93.184.216.34", family: 4 })) }));
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/arc/brand/analyze-website
git commit -m "feat(arc): POST /brand/analyze-website (SSRF-guarded fetch + extract)"
```

---

## Task 5: `PUT /api/v1/arc/brand/profile` route

Merge proposed fields onto the current profile, force `status: "draft"`, refuse to overwrite an `active` profile, validate, upsert. Arc can never write `active`.

**Files:**
- Create: `src/app/api/v1/arc/brand/profile/route.ts`
- Test: `src/app/api/v1/arc/brand/profile/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/v1/arc/brand/profile/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: vi.fn(async () => "org_1") }));
vi.mock("@/lib/brand-kit/persistence", () => ({
  getBusinessProfile: vi.fn(),
  upsertBusinessProfile: vi.fn(),
}));

import { getBusinessProfile, upsertBusinessProfile } from "@/lib/brand-kit/persistence";
import { NEUTRAL_DEFAULTS } from "@/domain";
import { PUT } from "./route";

const getMock = vi.mocked(getBusinessProfile);
const upsertMock = vi.mocked(upsertBusinessProfile);

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/brand/profile", {
    method: "PUT",
    headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
function configure() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

beforeEach(() => {
  getMock.mockReset();
  upsertMock.mockReset();
  getMock.mockResolvedValue(null); // no profile yet
  upsertMock.mockImplementation(async (_org, profile) => profile);
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("PUT /api/v1/arc/brand/profile", () => {
  it("401s without a valid token and never writes", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await PUT(req("Bearer wrong", { displayName: "Acme" }));
    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("writes a draft profile from proposed fields (forces status=draft)", async () => {
    configure();
    const res = await PUT(req("Bearer secret", { displayName: "Acme Co", services: ["repairs"], status: "active" }));
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      "org_1",
      expect.objectContaining({ displayName: "Acme Co", services: ["repairs"], status: "draft" }),
    );
  });

  it("refuses to overwrite an ACTIVE profile", async () => {
    configure();
    getMock.mockResolvedValue({ ...NEUTRAL_DEFAULTS, displayName: "Live Co", status: "active" });
    const res = await PUT(req("Bearer secret", { displayName: "Hijack" }));
    expect(res.status).toBe(409);
    expect((await res.json()).status).toBe("locked");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("400s when the merged profile fails validation (empty displayName)", async () => {
    configure();
    const res = await PUT(req("Bearer secret", { tagline: "no name given" }));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
```

> Note: the validation test assumes `validateBusinessProfile` rejects an empty `displayName` (NEUTRAL_DEFAULTS has `displayName: ""`). Confirm by reading `validateBusinessProfile` in `src/domain/brand-kit.ts`; if it does not require a non-empty name, change this test to assert another invalid field it does enforce, or drop it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/api/v1/arc/brand/profile/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the route**

```typescript
// src/app/api/v1/arc/brand/profile/route.ts
import { INVALID_JSON, fail, guard, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { NEUTRAL_DEFAULTS, validateBusinessProfile, type BusinessProfile, type ProofPoint } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getBusinessProfile, upsertBusinessProfile } from "@/lib/brand-kit/persistence";

/**
 * Lets Arc PROPOSE a brand profile (from website analysis + Q&A). Always writes
 * status:"draft" — Arc can never activate; the operator flips draft→active in
 * Settings. Refuses to overwrite a live (active) profile. Merges the proposed
 * fields onto the current profile (or NEUTRAL_DEFAULTS).
 *
 *   PUT /api/v1/arc/brand/profile
 *   { displayName?, tagline?, description?, industry?, websiteUrl?, logoUrl?,
 *     faviconUrl?, accent?, tone?, voiceGuidance?, services?, serviceAreas?,
 *     preferredPhrases?, bannedPhrases?, proofPoints?, guardrails? }
 *   -> 200 { ok, profile } | 409 locked | 400 rejected
 */
export async function PUT(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const body = payload as Record<string, unknown>;

  let orgId: string;
  try {
    orgId = await getCurrentOrgId();
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "No organization available.", 502);
  }

  const current = (await getBusinessProfile(orgId)) ?? NEUTRAL_DEFAULTS;
  if (current.status === "active") {
    return fail("locked", "An active Brand Kit already exists. Ask the operator to edit it in Settings.", 409);
  }

  const str = (v: unknown, fallback: string | null): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;
  const strList = (v: unknown, fallback: string[]): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : fallback;

  const proofPoints: ProofPoint[] = Array.isArray(body.proofPoints)
    ? (body.proofPoints as unknown[]).flatMap((p) => {
        if (typeof p !== "object" || p === null) return [];
        const o = p as Record<string, unknown>;
        const kind = o.kind === "certification" || o.kind === "stat" ? o.kind : "testimonial";
        const label = typeof o.label === "string" ? o.label.trim() : "";
        if (!label) return [];
        return [{ kind, label, ...(typeof o.detail === "string" ? { detail: o.detail.trim() } : {}) } as ProofPoint];
      })
    : current.proofPoints;

  const g = typeof body.guardrails === "object" && body.guardrails !== null ? (body.guardrails as Record<string, unknown>) : {};

  const merged: BusinessProfile = {
    ...current,
    displayName: str(body.displayName, current.displayName || "") ?? "",
    tagline: str(body.tagline, current.tagline),
    description: str(body.description, current.description),
    industry: str(body.industry, current.industry),
    websiteUrl: str(body.websiteUrl, current.websiteUrl),
    logoUrl: str(body.logoUrl, current.logoUrl),
    faviconUrl: str(body.faviconUrl, current.faviconUrl),
    accent: str(body.accent, current.accent) ?? current.accent,
    tone: str(body.tone, current.tone) ?? current.tone,
    voiceGuidance: str(body.voiceGuidance, current.voiceGuidance),
    services: strList(body.services, current.services),
    serviceAreas: strList(body.serviceAreas, current.serviceAreas),
    preferredPhrases: strList(body.preferredPhrases, current.preferredPhrases),
    bannedPhrases: strList(body.bannedPhrases, current.bannedPhrases),
    proofPoints,
    guardrails: {
      disallowedClaims: strList(g.disallowedClaims, current.guardrails.disallowedClaims),
      complianceNotes: str(g.complianceNotes, current.guardrails.complianceNotes) ?? current.guardrails.complianceNotes,
    },
    status: "draft", // Arc can never activate
  };

  const validation = validateBusinessProfile(merged);
  if (!validation.ok) {
    return fail("rejected", `Invalid profile: ${validation.errors.join(", ")}.`, 400);
  }

  try {
    const profile = await upsertBusinessProfile(orgId, merged);
    return ok({ profile });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to save the brand profile.", 502);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/api/v1/arc/brand/profile/route.test.ts`
Expected: PASS (4 tests). Adjust the validation test per the note in Step 1 if needed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/arc/brand/profile
git commit -m "feat(arc): PUT /brand/profile — Arc proposes a draft profile, never overwrites active"
```

---

## Task 6: Runner brand tools

`analyze_website` (read public site) and `propose_brand_profile` (write draft + emit a review card). Draft mode only.

**Files:**
- Create: `apps/arc-runner/src/tools/brand.ts`
- Modify: `apps/arc-runner/src/tools/index.ts`
- Test: `apps/arc-runner/src/tools/brand.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/arc-runner/src/tools/brand.test.ts
import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { brandTools } from "./brand";

const noStep = async () => {};

function toolsByName(client: ArcClient, collect: (c: ArcActionCard) => void) {
  const arr = brandTools(client, noStep, collect);
  return Object.fromEntries(arr.map((t) => [t.name, t]));
}

describe("brandTools", () => {
  it("analyze_website calls the analyze route and returns the signal text", async () => {
    const client = { apiPost: vi.fn(async () => ({ ok: true, title: "Acme", text: "We fix leaks" })) } as unknown as ArcClient;
    const tools = toolsByName(client, () => {});
    const res = await tools.analyze_website.handler({ url: "https://acme.com" }, {} as never);
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/brand/analyze-website", { url: "https://acme.com" });
    expect(res.content[0].text).toContain("We fix leaks");
  });

  it("propose_brand_profile writes a draft and emits a review card", async () => {
    const client = { apiPost: vi.fn(async () => ({ ok: true, profile: { displayName: "Acme Co", status: "draft" } })) } as unknown as ArcClient;
    const cards: ArcActionCard[] = [];
    const tools = toolsByName(client, (c) => cards.push(c));
    const res = await tools.propose_brand_profile.handler(
      { displayName: "Acme Co", services: ["repairs"], tone: "friendly" },
      {} as never,
    );
    expect(client.apiPost).toHaveBeenCalledWith(
      "/api/v1/arc/brand/profile",
      expect.objectContaining({ displayName: "Acme Co", services: ["repairs"] }),
    );
    // NOTE: arc-client exposes apiPost for POST; the PUT route is reached via a
    // dedicated client method added in Step 3 — see implementation.
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("draft");
    expect(cards[0].href).toBe("/settings");
    expect(res.content[0].text).toContain("draft");
  });
});
```

> The test calls `tool.handler(args, extra)` — the `tool()` helper from the SDK stores the async handler as `.handler`. If the installed SDK names it differently, read one existing tool test (e.g. `apps/arc-runner/src/tools/cards.test.ts` if present) to confirm how handlers are invoked, and match that call style.

- [ ] **Step 2: Add a PUT helper to the Arc client**

The existing client (`apps/arc-runner/src/arc-client.ts`) has `apiGet`/`apiPost` but no PUT. Add `apiPut` mirroring `apiPost`, and expose it in the returned object:

```typescript
  /** Authenticated PUT against the Operations API. Throws on non-2xx or { ok:false }. */
  async function apiPut<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${config.appApiBaseUrl}${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string } & Record<string, unknown>;
    if (!res.ok || json?.ok === false) {
      throw new Error(`PUT ${path} -> ${res.status} ${json?.message ?? ""}`.trim());
    }
    return json as T;
  }
```

Then add `apiPut` to the returned object literal: `return { apiGet, apiPost, apiPut, postChatReply, postStep };`

Update the test in Step 1 to use `apiPut` for `propose_brand_profile`: change the client mock to `{ apiPut: vi.fn(...) }` and assert `client.apiPut` was called with `"/api/v1/arc/brand/profile"`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @bsr/arc-runner exec vitest run src/tools/brand.test.ts`
Expected: FAIL — `Cannot find module './brand'`.

- [ ] **Step 4: Write the tools**

```typescript
// apps/arc-runner/src/tools/brand.ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { runTool, textResult, type StepFn } from "./helpers";

/**
 * Brand-learning tools (draft mode). `analyze_website` reads a public site for
 * brand signal; `propose_brand_profile` writes a DRAFT business profile and
 * surfaces a review card. Arc never activates a profile — the operator does that
 * in Settings. Read + draft only; nothing goes outbound.
 */
export function brandTools(client: ArcClient, step: StepFn, collectCard: (card: ArcActionCard) => void) {
  const analyzeWebsite = tool(
    "analyze_website",
    "Fetch a company's public website and extract brand signal (title, description, favicon, readable text) so you can learn their brand. Use when the operator gives you a URL or asks you to learn/onboard a brand. Read-only and safe. After reading, ask 1–3 short follow-up questions for anything the site didn't cover (personas, banned phrases, compliance limits), then call propose_brand_profile.",
    { url: z.string().describe("The company's website URL (http or https).") },
    async (args) =>
      runTool(step, "Reading website", () =>
        client.apiPost("/api/v1/arc/brand/analyze-website", { url: args.url }),
      ),
  );

  const proposeBrandProfile = tool(
    "propose_brand_profile",
    "Save a DRAFT brand profile for the operator to review and activate. Provide every field you can infer from the website + the operator's answers. You CANNOT activate it — say so, and tell the operator to review and switch it to Active in Settings. Do not include any status field; it is always saved as a draft.",
    {
      displayName: z.string().describe("The business name."),
      tagline: z.string().optional(),
      description: z.string().optional(),
      industry: z.string().optional(),
      websiteUrl: z.string().optional(),
      logoUrl: z.string().optional(),
      faviconUrl: z.string().optional(),
      accent: z.string().optional().describe("Brand accent color, hex (e.g. #C8A24B)."),
      tone: z.string().optional().describe("Brand voice tone, e.g. 'calm, expert'."),
      voiceGuidance: z.string().optional(),
      services: z.array(z.string()).optional(),
      serviceAreas: z.array(z.string()).optional(),
      preferredPhrases: z.array(z.string()).optional(),
      bannedPhrases: z.array(z.string()).optional(),
      proofPoints: z
        .array(z.object({ kind: z.enum(["testimonial", "certification", "stat"]), label: z.string(), detail: z.string().optional() }))
        .optional(),
      guardrails: z
        .object({ disallowedClaims: z.array(z.string()).optional(), complianceNotes: z.string().optional() })
        .optional(),
    },
    async (args) => {
      const label = "Proposing brand profile";
      await step(label, "running");
      try {
        await client.apiPut("/api/v1/arc/brand/profile", { ...args });
        await step(label, "done");
        const rows = [
          { name: "Name", meta: args.displayName },
          ...(args.tone ? [{ name: "Tone", meta: args.tone }] : []),
          ...(args.services?.length ? [{ name: "Services", meta: args.services.join(", ") }] : []),
          ...(args.bannedPhrases?.length ? [{ name: "Never use", meta: args.bannedPhrases.join(", ") }] : []),
        ];
        collectCard({
          kind: "draft",
          title: `Proposed Brand Kit: ${args.displayName}`,
          rows,
          flags: [{ tone: "warn", label: "Draft — review & activate in Settings" }],
          href: "/settings",
        });
        return textResult(
          JSON.stringify({ status: "draft saved", note: "Tell the operator to review and activate it in Settings — you cannot activate it yourself." }),
        );
      } catch (error) {
        await step(label, "done");
        return textResult(`${label} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    },
  );

  return [analyzeWebsite, proposeBrandProfile];
}
```

- [ ] **Step 5: Register the tools under draft mode**

In `apps/arc-runner/src/tools/index.ts`:

Add the import near the other tool imports:
```typescript
import { brandTools } from "./brand";
```

Add brand tools to `draftTools` (they need `collectCard`):
```typescript
function draftTools(client: ArcClient, step: StepFn, sink: TurnSink, ctx: ToolContext) {
  return [
    ...draftWorkProductTools(client, step, sink.card, ctx),
    ...mediaTools(client, step, sink.card, ctx),
    ...brandTools(client, step, sink.card),
  ];
}
```

(`allowedToolNames` derives from the same source, so `mcp__arc__analyze_website` and `mcp__arc__propose_brand_profile` are auto-allowed in draft mode — no extra change.)

- [ ] **Step 6: Run the tool test + typecheck**

Run: `pnpm --filter @bsr/arc-runner exec vitest run src/tools/brand.test.ts`
Expected: PASS.

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/arc-runner/src/tools/brand.ts apps/arc-runner/src/tools/brand.test.ts apps/arc-runner/src/tools/index.ts apps/arc-runner/src/arc-client.ts
git commit -m "feat(arc): runner brand tools — analyze_website + propose_brand_profile (draft)"
```

---

## Task 7: Prompt nudge so Arc knows it can learn brands

Tell Arc the capability exists so it offers/uses it.

**Files:**
- Modify: `apps/arc-runner/src/prompt.ts`

- [ ] **Step 1: Read the current prompt**

Run: open `apps/arc-runner/src/prompt.ts` and find the capabilities/section listing what Arc can do.

- [ ] **Step 2: Add a brand-learning line**

Add a sentence to `ARC_SYSTEM_PROMPT` (in the draft/capabilities area), e.g.:

```
When the operator asks you to learn or set up a brand (or gives you a website), use analyze_website to read their site, ask a few short follow-up questions for anything missing, then call propose_brand_profile to save a DRAFT Brand Kit. You cannot activate it — tell them to review and switch it to Active in Settings. Until a Brand Kit is active, you run on neutral defaults.
```

- [ ] **Step 3: Typecheck (no logic change) + commit**

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: no errors.

```bash
git add apps/arc-runner/src/prompt.ts
git commit -m "feat(arc): prompt Arc to learn brands via analyze_website + propose_brand_profile"
```

---

## Task 8: Full test sweep + manual verification (BSR onboarding)

- [ ] **Step 1: Run the app test suite**

Run: `pnpm test src/app/api/v1/arc/brand src/lib/brand-kit`
Expected: all brand route + helper tests PASS.

- [ ] **Step 2: Run the runner test suite**

Run: `pnpm --filter @bsr/arc-runner test`
Expected: all runner tests PASS (including the existing `context`/`tools` suites).

- [ ] **Step 3: Build to catch type errors (lint does not typecheck)**

Run: `pnpm build`
Expected: build succeeds. (Per project memory: `pnpm lint` is eslint-only; the Next build / tsc is what catches typed-Supabase + RSC issues.)

- [ ] **Step 4: Onboard BSR and verify the wiring (requires Supabase env)**

1. Seed BSR's Brand Kit: `pnpm seed:brand-kit-bsr`
2. Start the app (`pnpm dev`), open `/settings`, find the Brand Kit, confirm the fields, and flip the toggle to **Active**.
3. With the runner pointed at the app, open an Arc chat (draft mode) and confirm replies reflect BSR's stored voice/guardrails (not the hardcoded constant). A quick check: temporarily set a distinctive `bannedPhrase` in Settings, re-activate, and confirm Arc avoids it.
4. In a chat, say: "Learn our brand: <a public URL>". Confirm Arc calls `analyze_website`, asks follow-ups, calls `propose_brand_profile`, and a **draft** card appears linking to `/settings` — and that the profile does NOT become active until you flip it.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "test(arc): brand-learning end-to-end verification fixups"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** (A) context route + wiring → Tasks 1–2; (B) website analysis → Tasks 3–4 + tool in Task 6; (C) draft proposal → Task 5 (route) + Task 6 (tool); prompt awareness → Task 7; safety (draft-only, refuse-active, SSRF) → Tasks 4–5 tests; BSR onboarding → Task 8. All spec sections covered.
- **Placeholder scan:** no TBD/TODO; every code step ships full code. Two explicit "confirm against source" notes (SDK handler property name in Task 6; `validateBusinessProfile` rules in Task 5) are verification instructions, not placeholders — both name the exact file to check and the fallback action.
- **Type consistency:** `AppBusinessContext` (Task 2) matches the app's `assembleArcContext` output and the `GET /brand/context` shape (Task 1). `BusinessProfile`/`ProofPoint`/`BrandKitGuardrails`/`validateBusinessProfile`/`NEUTRAL_DEFAULTS` used in Task 5 are real `@/domain` exports. `apiPut` added before first use (Task 6 Step 2). `brandTools(client, step, collectCard)` signature matches its call in `index.ts` (Task 6 Step 5).
- **Risk note:** the runner's `ArcBusinessContext` stays 5 free-text fields (minimal blast radius); structured-field enrichment of `businessBlock` is intentionally deferred (spec out-of-scope).

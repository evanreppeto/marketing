# Arc Intelligence Reads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Arc read access to four surfaces it's blind to — opportunities, persona-intelligence, vault, activity — via bearer-gated routes over the existing read-models + new runner read-tools available in all modes.

**Architecture:** Repeat the established `crm.ts → /api/v1/arc/crm/*` read pattern. Each surface: a flat `GET /api/v1/arc/<surface>` route (`guard` → existing read-model → `ok`) + a runner read-tool in `tools/intelligence.ts` (calls the route via `client.apiGet` through the `runTool` helper) registered in `readTools()`. No new data logic; the read-models resolve org internally.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Vitest, `@anthropic-ai/claude-agent-sdk` tools.

**Test command:** app routes — `pnpm test <path>`; runner — `pnpm --filter @bsr/arc-runner exec vitest run <path>`.

**Reuse:** `@/app/api/v1/arc/_lib/http` (`guard`, `ok`, `fail`); read-models `listOpenOpportunities()` → `OpportunityRecord[]`, `getPersonaIntelligenceData()` → `{status:"unavailable",message} | <data>`, `getVaultNotes()` → `{status,notes,message?}` + `getVaultNote(slug)` → `VaultNote|null`, `getRecentActivity(query?)` → `{status:"live",entries,summary,groups} | {status:"unavailable",message}`. Runner: `runTool`/`textResult`/`StepFn` (`tools/helpers.ts`), `ArcClient.apiGet(path, params?)`, `readTools()`/`allowedToolNames` (`tools/index.ts`).

---

## File Structure
- `src/app/api/v1/arc/opportunities/route.ts` (+ test)
- `src/app/api/v1/arc/persona-intelligence/route.ts` (+ test)
- `src/app/api/v1/arc/vault/route.ts` (+ test)
- `src/app/api/v1/arc/activity/route.ts` (+ test)
- `apps/arc-runner/src/tools/intelligence.ts` (5 tools) (+ test)
- `apps/arc-runner/src/tools/index.ts` (register in `readTools`) — modify
- `apps/arc-runner/src/prompt.ts` (mention the tools) — modify

---

## Task 1: `GET /api/v1/arc/opportunities`

**Files:** Create `src/app/api/v1/arc/opportunities/route.ts` + `route.test.ts`

- [ ] **Step 1: Test**

```typescript
// route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/opportunities/read-model", () => ({ listOpenOpportunities: vi.fn() }));
import { listOpenOpportunities } from "@/lib/opportunities/read-model";
import { GET } from "./route";

const mock = vi.mocked(listOpenOpportunities);
function req(auth?: string) { return new Request("http://localhost/api/v1/arc/opportunities", { headers: { ...(auth ? { authorization: auth } : {}) } }); }
const env = { ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
function configure() { process.env.ARC_AGENT_API_TOKEN = "secret"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; }
beforeEach(() => { mock.mockReset(); mock.mockResolvedValue([{ id: "o1", title: "Flood lead" }] as never); });
afterEach(() => { for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("GET /api/v1/arc/opportunities", () => {
  it("401s without a valid token and never reads", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });
  it("returns open opportunities", async () => {
    configure();
    const res = await GET(req("Bearer secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, opportunities: [{ id: "o1", title: "Flood lead" }] });
  });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm test src/app/api/v1/arc/opportunities/route.test.ts` — no `./route`).

- [ ] **Step 3: Route**

```typescript
// route.ts
import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { listOpenOpportunities } from "@/lib/opportunities/read-model";

/**
 * Open opportunities (pending/drafting/drafted) for Arc to browse the inbox.
 * Read-only; org resolved inside the read-model.
 *   GET /api/v1/arc/opportunities  ->  { ok, opportunities }
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    return ok({ opportunities: await listOpenOpportunities() });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list opportunities.", 502);
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/app/api/v1/arc/opportunities && git commit -m "feat(arc): GET /opportunities for Arc to read the inbox"`

---

## Task 2: `GET /api/v1/arc/persona-intelligence`

**Files:** Create `src/app/api/v1/arc/persona-intelligence/route.ts` + `route.test.ts`

- [ ] **Step 1: Test**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/persona-intelligence/read-model", () => ({ getPersonaIntelligenceData: vi.fn() }));
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";
import { GET } from "./route";

const mock = vi.mocked(getPersonaIntelligenceData);
function req(auth?: string) { return new Request("http://localhost/api/v1/arc/persona-intelligence", { headers: { ...(auth ? { authorization: auth } : {}) } }); }
const env = { ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
function configure() { process.env.ARC_AGENT_API_TOKEN = "secret"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; }
beforeEach(() => { mock.mockReset(); mock.mockResolvedValue({ snapshots: [], knowledge: [], guardrails: [] } as never); });
afterEach(() => { for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("GET /api/v1/arc/persona-intelligence", () => {
  it("401s without a valid token and never reads", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });
  it("returns the persona-intelligence payload", async () => {
    configure();
    const res = await GET(req("Bearer secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, personaIntelligence: { snapshots: [] } });
  });
  it("502s when the read-model is unavailable", async () => {
    configure();
    mock.mockResolvedValue({ status: "unavailable", message: "no db" } as never);
    expect((await GET(req("Bearer secret"))).status).toBe(502);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Route**

```typescript
import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";

/**
 * The Persona Revenue Intelligence overview (segments, scores, signals) for Arc.
 *   GET /api/v1/arc/persona-intelligence  ->  { ok, personaIntelligence }
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const data = await getPersonaIntelligenceData();
    if ("status" in data && data.status === "unavailable") {
      return fail("failed", data.message ?? "Persona intelligence is unavailable.", 502);
    }
    return ok({ personaIntelligence: data });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read persona intelligence.", 502);
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/app/api/v1/arc/persona-intelligence && git commit -m "feat(arc): GET /persona-intelligence for Arc"`

---

## Task 3: `GET /api/v1/arc/vault` (list + `?slug=` detail)

**Files:** Create `src/app/api/v1/arc/vault/route.ts` + `route.test.ts`

- [ ] **Step 1: Test**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/vault/read-model", () => ({ getVaultNotes: vi.fn(), getVaultNote: vi.fn() }));
import { getVaultNotes, getVaultNote } from "@/lib/vault/read-model";
import { GET } from "./route";

const notesMock = vi.mocked(getVaultNotes);
const noteMock = vi.mocked(getVaultNote);
function req(auth: string | undefined, slug?: string) {
  const u = new URL("http://localhost/api/v1/arc/vault"); if (slug) u.searchParams.set("slug", slug);
  return new Request(u, { headers: { ...(auth ? { authorization: auth } : {}) } });
}
const env = { ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
function configure() { process.env.ARC_AGENT_API_TOKEN = "secret"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; }
beforeEach(() => {
  notesMock.mockReset(); noteMock.mockReset();
  notesMock.mockResolvedValue({ status: "live", notes: [{ slug: "n1", title: "Note 1" }] } as never);
  noteMock.mockResolvedValue({ slug: "n1", title: "Note 1" } as never);
});
afterEach(() => { for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("GET /api/v1/arc/vault", () => {
  it("401s without a valid token", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(notesMock).not.toHaveBeenCalled();
  });
  it("lists notes when no slug", async () => {
    configure();
    expect(await (await GET(req("Bearer secret"))).json()).toMatchObject({ ok: true, notes: [{ slug: "n1" }] });
  });
  it("returns a single note for ?slug=", async () => {
    configure();
    const res = await GET(req("Bearer secret", "n1"));
    expect(await res.json()).toMatchObject({ ok: true, note: { slug: "n1" } });
    expect(noteMock).toHaveBeenCalledWith("n1");
  });
  it("404s when the slug is not found", async () => {
    configure(); noteMock.mockResolvedValue(null as never);
    expect((await GET(req("Bearer secret", "missing"))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Route**

```typescript
import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { getVaultNote, getVaultNotes } from "@/lib/vault/read-model";

/**
 * Arc's vault knowledge. List all notes, or one note via ?slug=.
 *   GET /api/v1/arc/vault            ->  { ok, notes }
 *   GET /api/v1/arc/vault?slug=foo   ->  { ok, note } | 404
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const slug = new URL(request.url).searchParams.get("slug");
  try {
    if (slug) {
      const note = await getVaultNote(slug);
      if (!note) return fail("not_found", `No vault note for slug "${slug}".`, 404);
      return ok({ note });
    }
    const model = await getVaultNotes();
    return ok({ notes: model.notes });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read the vault.", 502);
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/app/api/v1/arc/vault && git commit -m "feat(arc): GET /vault (list + slug detail) for Arc"`

---

## Task 4: `GET /api/v1/arc/activity`

**Files:** Create `src/app/api/v1/arc/activity/route.ts` + `route.test.ts`

- [ ] **Step 1: Test**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/activity/read-model", () => ({ getRecentActivity: vi.fn() }));
import { getRecentActivity } from "@/lib/activity/read-model";
import { GET } from "./route";

const mock = vi.mocked(getRecentActivity);
function req(auth?: string) { return new Request("http://localhost/api/v1/arc/activity", { headers: { ...(auth ? { authorization: auth } : {}) } }); }
const env = { ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
function configure() { process.env.ARC_AGENT_API_TOKEN = "secret"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; }
beforeEach(() => { mock.mockReset(); mock.mockResolvedValue({ status: "live", entries: [{ id: "e1" }], summary: { total: 1 }, groups: [] } as never); });
afterEach(() => { for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("GET /api/v1/arc/activity", () => {
  it("401s without a valid token and never reads", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });
  it("returns recent activity entries + summary", async () => {
    configure();
    expect(await (await GET(req("Bearer secret"))).json()).toMatchObject({ ok: true, entries: [{ id: "e1" }], summary: { total: 1 } });
  });
  it("502s when activity is unavailable", async () => {
    configure(); mock.mockResolvedValue({ status: "unavailable", message: "no db" } as never);
    expect((await GET(req("Bearer secret"))).status).toBe(502);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Route**

```typescript
import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { getRecentActivity } from "@/lib/activity/read-model";

/**
 * Recent cross-system activity (timeline) for Arc's situational awareness.
 *   GET /api/v1/arc/activity  ->  { ok, entries, summary }
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const data = await getRecentActivity();
    if (data.status !== "live") return fail("failed", data.message ?? "Activity is unavailable.", 502);
    return ok({ entries: data.entries, summary: data.summary });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read activity.", 502);
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/app/api/v1/arc/activity && git commit -m "feat(arc): GET /activity for Arc"`

---

## Task 5: Runner tools + registration + prompt

**Files:** Create `apps/arc-runner/src/tools/intelligence.ts` + `intelligence.test.ts`; modify `tools/index.ts`, `prompt.ts`.

- [ ] **Step 1: Test (match the existing tool-handler invocation style — read `tools/cards.test.ts`/`brand.test.ts` to confirm how `.handler` is called, and mirror it)**

```typescript
// apps/arc-runner/src/tools/intelligence.test.ts
import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "../arc-client";
import { intelligenceTools } from "./intelligence";

const noStep = async () => {};
function byName(client: ArcClient) {
  return Object.fromEntries(intelligenceTools(client, noStep).map((t) => [t.name, t]));
}

describe("intelligenceTools", () => {
  it("list_opportunities calls the opportunities route", async () => {
    const client = { apiGet: vi.fn(async () => ({ ok: true, opportunities: [{ id: "o1" }] })) } as unknown as ArcClient;
    const tools = byName(client);
    const res = await /* INVOKE tools.list_opportunities handler with {} per existing pattern */;
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/opportunities");
    expect(res.content[0].text).toContain("o1");
  });
  it("get_vault_note passes the slug", async () => {
    const client = { apiGet: vi.fn(async () => ({ ok: true, note: { slug: "n1" } })) } as unknown as ArcClient;
    const tools = byName(client);
    await /* INVOKE tools.get_vault_note handler with { slug: "n1" } */;
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/vault", { slug: "n1" });
  });
  it("exposes all five tools", () => {
    const names = intelligenceTools({} as ArcClient, noStep).map((t) => t.name).sort();
    expect(names).toEqual(["get_vault_note", "list_opportunities", "list_vault_notes", "read_persona_intelligence", "read_recent_activity"]);
  });
});
```
Replace the two `/* INVOKE ... */` with the real handler-call expression used by the existing tool tests.

- [ ] **Step 2: Run → FAIL** (`pnpm --filter @bsr/arc-runner exec vitest run src/tools/intelligence.test.ts`).

- [ ] **Step 3: Write `apps/arc-runner/src/tools/intelligence.ts`**

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Read-only "vision" tools: let Arc see the opportunity inbox, persona
 * intelligence, the vault, and the activity timeline. Available in every mode;
 * each calls the app's bearer-gated /api/v1/arc/* route. No writes.
 */
export function intelligenceTools(client: ArcClient, step: StepFn) {
  const listOpportunities = tool(
    "list_opportunities",
    "List the open opportunity inbox (source-backed opportunities Arc could act on: pending / drafting / drafted). Use to survey or triage what's waiting before drafting.",
    {},
    async () => runTool(step, "Reading opportunities", () => client.apiGet("/api/v1/arc/opportunities")),
  );

  const readPersonaIntelligence = tool(
    "read_persona_intelligence",
    "Read the Persona Revenue Intelligence overview — persona segments, scores, signals, and persisted knowledge. Use when reasoning about which persona to target or how a segment is trending.",
    {},
    async () => runTool(step, "Reading persona intelligence", () => client.apiGet("/api/v1/arc/persona-intelligence")),
  );

  const listVaultNotes = tool(
    "list_vault_notes",
    "List the vault notes (the operator's Obsidian-style knowledge base). Use to find relevant notes; then get_vault_note for the full text of one.",
    {},
    async () => runTool(step, "Reading vault notes", () => client.apiGet("/api/v1/arc/vault")),
  );

  const getVaultNote = tool(
    "get_vault_note",
    "Read one vault note in full by its slug (from list_vault_notes).",
    { slug: z.string().describe("The note slug.") },
    async (args) => runTool(step, "Reading vault note", () => client.apiGet("/api/v1/arc/vault", { slug: args.slug })),
  );

  const readRecentActivity = tool(
    "read_recent_activity",
    "Read the recent cross-system activity timeline (what's happened across CRM, campaigns, approvals). Use for situational awareness — what changed lately.",
    {},
    async () => runTool(step, "Reading activity", () => client.apiGet("/api/v1/arc/activity")),
  );

  return [listOpportunities, readPersonaIntelligence, listVaultNotes, getVaultNote, readRecentActivity];
}
```

- [ ] **Step 4: Register in `tools/index.ts`**

Add the import near the other tool imports:
```typescript
import { intelligenceTools } from "./intelligence";
```
In `readTools(...)`, add the intelligence tools (they need `client` + `step`, not the sink). The current `readTools` signature is `readTools(client, step, sink)`; spread the new tools into its returned array, e.g.:
```typescript
function readTools(client: ArcClient, step: StepFn, sink: TurnSink) {
  return [
    ...crmReadTools(client, step),
    ...brainReadTools(client, step),
    ...campaignReadTools(client, step),
    ...performanceReadTools(client, step),
    ...intelligenceTools(client, step),
    emitCardTool(sink.card),
    suggestFollowupsTool(sink.suggestion),
    citeSourcesTool(sink.source),
    askOperatorTool(sink.question),
  ];
}
```
(Match the file's actual current `readTools` body — only INSERT the `...intelligenceTools(client, step),` line alongside the other read-tool spreads; preserve the rest.) `allowedToolNames` derives from the same source, so the five tools are auto-allowed in every mode.

- [ ] **Step 5: Prompt mention in `prompt.ts`**

Add to `ARC_SYSTEM_PROMPT` (near the Tools/capabilities area):
```
You can also see beyond CRM and campaigns: list_opportunities (the opportunity inbox), read_persona_intelligence (persona segments/scores/signals), list_vault_notes + get_vault_note (the knowledge vault), and read_recent_activity (what's changed lately). Use them to ground decisions in the current state before recommending or drafting.
```

- [ ] **Step 6: Run tool test + typecheck**

Run: `pnpm --filter @bsr/arc-runner exec vitest run src/tools/intelligence.test.ts` → PASS.
Run: `pnpm --filter @bsr/arc-runner typecheck` → clean.

- [ ] **Step 7: Run the full runner suite** (the `index.test.ts` likely asserts the ask/read tool-name set — update it to include the five new names if it fails)

Run: `pnpm --filter @bsr/arc-runner test`
Expected: all pass. If `index.test.ts` snapshots the read-mode tool list, add `list_opportunities`, `read_persona_intelligence`, `list_vault_notes`, `get_vault_note`, `read_recent_activity` to its expected set (mirrors the SP1 brand-tools update) and re-run.

- [ ] **Step 8: Commit**

```bash
git add apps/arc-runner/src/tools/intelligence.ts apps/arc-runner/src/tools/intelligence.test.ts apps/arc-runner/src/tools/index.ts apps/arc-runner/src/tools/index.test.ts apps/arc-runner/src/prompt.ts
git commit -m "feat(arc): runner read-tools for opportunities, persona-intel, vault, activity"
```

---

## Task 6: Sweep + build

- [ ] **Step 1: App route tests**

Run: `pnpm test src/app/api/v1/arc/opportunities src/app/api/v1/arc/persona-intelligence src/app/api/v1/arc/vault src/app/api/v1/arc/activity`
Expected: all pass.

- [ ] **Step 2: Runner suite**

Run: `pnpm --filter @bsr/arc-runner test`
Expected: all pass (intelligence + index + existing).

- [ ] **Step 3: Production build (the real typecheck gate)**

Run: `pnpm build`
Expected: succeeds. If `node_modules` is missing deps, `pnpm install` first. Fix only feature-caused failures.

- [ ] **Step 4: Final commit (if fixups)**

```bash
git add -A
git commit -m "test(arc): intelligence-reads verification fixups"
```

---

## Self-Review (plan author)

- **Spec coverage:** opportunities → Task 1; persona-intelligence → Task 2; vault (list + slug) → Task 3; activity → Task 4; runner tools (5) + registration + prompt → Task 5; sweep + build → Task 6. All 4 surfaces + tools covered.
- **Refinement vs spec:** `list_opportunities` takes no filter args (the read-model `listOpenOpportunities` has none) — simpler than the spec's "status/persona filters"; noted. Vault yields **two** tools (list + detail) → 5 tools total, matching the spec's intent.
- **Placeholder scan:** none, except the two explicit `/* INVOKE ... */` markers in Task 5 Step 1 — a deliberate "confirm against the existing tool-test handler-call style" instruction with the exact substitution stated, not a vague TODO.
- **Type consistency:** routes call the verified read-model signatures (`listOpenOpportunities()`, `getPersonaIntelligenceData()`, `getVaultNotes()`/`getVaultNote(slug)`, `getRecentActivity()`) and unwrap their real return shapes (array; `{status:"unavailable"}` union; `{status,notes}`; `{status:"live",entries,summary,groups}` union). Tool names are identical across `intelligence.ts`, its test, the `index.ts` registration, and the prompt. `client.apiGet(path, params?)` matches the runner client.
- **Deploy/safety:** read-only, all-mode, bounded via `runTool`; app routes (Vercel) + runner (`apps/arc-runner/**` → Cloud Build trigger). No writes/outbound.
```

# Arc Cross-Chat Recall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically inject a bounded "memory" block of the org's durable brain knowledge (trusted + observed nodes; hybrid core + keyword top-up) into every Arc turn, and nudge Arc to record durable learnings — so Arc remembers across chats.

**Architecture:** Mirrors the shipped brand-context wiring: pure ranking in `src/domain` → I/O assembly in `src/lib/knowledge-graph` → a bearer-gated `POST /api/v1/arc/brain/recall` route → the runner fetches it per turn and renders a `memoryBlock` in the system prompt, with graceful empty-on-error fallback. Capture is a prompt nudge reusing the existing `record_brain_note` tool — no new pipeline.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Vitest, `@anthropic-ai/claude-agent-sdk`, Supabase (service-role, via the existing `@/lib/knowledge-graph` read-model).

**Test commands:**
- App (domain/lib/routes) — from repo root: `pnpm test <path>`
- Runner — from repo root: `pnpm --filter @bsr/arc-runner exec vitest run <path>`

**Reuse (do NOT rebuild):** `@/lib/knowledge-graph/read-model` `listNodes(filters, client?, orgId?)` (returns `{status:"live", nodes: BrainNode[]} | {status:"unavailable", message}`; orders newest-updated first; **a filtered read avoids the empty-brain demo fallback**); `@/domain` `TrustTier`; `@/lib/auth/org` `getCurrentOrgId`; `@/app/api/v1/arc/_lib/http` `guard`/`ok`/`fail`/`readJson`/`INVALID_JSON`; runner `ArcClient.apiPost`; `buildSystemPrompt`/`ArcTurnContext` in `apps/arc-runner/src/context.ts`.

**Key constraint:** recall must NEVER inject `proposed` (unapproved), `rejected`, or `archived` nodes — only `trusted` + `observed`. And it must avoid `listNodes({})` unfiltered (which returns demo nodes when the brain is empty); use per-tier filtered reads.

---

## File Structure

- `src/domain/brain-recall.ts` — pure ranking: `RecallCandidate`, `RecallItem`, `rankRecall`. (+ test)
- `src/domain/index.ts` — re-export `./brain-recall`. (modify)
- `src/lib/knowledge-graph/recall.ts` — `getRecallMemory(orgId, message, client?)`: fetch trusted+observed, map, rank. (+ test)
- `src/app/api/v1/arc/brain/recall/route.ts` — `POST` returns ranked memory for the current org. (+ test)
- `apps/arc-runner/src/recall.ts` — `RecallItem` type + `resolveRecallMemory(client, message)`. (+ test)
- `apps/arc-runner/src/context.ts` — add `memory` to `ArcTurnContext` + `memoryBlock` + include in `buildSystemPrompt`. (modify; + test)
- `apps/arc-runner/src/arc.ts` — fetch recall in both entry points, thread into ctx. (modify)
- `apps/arc-runner/src/prompt.ts` — capture nudge. (modify)

---

## Task 1: Pure recall ranking (domain)

**Files:**
- Create: `src/domain/brain-recall.ts`
- Modify: `src/domain/index.ts`
- Test: `src/domain/__tests__/brain-recall.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/brain-recall.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { rankRecall, type RecallCandidate } from "../brain-recall";

function cand(id: string, label: string, extra: Partial<RecallCandidate> = {}): RecallCandidate {
  return { id, kind: "learning", label, summary: null, tags: [], trustTier: "trusted", ...extra };
}

describe("rankRecall", () => {
  it("returns the core set in input order, capped by coreLimit", () => {
    const c = [cand("1", "A"), cand("2", "B"), cand("3", "C")];
    const out = rankRecall(c, "", { coreLimit: 2, matchLimit: 0, cap: 15 });
    expect(out.map((r) => r.label)).toEqual(["A", "B"]);
  });

  it("adds keyword top-up matches beyond the core set", () => {
    const c = [
      cand("1", "Core one"),
      cand("2", "Core two"),
      cand("3", "Water damage angle", { summary: "use the flood response proof point" }),
      cand("4", "Unrelated node"),
    ];
    const out = rankRecall(c, "What's our best flood messaging?", { coreLimit: 2, matchLimit: 5, cap: 15 });
    const labels = out.map((r) => r.label);
    expect(labels).toContain("Core one");
    expect(labels).toContain("Core two");
    expect(labels).toContain("Water damage angle"); // matched "flood" in summary
    expect(labels).not.toContain("Unrelated node");
  });

  it("does not duplicate a node that is already in core", () => {
    const c = [cand("1", "flood angle"), cand("2", "B")];
    const out = rankRecall(c, "flood", { coreLimit: 2, matchLimit: 5, cap: 15 });
    expect(out.filter((r) => r.label === "flood angle")).toHaveLength(1);
  });

  it("never exceeds the cap", () => {
    const c = Array.from({ length: 30 }, (_, i) => cand(String(i), `node ${i} flood`));
    const out = rankRecall(c, "flood", { coreLimit: 10, matchLimit: 5, cap: 12 });
    expect(out.length).toBeLessThanOrEqual(12);
  });

  it("empty message yields core only", () => {
    const c = [cand("1", "A"), cand("2", "B flood")];
    const out = rankRecall(c, "", { coreLimit: 1, matchLimit: 5, cap: 15 });
    expect(out.map((r) => r.label)).toEqual(["A"]);
  });

  it("empty candidates yields empty", () => {
    expect(rankRecall([], "anything")).toEqual([]);
  });

  it("maps to RecallItem shape (label, summary, kind)", () => {
    const out = rankRecall([cand("1", "A", { summary: "s", kind: "proof_point" })], "");
    expect(out[0]).toEqual({ label: "A", summary: "s", kind: "proof_point" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/domain/__tests__/brain-recall.test.ts`
Expected: FAIL — `Cannot find module '../brain-recall'`.

- [ ] **Step 3: Write the module**

Create `src/domain/brain-recall.ts`:

```typescript
/**
 * Pure ranking for Arc's cross-chat "memory" block. No I/O. Candidates arrive in
 * priority order (trusted before observed, newest-updated first within tier — the
 * caller fetches them that way). Returns the core set (top by that order) plus
 * keyword top-up matches against the operator message, deduped by id and capped.
 */

export type RecallCandidate = {
  id: string;
  kind: string;
  label: string;
  summary: string | null;
  tags: string[];
  trustTier: string;
};

/** A prompt-ready memory line. */
export type RecallItem = { label: string; summary: string | null; kind: string };

export type RankRecallOptions = { coreLimit?: number; matchLimit?: number; cap?: number };

const STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "our", "with", "this", "that", "have", "has", "are",
  "was", "can", "will", "what", "when", "how", "why", "who", "does", "did", "from", "into",
  "about", "need", "want", "please", "arc", "let", "get", "got", "make", "made", "just",
  "they", "them", "there", "here", "out", "use", "using", "best",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function candidateText(c: RecallCandidate): string {
  return [c.label, c.summary ?? "", c.tags.join(" ")].join(" ").toLowerCase();
}

export function rankRecall(
  candidates: RecallCandidate[],
  message: string,
  options: RankRecallOptions = {},
): RecallItem[] {
  const coreLimit = options.coreLimit ?? 10;
  const matchLimit = options.matchLimit ?? 5;
  const cap = options.cap ?? 15;

  const core = candidates.slice(0, coreLimit);
  const coreIds = new Set(core.map((c) => c.id));

  const tokens = [...new Set(tokenize(message))];
  const matches =
    tokens.length === 0
      ? []
      : candidates
          .filter((c) => !coreIds.has(c.id))
          .map((c) => {
            const text = candidateText(c);
            const score = tokens.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
            return { c, score };
          })
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score) // Array.sort is stable: ties keep input (priority/recency) order
          .slice(0, matchLimit)
          .map((s) => s.c);

  return [...core, ...matches]
    .slice(0, cap)
    .map((c) => ({ label: c.label, summary: c.summary, kind: c.kind }));
}
```

- [ ] **Step 4: Re-export from the domain barrel**

In `src/domain/index.ts`, add next to the other `export *` lines (e.g. after `export * from "./knowledge-graph";`):

```typescript
export * from "./brain-recall";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/domain/__tests__/brain-recall.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain/brain-recall.ts src/domain/__tests__/brain-recall.test.ts src/domain/index.ts
git commit -m "feat(domain): rankRecall — pure core + keyword recall ranking"
```

---

## Task 2: Recall assembly (lib I/O)

**Files:**
- Create: `src/lib/knowledge-graph/recall.ts`
- Test: `src/lib/knowledge-graph/__tests__/recall.test.ts`

Note: check whether `src/lib/knowledge-graph/__tests__/` exists; if not, create it (other tests in this dir may live alongside the files — if so, put the test at `src/lib/knowledge-graph/recall.test.ts` to match the local convention). Inspect the directory first and follow what's there.

- [ ] **Step 1: Write the failing test**

Create the test (path per the note above):

```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("../read-model", () => ({ listNodes: vi.fn() }));

import { listNodes } from "../read-model";
import { getRecallMemory } from "../recall";

const listMock = vi.mocked(listNodes);

function node(id: string, label: string, trustTier: string) {
  return {
    id, kind: "learning", label, body: null, summary: null, persona: null,
    trustTier, confidence: null, refTable: null, refId: null, source: null,
    tags: [], createdBy: null, createdAt: null,
  };
}

describe("getRecallMemory", () => {
  it("queries trusted and observed tiers and ranks them (trusted first)", async () => {
    listMock.mockImplementation(async (filters) => {
      if (filters?.trustTier === "trusted") return { status: "live", nodes: [node("t1", "Trusted fact", "trusted")] } as never;
      if (filters?.trustTier === "observed") return { status: "live", nodes: [node("o1", "Observed learning", "observed")] } as never;
      return { status: "live", nodes: [] } as never;
    });
    const out = await getRecallMemory("org_1", "");
    expect(listMock).toHaveBeenCalledWith({ trustTier: "trusted" }, undefined, "org_1");
    expect(listMock).toHaveBeenCalledWith({ trustTier: "observed" }, undefined, "org_1");
    expect(out.map((r) => r.label)).toEqual(["Trusted fact", "Observed learning"]);
  });

  it("never queries proposed/rejected/archived tiers", async () => {
    listMock.mockResolvedValue({ status: "live", nodes: [] } as never);
    await getRecallMemory("org_1", "hello");
    const tiers = listMock.mock.calls.map((c) => c[0]?.trustTier);
    expect(tiers).toEqual(expect.arrayContaining(["trusted", "observed"]));
    expect(tiers).not.toContain("proposed");
    expect(tiers).not.toContain("rejected");
    expect(tiers).not.toContain("archived");
  });

  it("returns [] when a tier read is unavailable", async () => {
    listMock.mockResolvedValue({ status: "unavailable", message: "down" } as never);
    expect(await getRecallMemory("org_1", "x")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/knowledge-graph/__tests__/recall.test.ts` (or the path you chose)
Expected: FAIL — `Cannot find module '../recall'`.

- [ ] **Step 3: Write the module**

Create `src/lib/knowledge-graph/recall.ts`:

```typescript
import { rankRecall, type RecallCandidate, type RecallItem } from "@/domain";
import { type TypedSupabaseClient } from "@/lib/supabase/server";

import { listNodes } from "./read-model";

/**
 * Assemble the bounded "memory" Arc recalls each turn: the org's trusted +
 * observed brain nodes, ranked (core + keyword top-up vs `message`). Uses
 * per-tier filtered reads — never the unfiltered listNodes({}) (which would fall
 * back to demo nodes on an empty brain) and never proposed/rejected/archived
 * (proposed is unapproved and must not steer Arc). Empty on any unavailable read.
 */
export async function getRecallMemory(
  orgId: string,
  message: string,
  client?: TypedSupabaseClient,
): Promise<RecallItem[]> {
  const [trusted, observed] = await Promise.all([
    listNodes({ trustTier: "trusted" }, client, orgId),
    listNodes({ trustTier: "observed" }, client, orgId),
  ]);
  if (trusted.status !== "live" || observed.status !== "live") return [];

  const candidates: RecallCandidate[] = [...trusted.nodes, ...observed.nodes].map((n) => ({
    id: n.id,
    kind: n.kind,
    label: n.label,
    summary: n.summary,
    tags: n.tags,
    trustTier: n.trustTier,
  }));
  return rankRecall(candidates, message);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/knowledge-graph/__tests__/recall.test.ts` (or your path)
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge-graph/recall.ts src/lib/knowledge-graph/__tests__/recall.test.ts
git commit -m "feat(brain): getRecallMemory — trusted+observed, ranked, demo-safe"
```

---

## Task 3: `POST /api/v1/arc/brain/recall` route

**Files:**
- Create: `src/app/api/v1/arc/brain/recall/route.ts`
- Test: `src/app/api/v1/arc/brain/recall/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/arc/brain/recall/route.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: vi.fn(async () => "org_1") }));
vi.mock("@/lib/knowledge-graph/recall", () => ({ getRecallMemory: vi.fn() }));

import { getRecallMemory } from "@/lib/knowledge-graph/recall";
import { POST } from "./route";

const recallMock = vi.mocked(getRecallMemory);

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/brain/recall", {
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
  recallMock.mockReset();
  recallMock.mockResolvedValue([{ label: "Trusted fact", summary: null, kind: "learning" }]);
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/v1/arc/brain/recall", () => {
  it("401s without a valid token and never reads", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await POST(req("Bearer wrong", { message: "x" }));
    expect(res.status).toBe(401);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("returns ranked memory for the current org", async () => {
    configure();
    const res = await POST(req("Bearer secret", { message: "flood help" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, memory: [{ label: "Trusted fact", kind: "learning" }] });
    expect(recallMock).toHaveBeenCalledWith("org_1", "flood help");
  });

  it("treats a missing message as empty and still returns core memory (200)", async () => {
    configure();
    const res = await POST(req("Bearer secret", {}));
    expect(res.status).toBe(200);
    expect(recallMock).toHaveBeenCalledWith("org_1", "");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/api/v1/arc/brain/recall/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the route**

Create `src/app/api/v1/arc/brain/recall/route.ts`:

```typescript
import { INVALID_JSON, fail, guard, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getRecallMemory } from "@/lib/knowledge-graph/recall";

/**
 * The org's durable "memory" for Arc to recall this turn — trusted + observed
 * brain nodes, ranked (core + keyword top-up against `message`). The runner
 * fetches this each turn and injects it into the system prompt. Read-only.
 * `message` is optional (an empty message still returns the core set).
 *
 *   POST /api/v1/arc/brain/recall  { message?, limit? }  ->  { ok, memory }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const message =
    typeof (payload as Record<string, unknown>).message === "string"
      ? ((payload as Record<string, unknown>).message as string)
      : "";

  try {
    const memory = await getRecallMemory(await getCurrentOrgId(), message);
    return ok({ memory });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to load recall memory.", 502);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/api/v1/arc/brain/recall/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/arc/brain/recall
git commit -m "feat(arc): POST /brand|brain/recall returns ranked durable memory"
```

---

## Task 4: Runner — fetch recall + render the memory block

**Files:**
- Create: `apps/arc-runner/src/recall.ts`
- Modify: `apps/arc-runner/src/context.ts`
- Modify: `apps/arc-runner/src/arc.ts`
- Test: `apps/arc-runner/src/recall.test.ts`, `apps/arc-runner/src/context.memory.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/arc-runner/src/recall.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { resolveRecallMemory } from "./recall";
import type { ArcClient } from "./arc-client";

describe("resolveRecallMemory", () => {
  it("returns the fetched memory list", async () => {
    const memory = [{ label: "Flood angle", summary: "use proof X", kind: "messaging_angle" }];
    const client = { apiPost: vi.fn(async () => ({ memory })) } as unknown as ArcClient;
    const out = await resolveRecallMemory(client, "flood?");
    expect(out).toEqual(memory);
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/brain/recall", { message: "flood?" });
  });

  it("returns [] when the fetch throws", async () => {
    const client = { apiPost: vi.fn(async () => { throw new Error("boom"); }) } as unknown as ArcClient;
    expect(await resolveRecallMemory(client, "x")).toEqual([]);
  });

  it("returns [] when memory is missing/not an array", async () => {
    const client = { apiPost: vi.fn(async () => ({})) } as unknown as ArcClient;
    expect(await resolveRecallMemory(client, "x")).toEqual([]);
  });
});
```

Create `apps/arc-runner/src/context.memory.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, type ArcTurnContext } from "./context";
import { BSR_CONTEXT } from "./business-context";

function ctx(memory: ArcTurnContext["memory"]): ArcTurnContext {
  return {
    business: BSR_CONTEXT,
    mode: "ask",
    scope: { conversationId: "c1", projectId: null, campaignId: null, operator: "ev" },
    mentions: [],
    memory,
  };
}

describe("memory block in buildSystemPrompt", () => {
  it("renders recalled memory lines when present", () => {
    const prompt = buildSystemPrompt("BASE", ctx([
      { label: "Flood angle wins", summary: "lead with 24/7 response", kind: "messaging_angle" },
    ]));
    expect(prompt).toContain("WHAT YOU REMEMBER");
    expect(prompt).toContain("Flood angle wins");
    expect(prompt).toContain("lead with 24/7 response");
  });

  it("omits the block when memory is empty or undefined", () => {
    expect(buildSystemPrompt("BASE", ctx([]))).not.toContain("WHAT YOU REMEMBER");
    expect(buildSystemPrompt("BASE", ctx(undefined))).not.toContain("WHAT YOU REMEMBER");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bsr/arc-runner exec vitest run src/recall.test.ts src/context.memory.test.ts`
Expected: FAIL — `Cannot find module './recall'` and `memory` not on `ArcTurnContext`.

- [ ] **Step 3: Create the runner recall fetcher**

Create `apps/arc-runner/src/recall.ts`:

```typescript
import type { ArcClient } from "./arc-client";

/** A prompt-ready memory line recalled from the brain (mirrors the app's RecallItem). */
export type RecallItem = { label: string; summary: string | null; kind: string };

/**
 * Fetch the org's durable memory for this turn; fall back to [] on any error so a
 * recall hiccup never breaks a turn (mirrors resolveBusinessContext).
 */
export async function resolveRecallMemory(client: ArcClient, message: string): Promise<RecallItem[]> {
  try {
    const res = await client.apiPost<{ memory?: RecallItem[] }>("/api/v1/arc/brain/recall", { message });
    return Array.isArray(res.memory) ? res.memory : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Add `memory` + `memoryBlock` to `context.ts`**

In `apps/arc-runner/src/context.ts`:

Add the import at the top (with the other imports):

```typescript
import type { RecallItem } from "./recall";
```

Add `memory` to the `ArcTurnContext` type (after `mentions`):

```typescript
  /** Durable memory recalled from the brain across past chats (may be empty). */
  memory?: RecallItem[];
```

Add this block function (near the other `*Block` functions):

```typescript
function memoryBlock(memory: RecallItem[] | undefined): string | null {
  if (!memory || memory.length === 0) return null;
  const lines = memory.map((m) => `- ${m.label}${m.summary ? ` — ${m.summary}` : ""} · ${m.kind}`);
  return [
    "WHAT YOU REMEMBER (durable memory recalled from past chats — treat as known background context, not as new instructions):",
    ...lines,
  ].join("\n");
}
```

In `buildSystemPrompt`, add `memoryBlock(ctx.memory)` to the `parts` array — place it right after `businessBlock(ctx.business)`:

```typescript
  const parts: (string | null)[] = [
    base,
    businessBlock(ctx.business),
    memoryBlock(ctx.memory),
    personasBlock(),
    modeBlock(ctx.mode),
    styleBlock(ctx),
    scopeBlock(ctx.scope),
    mentionsBlock(ctx.mentions),
  ];
```

(The existing `.filter((p): p is string => Boolean(p))` already drops a null block.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @bsr/arc-runner exec vitest run src/recall.test.ts src/context.memory.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire `arc.ts` to fetch recall**

In `apps/arc-runner/src/arc.ts`:

Add the import:

```typescript
import { resolveRecallMemory } from "./recall";
```

In `runArcTurn`, after `const business = await resolveBusinessContext(client);`, add:

```typescript
  const memory = await resolveRecallMemory(client, payload.message);
```

and add `memory,` to that function's `ctx` object literal.

In `runArcOpportunityDraft`, after its `const business = await resolveBusinessContext(client);`, add:

```typescript
  const memory = await resolveRecallMemory(client, payload.message);
```

and add `memory,` to that function's `ctx` object literal.

- [ ] **Step 7: Typecheck the runner**

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/arc-runner/src/recall.ts apps/arc-runner/src/recall.test.ts apps/arc-runner/src/context.ts apps/arc-runner/src/context.memory.test.ts apps/arc-runner/src/arc.ts
git commit -m "feat(arc): runner fetches recall memory + renders memory block each turn"
```

---

## Task 5: Capture nudge (prompt)

**Files:**
- Modify: `apps/arc-runner/src/prompt.ts`

- [ ] **Step 1: Read the prompt**

Open `apps/arc-runner/src/prompt.ts`. Find `ARC_SYSTEM_PROMPT` and the area describing brain/learning behavior (the brand-learning paragraph added previously, or the part about recording notes / using `record_brain_note`).

- [ ] **Step 2: Add the capture-nudge sentence**

Add this to `ARC_SYSTEM_PROMPT`, integrated cleanly with surrounding style (its own short paragraph/bullet, matching the file's convention):

```
Memory: you are shown "WHAT YOU REMEMBER" — durable facts and learnings recalled from past chats. Use it as background. At the end of a substantive turn, record any new durable learning or signal worth remembering via record_brain_note (learnings/signals are stored internally; brand facts, CTAs, angles, and proof points go to the approval queue) so future chats remember it.
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: no errors.

```bash
git add apps/arc-runner/src/prompt.ts
git commit -m "feat(arc): prompt nudge to record durable learnings for cross-chat memory"
```

---

## Task 6: Full sweep + build

- [ ] **Step 1: App tests (domain + lib + route)**

Run: `pnpm test src/domain/__tests__/brain-recall.test.ts src/lib/knowledge-graph src/app/api/v1/arc/brain/recall`
Expected: all pass.

- [ ] **Step 2: Runner suite**

Run: `pnpm --filter @bsr/arc-runner test`
Expected: all pass (including the new `recall` + `context.memory` tests; the existing `context.test.ts` still passes because `memory` is optional).

- [ ] **Step 3: Production build (the real typecheck gate)**

Run: `pnpm build`
Expected: build succeeds. (`pnpm lint` is eslint-only and does not typecheck.) If `node_modules` is missing workspace deps, run `pnpm install` first. If the build fails, determine whether it's caused by this feature (`src/domain/brain-recall.ts`, `src/lib/knowledge-graph/recall.ts`, `src/app/api/v1/arc/brain/recall/`, `apps/arc-runner/src/`) or pre-existing/unrelated — fix only feature-caused failures.

- [ ] **Step 4: Final commit (if any fixups)**

```bash
git add -A
git commit -m "test(arc): cross-chat recall verification fixups"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** recall selection (core + keyword) → Task 1; trusted+observed-only assembly, demo-safe → Task 2; route → Task 3; runner fetch + memory block + both entry points → Task 4; capture nudge → Task 5; testing + build → Task 6. All spec sections covered. **Deviation from spec:** spec's testing bullet said "400 on missing message"; the route instead treats missing message as empty and returns the core set (200) — more robust, and the design body says an empty message still yields core. The plan's Task 3 test reflects this.
- **Refinement of spec:** spec §architecture (b) said `listNodes({})` then filter; the plan uses **per-tier filtered reads** (`trustTier: "trusted"` / `"observed"`) instead, to avoid the empty-brain demo fallback in `listNodes`. Functionally equivalent (trusted+observed only) and strictly safer. Noted in Task 2.
- **Placeholder scan:** no TBD/TODO; every code step is complete. The two "inspect the directory / find the prompt area" steps are concrete instructions with a stated fallback, not placeholders.
- **Type consistency:** `RecallCandidate`/`RecallItem`/`rankRecall` defined in Task 1, re-exported (Task 1 Step 4), consumed by `getRecallMemory` (Task 2) and the route (Task 3); the runner re-declares `RecallItem` locally (Task 4) per the runner's duplicate-contracts convention. `ArcTurnContext.memory?: RecallItem[]` added (Task 4) and consumed by `memoryBlock`. `getRecallMemory(orgId, message, client?)` signature matches its route call. `listNodes(filters, client?, orgId?)` calls match the real read-model signature.
- **Mode note:** recall is injected context (not a tool), so it appears in ask/act/draft alike — read-only and safe in ask mode. Capture (`record_brain_note`) remains act/draft only; the nudge is harmless in ask mode (the tool simply isn't available).
```

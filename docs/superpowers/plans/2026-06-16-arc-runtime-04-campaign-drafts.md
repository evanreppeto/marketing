# Arc Runtime — Plan 4: Agent-created campaign drafts (inline-approvable)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the last gap in the chat/approval loop: let Arc, in **draft** mode, create a real campaign draft asset that lands in the approval queue and is **inline-approvable from chat**. Adds one app endpoint (reusing existing campaign-creation persistence) and one draft-only runner tool that auto-attaches the approval card.

**Architecture:** New `POST /api/v1/arc/campaigns/draft-asset` reuses `createCampaignShell` (creates a `campaigns` shell when no `campaignId` is given) + `promoteAssetToCampaign` (creates a `campaign_assets` row + the linked `approval_items` gate), returning `{ campaignId, assetId }`. A new runner tool `create_campaign_draft` (draft mode only) calls it and auto-emits a draft action card carrying `approval { kind:"campaign", campaignId, assetId }` — so the operator gets inline Approve/Decline immediately. This is the first time `draft` mode has a tool `act` doesn't.

**Tech Stack:** Next.js 16 route + Supabase (app); TypeScript + Claude Agent SDK + Zod + Vitest (runner).

Plan 4 of the Arc runtime. Phase 1 (Plans 1–3) merged. After this, the chat→draft→approve loop is fully agent-driven for new assets.

**Why this is safe:** the created asset is `status: 'pending_approval'`, `dispatch_locked: true`, gated by an `approval_items` row — nothing goes outbound. Approve/Decline routes through the existing `decideAsset` ledger. The endpoint validates inputs and surfaces DB enum errors clearly.

**Prod-drift note:** `createCampaignShell`/`promoteAssetToCampaign` write to `campaigns`, `campaign_assets`, `approval_items`, `campaign_events` — NOT `campaign_audiences` (the table missing from prod), so that gap doesn't block this. One dependency: `campaign_events.event_type` must include `'asset_generated'` (migration `20260604120000_campaign_event_types.sql`). Verify that migration is applied to whatever DB this runs against (it must be for the existing campaign flow to work at all).

---

## File Structure
**App (`src/`):**
- Create `src/app/api/v1/arc/campaigns/draft-asset/route.ts` — the new POST endpoint.
- Create `src/app/api/v1/arc/campaigns/draft-asset/route.test.ts` — validation unit tests (mock the persistence).

**Runner (`apps/arc-runner/`):**
- Create `src/tools/drafts.ts` — `draftWorkProductTools(client, step, collectCard)` exposing `create_campaign_draft`.
- Create `src/tools/drafts.test.ts` — TDD: stubs `apiPost`, asserts it collects a draft card with the approval block and returns the ids.
- Modify `src/tools/index.ts` — add a `draftTools` tier (draft mode only) + thread `collectCard` to it; `draft` now = `act` + draft tier.
- Modify `src/tools/index.test.ts` — `draft` mode now includes `create_campaign_draft` (no longer equal to `act`).
- Modify `src/prompt.ts` — guidance: in draft mode Arc can create approval-gated campaign drafts.

---

## Task 1: App endpoint — `POST /api/v1/arc/campaigns/draft-asset`

**Files:** Create `src/app/api/v1/arc/campaigns/draft-asset/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from "next/server";

import { INVALID_JSON, fail, guard, readJson } from "@/app/api/v1/arc/_lib/http";
import { createCampaignShell, promoteAssetToCampaign } from "@/lib/campaigns/create";

/**
 * Lets Arc create an approval-gated campaign draft asset. If `campaign_id` is
 * given, the asset is attached to that campaign; otherwise a draft campaign
 * shell is created first (requires name/persona/restoration_focus). Reuses the
 * same persistence as the operator promote flow, so the asset gets a
 * campaign_assets row + an approval_items gate and is inline-approvable in chat.
 * Author is always "Arc". No outbound — the asset is pending_approval + locked.
 *
 *   POST /api/v1/arc/campaigns/draft-asset
 *   { campaign_id?, name?, persona?, restoration_focus?,
 *     asset_type, title, body?, media_url? }
 *   -> 201 { ok, status:"created", campaignId, assetId }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const body = payload as Record<string, unknown>;

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const campaignIdIn = str(body.campaign_id);
  const assetType = str(body.asset_type);
  const title = str(body.title);
  const draftBody = str(body.body) || null;
  const mediaUrl = str(body.media_url) || null;

  if (!assetType) return fail("rejected", "asset_type is required.", 400);
  if (!title) return fail("rejected", "title is required.", 400);

  const operator = "Arc";

  try {
    let campaignId = campaignIdIn;
    if (!campaignId) {
      const name = str(body.name);
      const persona = str(body.persona);
      const restorationFocus = str(body.restoration_focus);
      if (!name || !persona || !restorationFocus) {
        return fail(
          "rejected",
          "To create a new campaign, name, persona, and restoration_focus are required (or pass campaign_id to attach to an existing campaign).",
          400,
        );
      }
      const shell = await createCampaignShell({ operator, name, persona, restorationFocus, agentName: "Arc" });
      campaignId = shell.campaignId;
    }

    const asset = await promoteAssetToCampaign({
      operator,
      campaignId,
      assetType,
      title,
      body: draftBody,
      mediaUrl,
      agentName: "Arc",
    });

    return NextResponse.json(
      { ok: true, status: "created", campaignId, assetId: asset.assetId },
      { status: 201 },
    );
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to create campaign draft.", 502);
  }
}
```

- [ ] **Step 2: Typecheck** — `pnpm exec tsc --noEmit` → PASS.
- [ ] **Step 3: Commit** — `git add src/app/api/v1/arc/campaigns/draft-asset/route.ts && git commit -m "feat(arc-api): endpoint for agent-created campaign draft assets"`

---

## Task 2: App endpoint validation tests

**Files:** Create `src/app/api/v1/arc/campaigns/draft-asset/route.test.ts`

> Verify the validation branches without a live DB by mocking the persistence module and the auth/Supabase guards. Match the mocking style of the existing `src/app/api/v1/arc/drafts/route.test.ts` (read it first to mirror how it stubs `guard`/persistence). The exact `vi.mock` targets below assume `guard` resolves to `null` (authorized) and the create functions are mocked.

- [ ] **Step 1: Write the tests**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/app/api/v1/arc/_lib/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/v1/arc/_lib/http")>();
  return { ...actual, guard: vi.fn(async () => null) };
});

const createCampaignShell = vi.fn(async () => ({ campaignId: "camp_1" }));
const promoteAssetToCampaign = vi.fn(async () => ({ assetId: "asset_1" }));
vi.mock("@/lib/campaigns/create", () => ({ createCampaignShell, promoteAssetToCampaign }));

import { POST } from "./route";

function req(bodyObj: unknown): Request {
  return new Request("http://localhost/api/v1/arc/campaigns/draft-asset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
}

beforeEach(() => {
  createCampaignShell.mockClear();
  promoteAssetToCampaign.mockClear();
});

describe("POST /api/v1/arc/campaigns/draft-asset", () => {
  it("400s when asset_type or title is missing", async () => {
    const res = await POST(req({ title: "x" }));
    expect(res.status).toBe(400);
  });

  it("400s when creating a new campaign without name/persona/restoration_focus", async () => {
    const res = await POST(req({ asset_type: "social_ad", title: "Fall ad" }));
    expect(res.status).toBe(400);
    expect(createCampaignShell).not.toHaveBeenCalled();
  });

  it("creates a shell + asset and returns 201 with both ids", async () => {
    const res = await POST(
      req({
        asset_type: "social_ad",
        title: "Fall ad",
        body: "Before winter…",
        name: "Fall Water Push",
        persona: "persona_homeowner_emergency",
        restoration_focus: "water",
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, status: "created", campaignId: "camp_1", assetId: "asset_1" });
    expect(createCampaignShell).toHaveBeenCalledOnce();
    expect(promoteAssetToCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "camp_1", assetType: "social_ad", title: "Fall ad", operator: "Arc" }),
    );
  });

  it("attaches to an existing campaign without creating a shell", async () => {
    const res = await POST(req({ campaign_id: "camp_existing", asset_type: "email", title: "Reminder" }));
    expect(res.status).toBe(201);
    expect(createCampaignShell).not.toHaveBeenCalled();
    expect(promoteAssetToCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "camp_existing", assetType: "email" }),
    );
  });
});
```

- [ ] **Step 2: Run** — `pnpm test src/app/api/v1/arc/campaigns/draft-asset` → PASS. If the mock of `guard` doesn't take (e.g. the route imports `guard` differently), adjust the `vi.mock` to match `drafts/route.test.ts`'s working pattern. Do NOT weaken the assertions.
- [ ] **Step 3: Commit** — `git add src/app/api/v1/arc/campaigns/draft-asset/route.test.ts && git commit -m "test(arc-api): campaign draft-asset endpoint validation"`

---

## Task 3: Runner tool — `create_campaign_draft`

**Files:** Create `apps/arc-runner/src/tools/drafts.ts` and `apps/arc-runner/src/tools/drafts.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/arc-runner/src/tools/drafts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { draftWorkProductTools } from "./drafts";

function setup(apiPostImpl: () => Promise<unknown>) {
  const cards: ArcActionCard[] = [];
  const client = { apiPost: vi.fn(apiPostImpl) } as unknown as ArcClient;
  const step = vi.fn(async () => {});
  const [createDraft] = draftWorkProductTools(client, step, (c) => cards.push(c));
  const call = (args: Record<string, unknown>) =>
    (createDraft.handler as (a: Record<string, unknown>, e?: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>)(args);
  return { cards, client, call, createDraft };
}

describe("create_campaign_draft", () => {
  it("is named create_campaign_draft", () => {
    const { createDraft } = setup(async () => ({ campaignId: "c1", assetId: "a1" }));
    expect(createDraft.name).toBe("create_campaign_draft");
  });

  it("posts to the draft-asset endpoint and auto-emits a draft card with the approval block", async () => {
    const { cards, client, call } = setup(async () => ({ ok: true, campaignId: "c1", assetId: "a1" }));
    const out = await call({ asset_type: "social_ad", title: "Fall ad", body: "Before winter…", name: "Fall", persona: "persona_homeowner_emergency", restoration_focus: "water" });

    expect(client.apiPost).toHaveBeenCalledWith(
      "/api/v1/arc/campaigns/draft-asset",
      expect.objectContaining({ asset_type: "social_ad", title: "Fall ad" }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      kind: "draft",
      title: "Fall ad",
      approval: { kind: "campaign", campaignId: "c1", assetId: "a1" },
    });
    expect(out.content[0].text).toContain("a1");
  });

  it("does not emit a card when the create fails", async () => {
    const { cards, call } = setup(async () => {
      throw new Error("boom");
    });
    const out = await call({ asset_type: "social_ad", title: "Fall ad", campaign_id: "c1" });
    expect(cards).toHaveLength(0);
    expect(out.content[0].text).toContain("failed");
  });
});
```

- [ ] **Step 2: Run → FAIL** (`Cannot find module './drafts'`). `pnpm --filter @bsr/arc-runner test`

- [ ] **Step 3: Implement** `apps/arc-runner/src/tools/drafts.ts`:

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { textResult, type StepFn } from "./helpers";

/**
 * Draft work products (DRAFT mode only). `create_campaign_draft` creates a real,
 * approval-gated campaign asset (pending_approval, dispatch_locked) and auto-emits
 * a draft card carrying the inline Approve/Decline block. Nothing goes outbound;
 * the operator approves before anything is usable.
 */
export function draftWorkProductTools(
  client: ArcClient,
  step: StepFn,
  collectCard: (card: ArcActionCard) => void,
) {
  const createCampaignDraft = tool(
    "create_campaign_draft",
    "Create an approval-gated campaign DRAFT asset (e.g. social_ad, email, sms, image_prompt, landing_page, one_pager). Attach to an existing campaign with campaign_id, or create a new draft campaign by giving name + persona (use a persona key) + restoration_focus (water|flood|sewage|mold|fire|storm). The asset is created pending approval and surfaced with an inline Approve/Decline card — nothing is sent. Returns campaignId + assetId.",
    {
      campaign_id: z.string().optional().describe("Existing campaign to attach to; omit to create a new draft campaign"),
      name: z.string().optional().describe("New campaign name (required when campaign_id is omitted)"),
      persona: z.string().optional().describe("Persona key (required when creating a new campaign)"),
      restoration_focus: z
        .string()
        .optional()
        .describe("Loss focus: water|flood|sewage|mold|fire|storm (required when creating a new campaign)"),
      asset_type: z.string().describe("Asset type, e.g. social_ad | email | sms | image_prompt | landing_page | one_pager"),
      title: z.string().describe("Short title for the asset"),
      body: z.string().optional().describe("The draft copy/content"),
      media_url: z.string().optional().describe("Optional reference media URL"),
    },
    async (args) => {
      const label = "Creating campaign draft";
      await step(label, "running");
      try {
        const r = await client.apiPost<{ campaignId: string; assetId: string }>(
          "/api/v1/arc/campaigns/draft-asset",
          args,
        );
        await step(label, "done");
        collectCard({
          kind: "draft",
          title: args.title,
          rows: [],
          flags: [],
          ...(args.body ? { preview: args.body.slice(0, 280) } : {}),
          approval: { kind: "campaign", campaignId: r.campaignId, assetId: r.assetId },
        });
        return textResult(JSON.stringify({ campaignId: r.campaignId, assetId: r.assetId, status: "draft created, pending approval" }));
      } catch (error) {
        await step(label, "done");
        const reason = error instanceof Error ? error.message : "unknown error";
        return textResult(`${label} failed: ${reason}`);
      }
    },
  );

  return [createCampaignDraft];
}
```

- [ ] **Step 4: Run → PASS.** `pnpm --filter @bsr/arc-runner test`
- [ ] **Step 5: Commit** — `git add apps/arc-runner/src/tools/drafts.ts apps/arc-runner/src/tools/drafts.test.ts && git commit -m "feat(arc-runner): create_campaign_draft tool (auto-emits approval card)"`

---

## Task 4: Mode-gating — add the draft tier

**Files:** Modify `apps/arc-runner/src/tools/index.ts` and `apps/arc-runner/src/tools/index.test.ts`

- [ ] **Step 1: `index.ts`.** Import the new tool factory and add a draft-only tier.

Add import:
```ts
import { draftWorkProductTools } from "./drafts";
```

Add a `draftTools` helper after `writeTools`:
```ts
/** Draft work products: create approval-gated campaign assets. draft mode only. */
function draftTools(client: ArcClient, step: StepFn, collectCard: (card: ArcActionCard) => void) {
  return [...draftWorkProductTools(client, step, collectCard)];
}
```

Update `toolsForMode` so `draft` adds the draft tier on top of `act`:
```ts
export function toolsForMode(
  mode: ArcMode,
  client: ArcClient,
  step: StepFn,
  collectCard: (card: ArcActionCard) => void,
) {
  const read = readTools(client, step, collectCard);
  if (mode === "ask") return [...read];
  const write = writeTools(client, step);
  if (mode === "act") return [...read, ...write];
  // draft = read + write + draft work products
  return [...read, ...write, ...draftTools(client, step, collectCard)];
}
```

(`allowedToolNames` is unchanged — it already derives names from `toolsForMode` per mode.)

- [ ] **Step 2: `index.test.ts`.** `draft` mode now has one more tool than `act`. Add a `DRAFT` constant and update the draft test.

Add after the `WRITE` constant:
```ts
const DRAFT = ["create_campaign_draft"];
```

Replace the "draft mode … same as act" test with:
```ts
  it("draft mode adds draft work products on top of act", () => {
    const names = toolsForMode("draft", stubClient, step, collect).map((t) => t.name).sort();
    expect(names).toEqual([...READ, ...WRITE, ...DRAFT].sort());
  });
```

Also add an explicit guard that `act` does NOT include the draft tool:
```ts
  it("act mode does not include draft work products", () => {
    const names = toolsForMode("act", stubClient, step, collect).map((t) => t.name);
    expect(names).not.toContain("create_campaign_draft");
  });
```

- [ ] **Step 3: Run typecheck + tests** — both PASS. `pnpm --filter @bsr/arc-runner typecheck && pnpm --filter @bsr/arc-runner test`
- [ ] **Step 4: Commit** — `git add apps/arc-runner/src/tools/index.ts apps/arc-runner/src/tools/index.test.ts && git commit -m "feat(arc-runner): draft-mode tier (create_campaign_draft)"`

---

## Task 5: Prompt guidance

**Files:** Modify `apps/arc-runner/src/prompt.ts`

- [ ] **Step 1:** In the "Cards:" paragraph's vicinity (after it), add:

```
Drafting: in draft mode you can call \`create_campaign_draft\` to turn a proposed asset into a real, approval-gated campaign draft — it returns campaignId + assetId and automatically shows the operator an inline Approve/Decline card. Use this (rather than a plain draft card) when the operator asks you to draft/create a campaign asset, so they can approve it in one click. Still nothing goes outbound until they approve.
```

- [ ] **Step 2:** Typecheck — PASS.
- [ ] **Step 3:** Commit — `git add apps/arc-runner/src/prompt.ts && git commit -m "feat(arc-runner): prompt guidance for create_campaign_draft"`

---

## Task 6: Manual acceptance

Run app + runner (restart the runner to load Plan 4).

- [ ] **Step 1: Create a new campaign draft from chat.** In **draft** mode: `Draft a social ad for emergency homeowners about fast water-damage response, and create it as a campaign draft.`
  Expected: a `Creating campaign draft` step; Arc replies with a **draft card carrying an inline Approve/Decline tray**. A new campaign + pending asset appear in `/campaigns`.
- [ ] **Step 2: Approve inline.** Click **Approve** on the card → the asset flips to approved in `/campaigns` (real state via `decideAsset`).
- [ ] **Step 3: Mode gating.** In **act** mode, ask the same → Arc explains it can draft the copy but creating an approval-gated campaign asset needs draft mode (the `create_campaign_draft` tool isn't available in act). It must not claim to have created one.
- [ ] **Step 4: Attach to existing campaign.** With a campaign id, in draft mode: `Add an email asset to campaign <id>: a 2-line follow-up.` → a new pending asset on that campaign + an inline-approvable card.

> Prod-drift dependency: this needs the campaign tables + the `'asset_generated'` campaign-event enum present in the target DB. If creation 502s with an enum/table error, that DB is missing migrations (separate reconciliation task).

---

## Self-review notes
- **Closes the gap** from the Plan 3 audit: Arc can now create an inline-approvable `(campaignId, assetId)` via `create_campaign_draft` → the new endpoint → `createCampaignShell` + `promoteAssetToCampaign`.
- **draft ≠ act now:** `create_campaign_draft` is the first draft-only tool; `index.test` asserts the difference both ways.
- **Type/name consistency:** endpoint returns `{ campaignId, assetId }`; the tool reads those exact keys and builds an `ArcActionCard` approval block (`ArcActionCard` from Plan 3). `draftWorkProductTools(client, step, collectCard)` matches the `writeTools`/`readTools` factory shape and is threaded the same `collectCard` from `toolsForMode`.
- **Safety:** asset is `pending_approval` + `dispatch_locked`; no outbound tool added; operator hardcoded "Arc"; approval goes through the existing `decideAsset` ledger.
- **Deferred:** richer draft types (multi-asset packages, media generation) and Phase 2 (proactive triggers that call this endpoint) remain future work.

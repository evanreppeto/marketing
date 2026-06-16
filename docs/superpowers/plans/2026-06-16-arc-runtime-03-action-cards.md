# Arc Runtime — Plan 3: Action cards

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let Arc attach structured **action cards** to its chat reply — `result` cards (clickable record rows from searches) and `draft` cards (preview + flags, optionally an inline Approve/Decline block when referencing an existing campaign asset). Runner-only; the app already renders `metadata.actions[]`.

**Architecture:** A per-turn collector + an `emit_card` tool. When Arc calls `emit_card`, the handler normalizes the card and pushes it into a per-call array. `runArcTurn` returns `{ body, actions }` instead of a bare string; the handler forwards `actions` as `metadata.actions` on `postChatReply`. The app validates via its existing `parseActions` on read. `emit_card` is a read-tier tool (all modes) — surfacing cards is safe; the actual approval decision stays the operator's.

**Tech Stack:** TypeScript, `@anthropic-ai/claude-agent-sdk`, Zod, Vitest.

Plan 3 of 4 for Phase 1. Plans 1 (engine/memory) and 2 (tool surface) are merged.

**Hard constraint (from the spec + the contract audit):** the chat's inline Approve/Decline calls `decideAsset(assetId, campaignId)` where `assetId` must be a real `campaign_assets.id`. Arc has **no** endpoint to create campaign assets yet (that's Plan 4). Therefore a `draft` card may include an `approval` block **only** when Arc is referencing an existing asset it read via `get_campaign`. Otherwise it emits a `draft` card with no `approval` block (preview/flags only), or a `result` card. The tool description and system prompt must enforce this.

**Deferred to Plan 4:** an app endpoint for Arc to create a campaign + draft asset (`createCampaignShell` / `promoteAssetToCampaign`) returning `(campaignId, assetId)`, plus a `create_campaign_draft` tool — closing the "Arc drafts → approve inline" loop for *new* assets.

---

## File Structure (all under `apps/arc-runner/`)
- `src/types.ts` — add `ArcActionCard` (+ `ArcActionRow`, `ArcActionFlag`, `ArcActionApproval`), mirroring the app's `src/domain/arc-chat.ts`.
- `src/tools/cards.ts` — `emitCardTool(collectCard)` factory + zod schema (new).
- `src/tools/cards.test.ts` — TDD for the normalize-and-collect behavior (new).
- `src/tools/index.ts` — `toolsForMode` gains a `collectCard` param; `emit_card` joins the read tier (all modes). `allowedToolNames` passes a noop collector.
- `src/tools/index.test.ts` — update expected names (+ `emit_card`) and the new param.
- `src/arc.ts` — build the collector, pass to `toolsForMode`, return `{ body, actions }`.
- `src/handler.ts` — forward `actions` as `metadata.actions`.
- `src/prompt.ts` — add guidance on when/how to use `emit_card`.

---

## Task 1: Action-card types

**Files:** Modify `apps/arc-runner/src/types.ts`

- [ ] **Step 1:** Append these exported types to `apps/arc-runner/src/types.ts` (mirrors the app's `ArcActionCard`; the runner only needs to *produce* the shape — the app re-validates on read):

```ts
/** Structured cards Arc attaches to a reply (rendered by the app from metadata.actions). */
export type ArcActionRow = { name: string; meta?: string; badge?: string; href?: string };
export type ArcActionFlag = { tone: "ok" | "warn" | "risk"; label: string };
/** Inline approval reference — ONLY valid for an existing campaign asset. */
export type ArcActionApproval = { kind: "campaign"; campaignId: string; assetId: string };

export type ArcActionCard = {
  kind: "result" | "draft";
  title: string;
  href?: string;
  rows: ArcActionRow[];
  flags: ArcActionFlag[];
  preview?: string;
  approval?: ArcActionApproval;
  channel?: string;
  format?: string;
  status?: "draft" | "revision" | "approved" | "rejected";
};
```

- [ ] **Step 2:** Typecheck — `pnpm --filter @bsr/arc-runner typecheck` → PASS.
- [ ] **Step 3:** Commit — `git add apps/arc-runner/src/types.ts && git commit -m "feat(arc-runner): action-card types"`

---

## Task 2: `emit_card` tool + collector

**Files:** Create `apps/arc-runner/src/tools/cards.ts` and `apps/arc-runner/src/tools/cards.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/arc-runner/src/tools/cards.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { ArcActionCard } from "../types";
import { emitCardTool } from "./cards";

type HandlerResult = { content: Array<{ type: string; text: string }> };

function collectorAndTool() {
  const cards: ArcActionCard[] = [];
  const tool = emitCardTool((c) => cards.push(c));
  // The SDK types the handler's args as all-keys-required; in tests we invoke it
  // with partial inputs (as the model would), so call through a loose wrapper.
  const call = (args: Record<string, unknown>): Promise<HandlerResult> =>
    (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
  return { cards, tool, call };
}

describe("emit_card", () => {
  it("is named emit_card", () => {
    const { tool } = collectorAndTool();
    expect(tool.name).toBe("emit_card");
  });

  it("collects a result card, defaulting rows/flags to []", async () => {
    const { cards, call } = collectorAndTool();
    const out = await call({ kind: "result", title: "3 leads found" });
    expect(cards).toEqual<ArcActionCard[]>([
      { kind: "result", title: "3 leads found", rows: [], flags: [] },
    ]);
    expect(out.content[0].text).toContain("3 leads found");
  });

  it("collects a draft card with rows, flags, preview, and an approval block", async () => {
    const { cards, call } = collectorAndTool();
    await call({
      kind: "draft",
      title: "Fall ad",
      preview: "Before winter…",
      rows: [{ name: "Headline", meta: "28 chars" }],
      flags: [{ tone: "ok", label: "brand safe" }],
      approval: { kind: "campaign", campaignId: "c1", assetId: "a1" },
    });
    expect(cards[0]).toEqual<ArcActionCard>({
      kind: "draft",
      title: "Fall ad",
      preview: "Before winter…",
      rows: [{ name: "Headline", meta: "28 chars" }],
      flags: [{ tone: "ok", label: "brand safe" }],
      approval: { kind: "campaign", campaignId: "c1", assetId: "a1" },
    });
  });
});
```

- [ ] **Step 2:** Run → FAIL (`Cannot find module './cards'`). `pnpm --filter @bsr/arc-runner test`

- [ ] **Step 3: Implement** `apps/arc-runner/src/tools/cards.ts`:

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcActionCard } from "../types";
import { textResult } from "./helpers";

/**
 * `emit_card` lets Arc attach a structured card to its reply. Available in every
 * mode — surfacing a card is safe; the operator still makes any approval decision.
 * Cards are collected per-turn and posted as `metadata.actions`. The app
 * re-validates them with parseActions on read.
 *
 * IMPORTANT: only include an `approval` block when referencing an EXISTING
 * campaign asset (campaignId + assetId from get_campaign) — Arc cannot mint
 * assets yet, and the inline Approve/Decline resolves a real campaign_assets.id.
 */
export function emitCardTool(collectCard: (card: ArcActionCard) => void) {
  return tool(
    "emit_card",
    "Attach a structured card to your reply (renders below your text). Use kind 'result' to present records you found (rows = clickable record lines: name + optional meta/badge/href). Use kind 'draft' to present a proposed asset for review (preview + flags). Only add an `approval` block { kind:'campaign', campaignId, assetId } when referencing an EXISTING campaign asset you read via get_campaign — never invent ids. Call alongside your text reply.",
    {
      kind: z.enum(["result", "draft"]),
      title: z.string(),
      href: z.string().optional(),
      rows: z
        .array(
          z.object({
            name: z.string(),
            meta: z.string().optional(),
            badge: z.string().optional(),
            href: z.string().optional(),
          }),
        )
        .optional(),
      flags: z.array(z.object({ tone: z.enum(["ok", "warn", "risk"]), label: z.string() })).optional(),
      preview: z.string().optional(),
      approval: z
        .object({ kind: z.literal("campaign"), campaignId: z.string(), assetId: z.string() })
        .optional(),
      channel: z.string().optional(),
      format: z.string().optional(),
      status: z.enum(["draft", "revision", "approved", "rejected"]).optional(),
    },
    async (args) => {
      const card: ArcActionCard = {
        kind: args.kind,
        title: args.title,
        rows: args.rows ?? [],
        flags: args.flags ?? [],
        ...(args.href ? { href: args.href } : {}),
        ...(args.preview ? { preview: args.preview } : {}),
        ...(args.approval ? { approval: args.approval } : {}),
        ...(args.channel ? { channel: args.channel } : {}),
        ...(args.format ? { format: args.format } : {}),
        ...(args.status ? { status: args.status } : {}),
      };
      collectCard(card);
      return textResult(`Attached ${args.kind} card: ${args.title}`);
    },
  );
}
```

- [ ] **Step 4:** Run → PASS. `pnpm --filter @bsr/arc-runner test`
- [ ] **Step 5:** Commit — `git add apps/arc-runner/src/tools/cards.ts apps/arc-runner/src/tools/cards.test.ts && git commit -m "feat(arc-runner): emit_card tool + collector"`

---

## Task 3: Thread the collector through the assembler

**Files:** Modify `apps/arc-runner/src/tools/index.ts` and `apps/arc-runner/src/tools/index.test.ts`

- [ ] **Step 1: Update `index.ts`.** Add the import and thread a `collectCard` param so `emit_card` joins the read tier (all modes).

Add import near the others:
```ts
import { emitCardTool } from "./cards";
import type { ArcActionCard } from "../types";
```

Change `readTools` to take and use the collector:
```ts
/** Anything Arc may call to read app state, plus emit_card. Available in every mode. */
function readTools(client: ArcClient, step: StepFn, collectCard: (card: ArcActionCard) => void) {
  return [
    ...crmReadTools(client, step),
    ...brainReadTools(client, step),
    ...campaignReadTools(client, step),
    emitCardTool(collectCard),
  ];
}
```

Change `toolsForMode` to accept and pass the collector:
```ts
export function toolsForMode(
  mode: ArcMode,
  client: ArcClient,
  step: StepFn,
  collectCard: (card: ArcActionCard) => void,
) {
  const read = readTools(client, step, collectCard);
  return mode === "ask" ? [...read] : [...read, ...writeTools(client, step)];
}
```

Update `allowedToolNames` to pass a noop collector:
```ts
export function allowedToolNames(mode: ArcMode): string[] {
  const noop = (async () => {}) as StepFn;
  const placeholder = {} as ArcClient;
  const noCollect = () => {};
  return toolsForMode(mode, placeholder, noCollect, noCollect).map((t) => `mcp__arc__${t.name}`);
}
```

> Note: `noCollect` is passed for `collectCard`; the existing `noop` stays for `step`. (Both are throwaway — `allowedToolNames` only reads tool names.)

- [ ] **Step 2: Update `index.test.ts`.** The stub `step` stays; add a `collectCard` arg to every `toolsForMode(...)` call, and add `emit_card` to the expected READ names.

Add near the top (after `step`):
```ts
const collect = () => {};
```
Add `"emit_card"` to the `READ` array. Update the three `toolsForMode` calls to `toolsForMode(mode, stubClient, step, collect)`. (The `allowedToolNames` tests are unchanged.)

- [ ] **Step 3:** Run typecheck + tests — both PASS. `pnpm --filter @bsr/arc-runner typecheck && pnpm --filter @bsr/arc-runner test`
- [ ] **Step 4:** Commit — `git add apps/arc-runner/src/tools/index.ts apps/arc-runner/src/tools/index.test.ts && git commit -m "feat(arc-runner): emit_card in the tool assembler (all modes)"`

---

## Task 4: `runArcTurn` returns `{ body, actions }`; handler forwards them

**Files:** Modify `apps/arc-runner/src/arc.ts` and `apps/arc-runner/src/handler.ts`

- [ ] **Step 1: `arc.ts`.** Add the type import, build a collector, pass it to `toolsForMode`, and change the return.

Add to the type import from `./types`: `ArcActionCard` (alongside `MarkChatMessagePayload`):
```ts
import type { ArcActionCard, MarkChatMessagePayload } from "./types";
```

Add an exported result type and change the signature/return. Replace the function signature line and the tool-list line, and the final return:

Signature →
```ts
export type ArcTurnResult = { body: string; actions: ArcActionCard[] };

export async function runArcTurn(payload: MarkChatMessagePayload, client: ArcClient): Promise<ArcTurnResult> {
```

After `const step = …` (before building `ctx`), add the collector:
```ts
  const actions: ArcActionCard[] = [];
  const collectCard = (card: ArcActionCard) => actions.push(card);
```

Tool list line →
```ts
  const tools = toolsForMode(payload.mode, client, step, collectCard);
```

Final return →
```ts
  return { body: (resultText || assistantText).trim(), actions };
```

(Everything else in `runArcTurn` is unchanged.)

- [ ] **Step 2: `handler.ts`.** Use the new result shape and forward actions as metadata.

Replace the `runArcTurn` call + reply block:
```ts
    const result = await runArcTurn(payload, client);
    const reply = result.body;
    await client.postChatReply({
      agentTaskId: payload.agentTaskId,
      body: reply || "(Arc returned an empty reply.)",
      status: reply ? "complete" : "failed",
      metadata: result.actions.length > 0 ? { actions: result.actions } : {},
    });
```

(The `console.log` lines and the `catch` block stay unchanged.)

- [ ] **Step 3:** Typecheck + tests — PASS. `pnpm --filter @bsr/arc-runner typecheck && pnpm --filter @bsr/arc-runner test`
- [ ] **Step 4:** Commit — `git add apps/arc-runner/src/arc.ts apps/arc-runner/src/handler.ts && git commit -m "feat(arc-runner): carry action cards on the reply (metadata.actions)"`

---

## Task 5: System-prompt guidance for cards

**Files:** Modify `apps/arc-runner/src/prompt.ts`

- [ ] **Step 1:** Add a sentence to `ARC_SYSTEM_PROMPT`. Immediately after the existing "Tools: …" paragraph, insert:

```
Cards: when you present records you found (leads, contacts, campaigns), also call \`emit_card\` with a 'result' card whose rows are those records (name + a short meta + an href to the record) — it renders as clickable lines below your reply. When you present a proposed asset, use a 'draft' card with a short preview and any risk flags. Only attach an \`approval\` block to a draft card when you are referencing an existing campaign asset you loaded with get_campaign (real campaignId + assetId) — never invent ids; you cannot create new assets yet.
```

- [ ] **Step 2:** Typecheck — PASS.
- [ ] **Step 3:** Commit — `git add apps/arc-runner/src/prompt.ts && git commit -m "feat(arc-runner): prompt guidance for emit_card"`

---

## Task 6: Manual acceptance

Run the app + runner (runner `.env` already configured).

- [ ] **Step 1: Result card.** Ask Arc (with some CRM data, or accept empty): "Find qualified leads and show them as a list." → Arc replies with text AND a result card whose rows are the leads (clickable). Confirm the card renders below the bubble.
- [ ] **Step 2: Draft card, no approval.** Ask: "Draft an Instagram caption for emergency homeowners." → Arc replies with a `draft` card (preview + maybe flags), and **no** Approve/Decline tray (it didn't invent an asset). Verify it does not fabricate a campaignId/assetId.
- [ ] **Step 3: Draft card with inline approve (existing asset).** If a campaign with a pending asset exists (create one in `/campaigns`), ask: "Show me the pending asset on campaign <id> for review." → Arc loads it via get_campaign and emits a `draft` card carrying `approval { campaignId, assetId }`; the inline **Approve/Decline** tray appears. Clicking Approve moves real state (asset → approved in `/campaigns`).
- [ ] **Step 4: Multi-card.** Ask for several records → confirm multiple cards render (the app uses CampaignDeck for 2+ draft cards).

---

## Self-review notes
- **Spec coverage (§5):** `emit_card` produces result + draft cards into `metadata.actions` (Tasks 1–4); draft cards carry the inline-approval block only for existing assets (enforced by tool description + prompt, Tasks 2 & 5). The app already renders these (verified in the contract audit).
- **Type/name consistency:** `ArcActionCard` (Task 1) is consumed by `cards.ts` (Task 2), `index.ts` (Task 3), and `arc.ts` (Task 4). `emit_card` name in `cards.test.ts` matches the tool literal and the `READ` array addition in `index.test.ts` (Task 3). `toolsForMode`'s new `collectCard` param is threaded through `allowedToolNames` (noop) and `arc.ts` (real collector).
- **Constraint honored:** no agent-side asset creation; `approval` blocks reference existing assets only. Plan 4 adds the creation endpoint + tool.

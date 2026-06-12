# Project-Wide Studio Asset Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Mark Studio's **Assets** tab show every asset Mark generated across all chats in the same Mark Project, not just the current chat.

**Architecture:** Approach A from the design — assets are already derived from message `actions`, so we load the asset-bearing Mark messages from sibling conversations in the project (`listProjectAssetMessages`), thread them as a `projectMessages` prop into the Studio, and merge them through the existing `collectAssets` pipeline (deduped, current chat wins). A small "from &lt;chat&gt;" chip marks cross-chat tiles. `Now`/`Building`/`Audience` stay scoped to the current chat.

**Tech Stack:** Next.js 16 (server components), React 19, TypeScript, Supabase (admin client), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-12-studio-project-wide-assets-design.md`

---

## File Structure

- **Create** `src/app/mark/_components/asset-collect.ts` — pure (non-`"use client"`) module holding the `StudioAsset` type and `collectAssets`, moved out of `asset-library.tsx` so it is unit-testable without React/client imports.
- **Create** `src/app/mark/_components/asset-collect.test.ts` — unit tests for `collectAssets` (dedup / current-wins / provenance).
- **Create** `src/lib/mark-chat/persistence.assets.test.ts` — unit tests for `listProjectAssetMessages`.
- **Modify** `src/app/mark/_components/asset-library.tsx` — drop the local `StudioAsset`/`collectAssets`, re-export them from `asset-collect`, add the source chip.
- **Modify** `src/lib/mark-chat/persistence.ts` — add `listProjectAssetMessages`.
- **Modify** `src/app/mark/page.tsx` — load `projectMessages` server-side.
- **Modify** `src/app/mark/_components/mark-chat.tsx` — thread `projectMessages`, `currentConversationId`, `conversationTitles` into both `WorkCanvas` instances.
- **Modify** `src/app/mark/_components/work-canvas.tsx` — accept the new props, merge for the Assets tab.

`campaign-cover.tsx` and `audience-panel.tsx` import `StudioAsset` from `./asset-library`; the re-export keeps those imports valid with no change.

---

## Task 1: Extract `collectAssets` into a pure, testable module

**Files:**
- Create: `src/app/mark/_components/asset-collect.ts`
- Modify: `src/app/mark/_components/asset-library.tsx:1-36`

Pure refactor — no behavior change. This isolates the collection logic so it can be unit-tested without pulling in client-only component imports.

- [ ] **Step 1: Create the pure module**

Create `src/app/mark/_components/asset-collect.ts`:

```ts
import type { MarkActionCard, MarkMedia } from "@/domain";
import type { MarkMessage } from "@/lib/mark-chat/persistence";

export type StudioAsset = {
  id: string;
  card: MarkActionCard;
  /** Resolved visual: the card's own media, else the reply's first image. */
  media?: MarkMedia;
  conversationId: string;
  messageId: string;
};

/** Gather every asset Mark generated across the given messages — the Studio's
 *  library source. Dedupes by asset id; the FIRST occurrence wins, so callers
 *  that want current-chat assets to take precedence must list them first. */
export function collectAssets(messages: MarkMessage[]): StudioAsset[] {
  const out: StudioAsset[] = [];
  const seen = new Set<string>();
  for (const m of messages) {
    m.actions.forEach((card, i) => {
      if (card.kind !== "draft" && !card.media) return;
      const id = card.approval?.assetId ?? `${m.id}-${i}`;
      if (seen.has(id)) return;
      seen.add(id);
      const media = card.media ?? m.media.find((x) => x.kind === "image");
      out.push({ id, card, media, conversationId: m.conversationId, messageId: m.id });
    });
  }
  return out;
}
```

- [ ] **Step 2: Update `asset-library.tsx` to re-export from the new module**

Replace the top of `src/app/mark/_components/asset-library.tsx` (lines 1-36 — the imports, the `StudioAsset` type, and the `collectAssets` function) with:

```tsx
"use client";

import { useMemo, useState } from "react";

import { cx } from "@/app/_components/theme";
import type { MarkActionCard } from "@/domain";

import type { StudioAsset } from "./asset-collect";
import { SourceBadge, StatusPill } from "./asset-meta";
import { AssetThumb } from "./asset-thumb";

export type { StudioAsset } from "./asset-collect";
export { collectAssets } from "./asset-collect";
```

Leave everything from `function category(card: MarkActionCard): string {` onward unchanged. (This removes the now-unused `MarkMedia` and `MarkMessage` imports; `MarkActionCard` is still used by `category`.)

- [ ] **Step 3: Verify types still compile**

Run: `pnpm build`
Expected: build succeeds (no type errors). `work-canvas.tsx`, `campaign-cover.tsx`, and `audience-panel.tsx` still resolve `StudioAsset`/`collectAssets` through the re-export.

- [ ] **Step 4: Commit**

```bash
git add src/app/mark/_components/asset-collect.ts src/app/mark/_components/asset-library.tsx
git commit -m "refactor(mark): extract collectAssets into pure asset-collect module"
```

---

## Task 2: Test `collectAssets` dedup + provenance

**Files:**
- Test: `src/app/mark/_components/asset-collect.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/mark/_components/asset-collect.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { MarkActionCard } from "@/domain";
import type { MarkMessage } from "@/lib/mark-chat/persistence";

import { collectAssets } from "./asset-collect";

function card(over: Partial<MarkActionCard> = {}): MarkActionCard {
  return { kind: "draft", title: "Draft", rows: [], flags: [], ...over };
}

function msg(over: Partial<MarkMessage> = {}): MarkMessage {
  return {
    id: "m1",
    conversationId: "c1",
    role: "mark",
    body: "",
    status: "complete",
    agentTaskId: null,
    mentions: [],
    media: [],
    steps: [],
    feedback: null,
    actions: [],
    suggestions: [],
    attachments: [],
    createdAt: "t",
    ...over,
  };
}

describe("collectAssets", () => {
  it("collects drafts and media cards, skips result cards without media", () => {
    const m = msg({
      actions: [
        card({ kind: "draft", title: "A" }),
        card({ kind: "result", title: "B" }), // no media -> skipped
        card({ kind: "result", title: "C", media: { kind: "image", url: "u" } }),
      ],
    });
    expect(collectAssets([m]).map((a) => a.card.title)).toEqual(["A", "C"]);
  });

  it("dedupes by asset id; the first occurrence (current chat) wins", () => {
    const current = msg({
      id: "cur",
      conversationId: "c1",
      actions: [card({ title: "Current", approval: { kind: "campaign", campaignId: "k", assetId: "a1" } })],
    });
    const sibling = msg({
      id: "sib",
      conversationId: "c2",
      actions: [card({ title: "Sibling", approval: { kind: "campaign", campaignId: "k", assetId: "a1" } })],
    });
    const assets = collectAssets([current, sibling]);
    expect(assets).toHaveLength(1);
    expect(assets[0].card.title).toBe("Current");
    expect(assets[0].conversationId).toBe("c1");
  });

  it("records each asset's originating conversation", () => {
    const sibling = msg({ id: "sib", conversationId: "c2", actions: [card({ title: "S" })] });
    expect(collectAssets([sibling])[0].conversationId).toBe("c2");
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `pnpm test src/app/mark/_components/asset-collect.test.ts`
Expected: PASS (3 tests). The logic moved verbatim in Task 1, so these confirm the contract — especially first-wins dedup, which is what makes the current chat take precedence over siblings in the merge.

- [ ] **Step 3: Commit**

```bash
git add src/app/mark/_components/asset-collect.test.ts
git commit -m "test(mark): cover collectAssets dedup and provenance"
```

---

## Task 3: Add `listProjectAssetMessages` persistence query

**Files:**
- Modify: `src/lib/mark-chat/persistence.ts` (insert after `listMessages`, ~line 250)
- Test: `src/lib/mark-chat/persistence.assets.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/mark-chat/persistence.assets.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import { listProjectAssetMessages } from "./persistence";

function calls(supabase: MockSupabase, method: string): unknown[][] {
  return supabase.calls.filter(([m]) => m === method).map(([, ...args]) => args);
}

function messageRow(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    conversation_id: "c2",
    role: "mark",
    body: "",
    status: "complete",
    agent_task_id: null,
    mentions: [],
    metadata: { actions: [{ kind: "draft", title: "Sibling draft" }] },
    created_at: "t",
    ...over,
  };
}

describe("listProjectAssetMessages", () => {
  it("returns [] when the project has no other active conversations", async () => {
    const supabase = createSupabaseQueryMock({
      mark_conversations: { data: [{ id: "cur" }], error: null },
    });
    const out = await listProjectAssetMessages("p1", "Evan", { excludeConversationId: "cur" }, supabase);
    expect(out).toEqual([]);
  });

  it("loads asset-bearing mark messages from sibling conversations", async () => {
    const supabase = createSupabaseQueryMock({
      mark_conversations: { data: [{ id: "cur" }, { id: "c2" }], error: null },
      mark_messages: {
        data: [
          messageRow({ id: "m1", conversation_id: "c2" }),
          messageRow({ id: "m2", conversation_id: "c2", metadata: {} }), // no actions -> filtered out
        ],
        error: null,
      },
    });
    const out = await listProjectAssetMessages("p1", "Evan", { excludeConversationId: "cur" }, supabase);
    expect(out.map((m) => m.id)).toEqual(["m1"]);
    expect(calls(supabase, "eq")).toEqual(
      expect.arrayContaining([
        ["operator", "Evan"],
        ["project_id", "p1"],
        ["status", "active"],
        ["role", "mark"],
      ]),
    );
    // the active conversation is dropped from the IN list
    expect(calls(supabase, "in")[0]).toEqual(["conversation_id", ["c2"]]);
    expect(calls(supabase, "limit")[0]).toEqual([100]);
  });

  it("respects a custom limit", async () => {
    const supabase = createSupabaseQueryMock({
      mark_conversations: { data: [{ id: "c2" }], error: null },
      mark_messages: { data: [], error: null },
    });
    await listProjectAssetMessages("p1", "Evan", { limit: 25 }, supabase);
    expect(calls(supabase, "limit")[0]).toEqual([25]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/mark-chat/persistence.assets.test.ts`
Expected: FAIL — `listProjectAssetMessages` is not exported yet (import error / not a function).

- [ ] **Step 3: Implement the function**

In `src/lib/mark-chat/persistence.ts`, immediately after the `listMessages` function (ends ~line 250) insert:

```ts
/**
 * Every asset-bearing Mark message from the OTHER active conversations in a
 * project — the source for the Studio's project-wide Assets library. The active
 * conversation is excluded (its messages already arrive live), and messages
 * without action cards are dropped so the payload stays small.
 */
export async function listProjectAssetMessages(
  projectId: string,
  operator: string,
  options: { excludeConversationId?: string; limit?: number } = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkMessage[]> {
  const { data: convRows, error: convErr } = await client
    .from("mark_conversations")
    .select("id")
    .eq("operator", operator)
    .eq("project_id", projectId)
    .eq("status", "active");
  assertOk("mark_conversations project list", convErr);

  const ids = ((convRows ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter((id) => id !== options.excludeConversationId);
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from("mark_messages")
    .select(MESSAGE_COLUMNS)
    .in("conversation_id", ids)
    .eq("role", "mark")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);
  assertOk("mark_messages project assets list", error);

  return ((data ?? []) as MessageRow[]).map(toMessage).filter((m) => m.actions.length > 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/mark-chat/persistence.assets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mark-chat/persistence.ts src/lib/mark-chat/persistence.assets.test.ts
git commit -m "feat(mark): add listProjectAssetMessages for project-wide assets"
```

---

## Task 4: Load `projectMessages` on the Mark page

**Files:**
- Modify: `src/app/mark/page.tsx:7` (import) and `src/app/mark/page.tsx:46-93` (`loadLiveMarkChatProps`)

- [ ] **Step 1: Import the new query and the message type**

In `src/app/mark/page.tsx`, change the persistence import (line 7) to add `listProjectAssetMessages` and the `MarkMessage` type:

```ts
import {
  listConversations,
  listMessages,
  getConversation,
  listProjects,
  listArchivedConversations,
  listProjectAssetMessages,
  type MarkMessage,
} from "@/lib/mark-chat/persistence";
```

- [ ] **Step 2: Load project messages and add them to the returned props**

In `loadLiveMarkChatProps`, after the `initialMessages` line:

```ts
  const initialMessages = activeConversation ? await listMessages(activeConversation.id) : [];
```

add:

```ts
  // Project-wide assets for the Studio: asset-bearing messages from sibling chats
  // in the same project. Non-fatal — the chat still works if this read fails.
  let projectMessages: MarkMessage[] = [];
  if (activeConversation?.projectId) {
    try {
      projectMessages = await listProjectAssetMessages(activeConversation.projectId, operator, {
        excludeConversationId: activeConversation.id,
      });
    } catch {
      projectMessages = [];
    }
  }
```

Then add `projectMessages,` to the returned object (next to `initialMessages,`).

- [ ] **Step 3: Verify types compile**

Run: `pnpm build`
Expected: FAIL with a type error — `MarkChat` does not yet accept `projectMessages`. (This is expected; Task 5 adds the prop. If you prefer a green build at every step, do Task 5 before re-running.)

- [ ] **Step 4: Commit**

```bash
git add src/app/mark/page.tsx
git commit -m "feat(mark): load project-wide asset messages on the Mark page"
```

---

## Task 5: Thread the props through `MarkChat`

**Files:**
- Modify: `src/app/mark/_components/mark-chat.tsx` (props ~109-148; body ~330-334; both `WorkCanvas` usages ~523-532 and ~555-562)

- [ ] **Step 1: Add the prop to the signature and type**

In `MarkChat`'s destructured params (after `initialMessages,`) add:

```ts
  projectMessages = [],
```

and in the props type (after `initialMessages: MarkMessage[];`) add:

```ts
  /** Asset-bearing messages from sibling chats in this chat's project (Studio Assets tab). */
  projectMessages?: MarkMessage[];
```

(`MarkMessage` is already imported in this file.)

- [ ] **Step 2: Build the conversation-title lookup**

After the `activeCampaign` declaration (~line 333) add:

```ts
  // id -> title, so the Studio can label assets that came from a sibling chat.
  const conversationTitles = useMemo(
    () => Object.fromEntries(conversations.map((c) => [c.id, c.title] as const)),
    [conversations],
  );
```

(`useMemo` is already imported.)

- [ ] **Step 3: Pass the new props to the docked `WorkCanvas`**

Replace the docked usage (~line 523-532):

```tsx
        {activeId ? (
          <WorkCanvas
            messages={displayMessages}
            projectMessages={projectMessages}
            currentConversationId={activeId}
            conversationTitles={conversationTitles}
            open={canvasOpen}
            focus={studioFocus}
            campaign={activeCampaign}
            assistantName={assistantName}
            onDecision={demo ? demoDecide : undefined}
          />
        ) : null}
```

- [ ] **Step 4: Pass the new props to the drawer `WorkCanvas`**

Replace the drawer usage (~line 555-562):

```tsx
              <WorkCanvas
                messages={displayMessages}
                projectMessages={projectMessages}
                currentConversationId={activeId}
                conversationTitles={conversationTitles}
                variant="drawer"
                focus={studioFocus}
                campaign={activeCampaign}
                assistantName={assistantName}
                onDecision={demo ? demoDecide : undefined}
              />
```

- [ ] **Step 5: Commit**

```bash
git add src/app/mark/_components/mark-chat.tsx
git commit -m "feat(mark): thread project messages + titles into the Studio"
```

---

## Task 6: Merge project messages in `WorkCanvas` (Assets tab only)

**Files:**
- Modify: `src/app/mark/_components/work-canvas.tsx` (props ~339-360; `assets` memo ~364; `AssetLibrary` usage ~407-408)

- [ ] **Step 1: Add the new props**

In `WorkCanvas`'s destructured params add (after `messages,`):

```ts
  projectMessages = [],
  currentConversationId,
  conversationTitles,
```

and in the props type object add:

```ts
  /** Asset-bearing messages from sibling chats in the project (Assets tab only). */
  projectMessages?: MarkMessage[];
  /** The active chat id — tiles from other chats get a source chip. */
  currentConversationId?: string;
  /** id -> chat title, for the cross-chat source chip. */
  conversationTitles?: Record<string, string>;
```

- [ ] **Step 2: Merge current + project messages for the asset library**

Change the `assets` memo (~line 364) from:

```ts
  const assets = useMemo(() => collectAssets(messages), [messages]);
```

to:

```ts
  // Assets tab is project-wide: current chat first (so it wins dedup), then siblings.
  const assets = useMemo(
    () => collectAssets([...messages, ...projectMessages]),
    [messages, projectMessages],
  );
```

Leave `audienceCount` (and everything driving `Now`/`Building`) reading from `messages` — those stay chat-scoped.

- [ ] **Step 3: Pass the chip props into `AssetLibrary`**

In the assets-list branch (~line 407-408) change:

```tsx
          <AssetLibrary assets={assets} onSelect={setSelectedId} />
```

to:

```tsx
          <AssetLibrary
            assets={assets}
            onSelect={setSelectedId}
            currentConversationId={currentConversationId}
            conversationTitles={conversationTitles}
          />
```

- [ ] **Step 4: Commit**

```bash
git add src/app/mark/_components/work-canvas.tsx
git commit -m "feat(mark): Studio Assets tab aggregates across the project"
```

---

## Task 7: Render the "from &lt;chat&gt;" source chip

**Files:**
- Modify: `src/app/mark/_components/asset-library.tsx` (`AssetTile` ~48-67; `AssetLibrary` ~69 + grid map ~108-112)

- [ ] **Step 1: Accept `sourceTitle` on `AssetTile` and render the chip**

Change the `AssetTile` signature:

```tsx
function AssetTile({ asset, onSelect, sourceTitle }: { asset: StudioAsset; onSelect: (id: string) => void; sourceTitle?: string }) {
```

Inside the bottom label block, after the `card.channel` line, add the chip:

```tsx
        {card.channel ? <span className="truncate text-[10px] text-[var(--text-muted)]">{card.channel}</span> : null}
        {sourceTitle ? (
          <span className="truncate text-[10px] text-[var(--text-muted)]" title={`From ${sourceTitle}`}>
            from {sourceTitle}
          </span>
        ) : null}
```

- [ ] **Step 2: Accept the lookup props on `AssetLibrary` and pass `sourceTitle` per tile**

Change the `AssetLibrary` signature:

```tsx
export function AssetLibrary({
  assets,
  onSelect,
  currentConversationId,
  conversationTitles,
}: {
  assets: StudioAsset[];
  onSelect: (id: string) => void;
  currentConversationId?: string;
  conversationTitles?: Record<string, string>;
}) {
```

Replace the grid map (~line 108-112):

```tsx
          {shown.map((a) => {
            const fromOther = Boolean(currentConversationId) && a.conversationId !== currentConversationId;
            const sourceTitle = fromOther ? conversationTitles?.[a.conversationId] ?? "another chat" : undefined;
            return <AssetTile key={a.id} asset={a} onSelect={onSelect} sourceTitle={sourceTitle} />;
          })}
```

- [ ] **Step 3: Verify the whole feature type-checks**

Run: `pnpm build`
Expected: PASS — `page.tsx` → `MarkChat` → `WorkCanvas` → `AssetLibrary` all agree on the new props.

- [ ] **Step 4: Commit**

```bash
git add src/app/mark/_components/asset-library.tsx
git commit -m "feat(mark): mark cross-chat Studio assets with a source chip"
```

---

## Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the new + existing mark tests**

Run: `pnpm test src/app/mark/_components/asset-collect.test.ts src/lib/mark-chat/persistence.assets.test.ts src/lib/mark-chat/persistence.test.ts src/lib/mark-chat/persistence.projects.test.ts`
Expected: all PASS.

- [ ] **Step 2: Type-check the build**

Run: `pnpm build`
Expected: PASS, no type errors. (`pnpm lint` does not type-check — the build is the type gate.)

- [ ] **Step 3: Lint only the changed files**

Run:
```bash
pnpm exec eslint src/app/mark/_components/asset-collect.ts src/app/mark/_components/asset-library.tsx src/app/mark/_components/work-canvas.tsx src/app/mark/_components/mark-chat.tsx src/lib/mark-chat/persistence.ts src/app/mark/page.tsx
```
Expected: no errors on these files. (Repo-wide `pnpm lint` reports ~31k pre-existing problems from vendored/generated files — scope to changed files to read your own results.)

- [ ] **Step 4: Manual check (requires Supabase configured locally)**

Run `pnpm dev`, then in the Mark chat:
1. Create two chats, assign both to the same Project, generate an asset in chat A.
2. Open chat B → Studio → **Assets**: the asset from A appears with a "from &lt;A's title&gt;" chip and can be approved/declined in place.
3. Confirm **Now** and **Audience** still reflect only chat B.
4. Open a chat with **no** project → Studio shows only that chat's assets (no chips).

(Without Supabase, the page renders demo mode with `projectMessages: []` — unchanged behavior. Manual project verification needs a configured backend.)

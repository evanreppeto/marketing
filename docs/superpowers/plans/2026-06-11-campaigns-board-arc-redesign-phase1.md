# Campaigns × Board × Arc — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the campaigns list page and the 7-tab campaign detail page with a calm, board-intertwined experience where a campaign is an overview and its work lives in Arc threads + board tasks — serving humans and Arc alike.

**Architecture:** One spine, three lenses. A campaign's *work* is `agent_tasks` rows linked by `campaign_id`; its *conversations* are `arc_conversations` rows linked by `campaign_id`. The list page gains an "Ask Arc to build" bar + a who-drives creation chooser + status cards. The detail page collapses 7 tabs into one Overview scroll (At a glance / The package with inline approve / What's live / Audience / Work lane / Threads / History) with an "Open in Arc" redirect. Phase 1 adds **no migration** — all needed columns exist. Additive only; outbound stays locked.

**Tech Stack:** Next.js 16 (App Router, server components + `"use server"` actions), React 19, TypeScript, Supabase, Tailwind v4 tokens (`globals.css` + `theme.ts`), vitest.

**Design rules (DESIGN.md — Obsidian & Gold):** Build from `theme.ts`/`globals.css` tokens, never hard-code hex. No emojis, no neon/purple, no nested cards, no equal-3-col rows. Red (`--priority`) is destructive/risk only; "needs you" is gold (`--warn`). Serif (Fraunces) for titles + Arc's voice; SVG line icons only. Reuse `PageHeader`/`Panel`/`StatusPill`/`Button`/`EmptyState` from `src/app/_components/page-header.tsx` and `EntityAvatar` from `src/app/_components/entity-avatar.tsx`.

**Verify-as-you-go:** `pnpm exec tsc --noEmit` (lint does NOT typecheck) and `pnpm exec eslint <changed files>` (repo-wide lint scans vendor noise — always scope to changed files). Run unit tests with `pnpm test <file>`.

---

## File map

**Create:**
- `src/domain/campaign-presentation.ts` — pure display helpers (lifecycle tone, driver, channel/needs-you derivations). Re-exported via `src/domain/index.ts`.
- `src/domain/__tests__/campaign-presentation.test.ts` — unit tests.
- `src/lib/campaigns/campaign-threads.ts` — read-model: conversations + board tasks for one campaign.
- `src/lib/campaigns/campaign-threads.test.ts` — unit tests for the pure mapping helpers there.
- `src/app/campaigns/_components/ask-arc-bar.tsx` — client; the "describe a campaign → Arc builds it" input.
- `src/app/campaigns/_components/campaign-card.tsx` — one campaign card for the list.
- `src/app/campaigns/_components/new-campaign-chooser.tsx` — client; the who-drives chooser.
- `src/app/campaigns/_components/campaign-overview.tsx` — the Overview composition (server).
- `src/app/campaigns/_components/overview/at-a-glance.tsx`, `package-panel.tsx`, `whats-live.tsx`, `audience-panel.tsx`, `work-lane.tsx`, `threads-panel.tsx`, `history-timeline.tsx` — Overview sections.

**Modify:**
- `src/app/campaigns/actions.ts` — add `askMarkToBuildCampaignAction`, `handToMarkAction`.
- `src/lib/campaigns/read-model.ts` — surface `driver` + `channels` on `CampaignWorkspaceListItem` (re-read first).
- `src/app/agent-operations/actions.ts` — `createTaskAction` accepts optional `campaignId` (re-read first).
- `src/app/campaigns/page.tsx` + `campaign-library.tsx` — cards + filters + ask-Arc bar.
- `src/app/campaigns/new/page.tsx` — host the chooser (keep the manual form path).
- `src/app/campaigns/_components/campaign-workspace.tsx` — render `CampaignOverview` (fold the 7 tabs); keep `CampaignEconomicsPanel` mount in the page.
- `src/domain/index.ts` — re-export the new presentation module.

**Reuse (do not modify):** `page-header.tsx` primitives, `entity-avatar.tsx`, `asset-thumb.tsx`, `decideAssetAction`/`requestRevisionAction`/`launchCampaignAction` (campaigns/actions.ts), `createCampaignShell` (lib/campaigns/create.ts), `createConversation`/`assignConversationToCampaign`/`insertOperatorMessage` (lib/arc-chat/persistence.ts).

---

## Task 1: Pure presentation helpers

**Files:**
- Create: `src/domain/campaign-presentation.ts`
- Test: `src/domain/__tests__/campaign-presentation.test.ts`

These are pure, deterministic, no-I/O helpers (domain layer per CLAUDE.md). They map campaign data → display decisions so the UI components stay dumb.

- [ ] **Step 1: Write the failing test**

```typescript
// src/domain/__tests__/campaign-presentation.test.ts
import { describe, expect, it } from "vitest";
import {
  campaignLifecycleTone,
  campaignDriver,
  needsYouCount,
} from "../campaign-presentation";

describe("campaignLifecycleTone", () => {
  it("maps lifecycle to a theme tone (needs-you is gold/amber, never red)", () => {
    expect(campaignLifecycleTone("In review")).toBe("amber");
    expect(campaignLifecycleTone("Live")).toBe("green");
    expect(campaignLifecycleTone("Ready")).toBe("blue");
    expect(campaignLifecycleTone("Drafting")).toBe("gray");
  });
});

describe("campaignDriver", () => {
  it("operator-authored campaigns are operator-driven", () => {
    expect(campaignDriver({ sourceSystem: "operator", lifecycle: "Ready" })).toBe("operator");
  });
  it("Arc-authored campaigns are agent-driven", () => {
    expect(campaignDriver({ sourceSystem: "mark_saved", lifecycle: "Ready" })).toBe("agent");
  });
  it("a Drafting campaign is agent-driven regardless of source (Arc is actively building)", () => {
    expect(campaignDriver({ sourceSystem: "operator", lifecycle: "Drafting" })).toBe("agent");
  });
});

describe("needsYouCount", () => {
  it("is the pending count when in review, else zero", () => {
    expect(needsYouCount({ lifecycle: "In review", pendingCount: 2 })).toBe(2);
    expect(needsYouCount({ lifecycle: "Live", pendingCount: 0 })).toBe(0);
    expect(needsYouCount({ lifecycle: "Ready", pendingCount: 3 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/domain/__tests__/campaign-presentation.test.ts`
Expected: FAIL — cannot find module `../campaign-presentation`.

- [ ] **Step 3: Implement**

```typescript
// src/domain/campaign-presentation.ts
/**
 * Pure display helpers for the campaigns surface. No I/O. Maps campaign data to
 * theme tones, the driving avatar (Arc vs operator), and the "needs you" count.
 */

export type CampaignLifecycle = "Drafting" | "In review" | "Ready" | "Live";

/** ThemeTone values understood by StatusPill. Kept as a local union to avoid a
 *  domain → app import; the strings must match `theme.pill` keys. */
export type CampaignTone = "amber" | "green" | "blue" | "gray" | "red" | "dark";

export function campaignLifecycleTone(lifecycle: CampaignLifecycle): CampaignTone {
  switch (lifecycle) {
    case "In review":
      return "amber"; // "needs you" — gold, never red
    case "Live":
      return "green";
    case "Ready":
      return "blue";
    case "Drafting":
    default:
      return "gray";
  }
}

export type CampaignDriver = "agent" | "operator";

/** Who is currently driving the campaign — drives the EntityAvatar. A Drafting
 *  campaign is always agent-driven (Arc is actively building it). */
export function campaignDriver(input: { sourceSystem: string | null; lifecycle: CampaignLifecycle }): CampaignDriver {
  if (input.lifecycle === "Drafting") return "agent";
  return input.sourceSystem === "operator" ? "operator" : "agent";
}

/** Pending approvals only count as "needs you" while the campaign is in review. */
export function needsYouCount(input: { lifecycle: CampaignLifecycle; pendingCount: number }): number {
  return input.lifecycle === "In review" ? input.pendingCount : 0;
}
```

- [ ] **Step 4: Re-export from the domain barrel**

In `src/domain/index.ts`, add alongside the other re-exports:

```typescript
export * from "./campaign-presentation";
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test src/domain/__tests__/campaign-presentation.test.ts`
Expected: PASS (3 describe blocks green).

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/domain/campaign-presentation.ts src/domain/__tests__/campaign-presentation.test.ts src/domain/index.ts
git commit -m "feat(campaigns): pure presentation helpers (tone, driver, needs-you)"
```

---

## Task 2: Surface `driver` + `channels` on the list read-model

**Files:**
- Modify: `src/lib/campaigns/read-model.ts` (re-read first — large file; find `CampaignWorkspaceListItem` ~line 29 and the list builder `getCampaignWorkspaceList` ~lines 399–477)

The card needs the driving avatar and a channel summary. `source_system` is on the `campaigns` row but not yet surfaced; `assetTypes` already exists and can seed `channels`.

- [ ] **Step 1: Extend the type**

Add two fields to `CampaignWorkspaceListItem` (after `assetTypes`):

```typescript
  /** "operator" | "agent" — who is driving, for the card avatar. */
  driver: import("@/domain").CampaignDriver;
  /** Distinct channel labels for the card subline, e.g. ["Meta", "Email"]. */
  channels: string[];
```

- [ ] **Step 2: Populate them in the list builder**

In the list mapping, ensure the campaigns query selects `source_system` (add it to the existing `.select(...)` column list if absent). Then, where each `CampaignWorkspaceListItem` is constructed, import the helper and set:

```typescript
import { campaignDriver } from "@/domain";
// ...
driver: campaignDriver({ sourceSystem: row.source_system ?? null, lifecycle }),
channels: Array.from(new Set(assetTypes.map(humanizeChannel))).slice(0, 3),
```

Add this small local helper near the other formatting helpers in the file (it titleizes an `asset_type`/channel slug):

```typescript
function humanizeChannel(raw: string): string {
  const map: Record<string, string> = {
    social_ad: "Meta",
    email: "Email",
    sms: "SMS",
    landing_page: "Landing",
    one_pager: "Print",
  };
  return map[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
```

(`lifecycle` is already computed in this builder; reuse the existing variable. If the asset-type list variable has a different name than `assetTypes` in this scope, use whatever feeds the existing `assetTypes` field.)

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean. If `CampaignWorkspaceListItem` is constructed in more than one place, add the two fields to each.

- [ ] **Step 4: Run the read-model tests + commit**

Run: `pnpm test src/lib/campaigns/__tests__/read-model.test.ts`
Expected: PASS (update any fixture asserting the full list-item shape to include `driver` + `channels`).

```bash
git add src/lib/campaigns/read-model.ts src/lib/campaigns/__tests__/read-model.test.ts
git commit -m "feat(campaigns): surface driver + channels on the list read-model"
```

---

## Task 3: Campaign threads + tasks read-model

**Files:**
- Create: `src/lib/campaigns/campaign-threads.ts`
- Test: `src/lib/campaigns/campaign-threads.test.ts`

Fetches the Arc conversations and board tasks linked to one campaign, for the Overview's Work lane + Threads panel. Split into a pure mapper (tested) + an I/O fetcher (guarded by Supabase config).

- [ ] **Step 1: Write the failing test (pure mapper only)**

```typescript
// src/lib/campaigns/campaign-threads.test.ts
import { describe, expect, it } from "vitest";
import { toCampaignTask, type AgentTaskRow } from "./campaign-threads";

const baseRow: AgentTaskRow = {
  id: "11111111-2222-3333-4444-555555555555",
  status: "running",
  priority: "high",
  objective: "Revise Variant B ad copy",
  task_type: "campaign_directive",
  scheduled_for: null,
  due_at: null,
  metadata: { requested_from: "campaign_overview" },
  updated_at: "2026-06-11T12:00:00.000Z",
};

describe("toCampaignTask", () => {
  it("maps a row to a board-style task with a short id and agent driver", () => {
    const t = toCampaignTask(baseRow);
    expect(t.id).toBe("11111111");
    expect(t.objective).toBe("Revise Variant B ad copy");
    expect(t.status).toBe("running");
    expect(t.priority).toBe("High");
    expect(t.driver).toBe("agent");
  });
  it("treats needs_approval as the operator's column (driver = operator)", () => {
    expect(toCampaignTask({ ...baseRow, status: "needs_approval" }).driver).toBe("operator");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/campaigns/campaign-threads.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/campaigns/campaign-threads.ts
import { type SupabaseClient } from "@supabase/supabase-js";

import type { CampaignDriver } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type AgentTaskRow = {
  id: string;
  status: string | null;
  priority: string | null;
  objective: string | null;
  task_type: string | null;
  scheduled_for: string | null;
  due_at: string | null;
  metadata: unknown;
  updated_at: string | null;
};

export type CampaignTask = {
  id: string;
  fullId: string;
  objective: string;
  status: string;
  priority: string;
  driver: CampaignDriver;
  href: string;
};

function titleize(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pure: map an agent_tasks row to the campaign Work-lane card shape. A task in
 *  `needs_approval` is the operator's to act on; everything else is Arc's. */
export function toCampaignTask(row: AgentTaskRow): CampaignTask {
  const status = row.status ?? "queued";
  return {
    id: row.id.slice(0, 8),
    fullId: row.id,
    objective: row.objective ?? "Untitled task",
    status,
    priority: titleize(row.priority, "Medium"),
    driver: status === "needs_approval" ? "operator" : "agent",
    href: `/agent-operations/tasks/${row.id}`,
  };
}

export type CampaignThread = {
  id: string;
  title: string;
  updatedAt: string | null;
  href: string;
};

/** I/O: every board task linked to this campaign, newest first. */
export async function getCampaignTasks(
  campaignId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<CampaignTask[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const { data, error } = await client
    .from("agent_tasks")
    .select("id, status, priority, objective, task_type, scheduled_for, due_at, metadata, updated_at")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false })
    .returns<AgentTaskRow[]>();
  if (error) throw new Error(`campaign tasks query failed: ${error.message}`);
  return (data ?? []).map(toCampaignTask);
}

/** I/O: Arc conversations linked to this campaign, newest first. Mirror the
 *  column list + mapping of `listConversations` in lib/arc-chat/persistence.ts. */
export async function getCampaignThreads(
  campaignId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<CampaignThread[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const { data, error } = await client
    .from("arc_conversations")
    .select("id, title, updated_at")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false })
    .returns<Array<{ id: string; title: string | null; updated_at: string | null }>>();
  if (error) throw new Error(`campaign threads query failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title ?? "Untitled thread",
    updatedAt: r.updated_at,
    href: `/arc?conversation=${r.id}`,
  }));
}
```

> Note: confirm `/arc` reads `?conversation=<id>` to open a thread. Re-read `src/app/arc/page.tsx`; if it uses a different param (e.g. `?c=`), adjust `href` here and in Task 9's Threads panel.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/lib/campaigns/campaign-threads.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/lib/campaigns/campaign-threads.ts src/lib/campaigns/campaign-threads.test.ts
git commit -m "feat(campaigns): read-model for a campaign's threads + board tasks"
```

---

## Task 4: `createTaskAction` accepts an optional `campaignId`

**Files:**
- Modify: `src/app/agent-operations/actions.ts` (re-read first — `createTaskAction` ~line 156)

So the Overview's "+ New task" and `handToMarkAction` can file tasks under a campaign and they appear on the board with a campaign link.

- [ ] **Step 1: Read the campaignId from the form**

Inside `createTaskAction`, after the existing `scheduledFor` parsing block, add:

```typescript
  const campaignId = String(formData.get("campaignId") ?? "").trim() || null;
```

- [ ] **Step 2: Set `campaign_id` on the insert**

In the `.from("agent_tasks").insert({ ... })` object, add `campaign_id: campaignId,` next to `scheduled_for`. In the `source_type`, keep `"operator_request"`; if `campaignId` is set, also set `task_type` to `"campaign_directive"` when the caller didn't pass one. Replace the `taskType` line near the top with:

```typescript
  const campaignIdForType = String(formData.get("campaignId") ?? "").trim();
  const taskType =
    String(formData.get("taskType") ?? "").trim() ||
    (campaignIdForType ? "campaign_directive" : "operator_task");
```

- [ ] **Step 3: Revalidate the campaign page**

Before the existing `revalidatePath("/agent-operations")`, add:

```typescript
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` (clean). Existing callers pass no `campaignId`, so behavior is unchanged for them.

```bash
git add src/app/agent-operations/actions.ts
git commit -m "feat(board): createTaskAction can file a task under a campaign"
```

---

## Task 5: `askMarkToBuildCampaignAction` + `handToMarkAction`

**Files:**
- Modify: `src/app/campaigns/actions.ts` (re-read first)
- Test: `src/app/campaigns/build-campaign.test.ts` (pure parser)

`askMarkToBuildCampaignAction` is the headline intertwine: shell campaign → linked Arc conversation → operator's first message → queued board task → redirect into `/arc`. `handToMarkAction` queues a "continue building" directive for an existing campaign.

- [ ] **Step 1: Write the failing test for the pure parser**

```typescript
// src/app/campaigns/build-campaign.test.ts
import { describe, expect, it } from "vitest";
import { parseBuildPrompt, deriveCampaignName } from "./build-campaign";

describe("parseBuildPrompt", () => {
  it("trims and rejects empty prompts", () => {
    expect(() => parseBuildPrompt("   ")).toThrow();
    expect(parseBuildPrompt("  storm response for landlords ")).toBe("storm response for landlords");
  });
  it("caps the length", () => {
    expect(() => parseBuildPrompt("x".repeat(2001))).toThrow();
  });
});

describe("deriveCampaignName", () => {
  it("titleizes the first clause into a name", () => {
    expect(deriveCampaignName("storm response for flood-zone landlords")).toBe("Storm Response For Flood-Zone Landlords");
  });
  it("truncates long prompts", () => {
    expect(deriveCampaignName("a".repeat(80)).length).toBeLessThanOrEqual(60);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/app/campaigns/build-campaign.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure helper**

```typescript
// src/app/campaigns/build-campaign.ts
const MAX_PROMPT = 2000;

export function parseBuildPrompt(raw: unknown): string {
  const prompt = String(raw ?? "").trim();
  if (!prompt) throw new Error("Describe the campaign you want Arc to build.");
  if (prompt.length > MAX_PROMPT) throw new Error(`Keep it under ${MAX_PROMPT} characters.`);
  return prompt;
}

/** A deterministic campaign name from the prompt (this app derives titles, it
 *  has no LLM in-process). First sentence/clause, titleized, capped at 60. */
export function deriveCampaignName(prompt: string): string {
  const clause = prompt.split(/[.!?\n]/)[0].replace(/\s+/g, " ").trim();
  const titled = clause.replace(/\b\w/g, (c) => c.toUpperCase());
  return titled.length <= 60 ? titled : `${titled.slice(0, 59).trimEnd()}…`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/app/campaigns/build-campaign.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the actions** in `src/app/campaigns/actions.ts`

Add imports at the top:

```typescript
import { createCampaignShell } from "@/lib/campaigns/create";
import { createConversation, assignConversationToCampaign, insertOperatorMessage } from "@/lib/arc-chat/persistence";
import { parseBuildPrompt, deriveCampaignName } from "./build-campaign";
```

Append the actions:

```typescript
/**
 * Operator describes a campaign; Arc builds it. Creates a shell campaign, a Arc
 * conversation linked to it, files the operator's first message, queues a board
 * task (campaign_directive) for Arc, then sends the operator into the chat.
 * Outbound stays locked — Arc drafts, the human approves.
 */
export async function askMarkToBuildCampaignAction(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) {
    redirect("/campaigns?action=not-configured");
  }

  let prompt: string;
  try {
    prompt = parseBuildPrompt(formData.get("prompt"));
  } catch {
    redirect("/campaigns?action=build-error");
  }

  const operator = getOperatorActor();
  const client = getSupabaseAdminClient();
  const name = deriveCampaignName(prompt);

  // Persona/focus are unknown at ask-time; Arc fills them in. Use neutral seeds
  // the create shell accepts (the campaign is draft + launch-locked).
  const { campaignId } = await createCampaignShell({
    operator,
    name,
    persona: "unassigned",
    restorationFocus: "general",
    client,
  });

  const conversation = await createConversation({ operator, title: name }, client);
  await assignConversationToCampaign(conversation.id, campaignId, client);
  await insertOperatorMessage({ conversationId: conversation.id, body: prompt, mentions: [] }, client);

  await client.from("agent_tasks").insert({
    agent_id: (await ensureMarkAgentId(client)),
    status: "queued",
    priority: "high",
    objective: `Build campaign package: ${prompt}`,
    task_type: "campaign_brief_draft",
    campaign_id: campaignId,
    source_type: "campaign_directive",
    source_id: campaignId,
    metadata: {
      requested_from: "campaigns_ask_mark",
      conversation_id: conversation.id,
      human_approval_required: true,
      outbound_dispatch_allowed: false,
    },
  });

  revalidatePath("/campaigns");
  redirect(`/arc?conversation=${conversation.id}`);
}

/**
 * Hand an existing campaign to Arc to keep building. Queues a board task linked
 * to the campaign; no new conversation (the operator can open one from Threads).
 */
export async function handToMarkAction(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) {
    redirect("/campaigns?action=not-configured");
  }
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) redirect("/campaigns?action=build-error");

  const client = getSupabaseAdminClient();
  await client.from("agent_tasks").insert({
    agent_id: (await ensureMarkAgentId(client)),
    status: "queued",
    priority: "medium",
    objective: "Continue building this campaign — draft the remaining assets.",
    task_type: "campaign_directive",
    campaign_id: campaignId,
    source_type: "campaign_directive",
    source_id: campaignId,
    metadata: {
      requested_from: "campaign_overview_hand_to_mark",
      human_approval_required: true,
      outbound_dispatch_allowed: false,
    },
  });

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}?action=handed-to-arc`);
}

/** Ensure the Arc agent row exists and return its id. Mirrors `ensureMarkAgent`
 *  in agent-operations/actions.ts — extract the shared helper if it drifts. */
async function ensureMarkAgentId(client = getSupabaseAdminClient()): Promise<string> {
  const { data, error } = await client
    .from("agents")
    .upsert({ key: "arc", name: "Arc", status: "ready" }, { onConflict: "key" })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(`agents upsert failed: ${error.message}`);
  return data.id;
}
```

> Note: re-read `createConversation` / `insertOperatorMessage` signatures in `lib/arc-chat/persistence.ts` and match argument shapes exactly (param object keys may differ — e.g. `insertOperatorMessage` may want `{ conversationId, body, mentions }` or positional args). Adjust the calls to the real signatures; keep the composition identical.

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/app/campaigns/actions.ts src/app/campaigns/build-campaign.ts src/app/campaigns/build-campaign.test.ts
git commit -m "feat(campaigns): ask-Arc-to-build + hand-to-Arc actions"
```

---

## Task 6: `AskMarkBar` component

**Files:**
- Create: `src/app/campaigns/_components/ask-arc-bar.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/campaigns/_components/ask-arc-bar.tsx
import { MarkAvatar } from "@/app/arc/_components/arc-avatar";
import { theme, cx } from "@/app/_components/theme";
import { buttonClasses } from "@/app/_components/page-header";
import { askMarkToBuildCampaignAction } from "../actions";

/** The "describe a campaign → Arc builds it" entry on the list page. Server
 *  component wrapping a form posting to the build action. */
export function AskMarkBar() {
  return (
    <form
      action={askMarkToBuildCampaignAction}
      className={cx(theme.surface.inset, "module-rise mb-4 flex items-center gap-3 rounded-lg border px-3 py-2.5")}
    >
      <MarkAvatar size={24} />
      <input
        name="prompt"
        type="text"
        maxLength={2000}
        placeholder="Describe a campaign and Arc will build it — e.g. “Storm response for flood-zone landlords this week”"
        className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
      />
      <button type="submit" className={buttonClasses({ size: "sm" })}>Build</button>
    </form>
  );
}
```

- [ ] **Step 2: Verify the theme tokens exist**

Confirm `theme.surface.inset` and `theme.surface.pageHeader`/`panel` exist (they're used by `page-header.tsx`). Run: `pnpm exec tsc --noEmit`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/ask-arc-bar.tsx
git commit -m "feat(campaigns): ask-Arc build bar"
```

---

## Task 7: `CampaignCard` component

**Files:**
- Create: `src/app/campaigns/_components/campaign-card.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/campaigns/_components/campaign-card.tsx
import Link from "next/link";
import Image from "next/image";

import { campaignLifecycleTone, needsYouCount } from "@/domain";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { EntityAvatar } from "@/app/_components/entity-avatar";
import { StatusPill } from "@/app/_components/page-header";
import { theme, cx } from "@/app/_components/theme";

export function CampaignCard({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  const needsYou = needsYouCount(campaign);
  const tone = campaignLifecycleTone(campaign.lifecycle);
  const owner =
    campaign.driver === "agent"
      ? ({ kind: "agent" } as const)
      : ({ kind: "human", name: campaign.owner ?? "You" } as const);

  return (
    <Link
      href={campaign.href}
      className={cx(theme.surface.panel, "module-rise group flex flex-col gap-3 overflow-hidden rounded-xl p-0 no-underline transition")}
    >
      {/* cover */}
      <div className="flex h-16 gap-px bg-[var(--canvas-deep)]">
        {campaign.thumbnailUrl ? (
          <Image src={campaign.thumbnailUrl} alt="" width={400} height={64} unoptimized className="h-16 w-full object-cover" />
        ) : (
          <div className="grid h-16 w-full place-items-center text-[11px] text-[var(--text-muted)]">
            {campaign.lifecycle === "Drafting" ? "Arc is drafting assets…" : "No creative yet"}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 pb-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate font-display text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            {campaign.name}
          </h3>
          <StatusPill tone={tone}>{campaign.lifecycle}</StatusPill>
        </div>

        <p className={cx("truncate", theme.text.bodyMuted)}>
          {[campaign.persona, ...campaign.channels].filter(Boolean).join(" · ")}
        </p>

        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className={needsYou > 0 ? "font-semibold text-[var(--warn)]" : "text-[var(--text-muted)]"}>
            {campaign.assetCount} asset{campaign.assetCount === 1 ? "" : "s"}
            {needsYou > 0 ? ` · ${needsYou} need you` : ""}
          </span>
          <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
            <EntityAvatar owner={owner} size={16} pending={campaign.lifecycle === "Drafting"} />
            {campaign.updatedAt}
          </span>
        </div>
      </div>
    </Link>
  );
}
```

> Note: confirm `theme.text.bodyMuted` exists; if the muted body token has another name (e.g. `theme.text.body` + a muted variant), use the closest existing token. `AvatarOwner` for a human may require fields beyond `{ kind, name }` — re-read `entity-avatar.helpers.ts` and match (initials are derived from `name`).

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/app/campaigns/_components/campaign-card.tsx
git commit -m "feat(campaigns): campaign card with driver avatar + needs-you"
```

---

## Task 8: List page — cards + filters + ask-Arc bar

**Files:**
- Modify: `src/app/campaigns/_components/campaign-library.tsx` (re-read first), `src/app/campaigns/page.tsx`

- [ ] **Step 1: Rewrite `campaign-library.tsx` body**

Replace its render with: an `AskMarkBar`, a filter pill row, and a responsive card grid. Keep the existing `{ campaigns, activeStatus, nowMs }` props and the lifecycle ordering ("needs you" first).

```tsx
// src/app/campaigns/_components/campaign-library.tsx
import Link from "next/link";

import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { needsYouCount } from "@/domain";
import { theme, cx } from "@/app/_components/theme";

import { AskMarkBar } from "./ask-arc-bar";
import { CampaignCard } from "./campaign-card";

const FILTERS = [
  { key: "needs-you", label: "Needs you" },
  { key: "live", label: "Live" },
  { key: "in-progress", label: "In progress" },
  { key: "drafts", label: "Drafts" },
  { key: "", label: "All" },
] as const;

function matchesFilter(c: CampaignWorkspaceListItem, key: string): boolean {
  switch (key) {
    case "needs-you": return needsYouCount(c) > 0;
    case "live": return c.lifecycle === "Live";
    case "in-progress": return c.lifecycle === "Drafting" || c.lifecycle === "Ready";
    case "drafts": return c.lifecycle === "Drafting";
    default: return true;
  }
}

const ORDER: Record<CampaignWorkspaceListItem["lifecycle"], number> = {
  "In review": 0, "Ready": 1, "Drafting": 2, "Live": 3,
};

export function CampaignLibrary({
  campaigns,
  activeStatus,
}: {
  campaigns: CampaignWorkspaceListItem[];
  activeStatus: string;
  nowMs: number;
}) {
  const visible = campaigns
    .filter((c) => matchesFilter(c, activeStatus))
    .sort((a, b) => ORDER[a.lifecycle] - ORDER[b.lifecycle]);

  return (
    <div className="flex flex-col">
      <AskMarkBar />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = f.key ? campaigns.filter((c) => matchesFilter(c, f.key)).length : campaigns.length;
          const active = activeStatus === f.key;
          return (
            <Link
              key={f.key || "all"}
              href={f.key ? `/campaigns?status=${f.key}` : "/campaigns"}
              className={cx(
                "rounded-full border px-3 py-1 text-[11px] font-medium no-underline transition",
                active
                  ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                  : "border-[var(--border-panel)] bg-[var(--surface-inset)] text-[var(--text-secondary)]",
              )}
            >
              {f.label}{f.key ? ` · ${count}` : ""}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((c) => <CampaignCard key={c.id} campaign={c} />)}
      </div>
    </div>
  );
}
```

> Note: keep whatever `cx`/token import paths the file already used. The earlier `nowMs` prop stays in the signature (page passes it) even if now unused — or drop it from both the component and `page.tsx`.

- [ ] **Step 2: Update the header CTA in `page.tsx`**

In `CampaignsHeader`, change the "Needs you" pill tone to `amber` (gold) and point the CTA at the chooser. Replace the `<Link href="/campaigns/new" …>＋ Ask Arc to build one</Link>` with:

```tsx
<Link href="/campaigns/new" className={buttonClasses({ size: "sm" })}>New campaign</Link>
```

And change the pending pill to `<StatusPill tone="amber">{pendingCount} awaiting you</StatusPill>` (it may already be amber — verify against DESIGN: gold, not red).

- [ ] **Step 3: Typecheck + lint changed files**

```bash
pnpm exec tsc --noEmit
pnpm exec eslint src/app/campaigns/_components/campaign-library.tsx src/app/campaigns/_components/campaign-card.tsx src/app/campaigns/_components/ask-arc-bar.tsx src/app/campaigns/page.tsx
```
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns/page.tsx src/app/campaigns/_components/campaign-library.tsx
git commit -m "feat(campaigns): list page — ask-Arc bar, filters, status cards"
```

---

## Task 9: Campaign Overview composition

**Files:**
- Create: `src/app/campaigns/_components/campaign-overview.tsx` + `overview/{at-a-glance,package-panel,whats-live,audience-panel,work-lane,threads-panel,history-timeline}.tsx`

Each section is a small focused component reading from the existing `LiveCampaignWorkspace` detail (`getCampaignWorkspaceDetail`) plus the Task 3 read-model. Keep each file single-responsibility.

- [ ] **Step 1: `at-a-glance.tsx`** — Arc's "why" in serif + facts.

```tsx
// src/app/campaigns/_components/overview/at-a-glance.tsx
import { Panel } from "@/app/_components/page-header";
import { theme, cx } from "@/app/_components/theme";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

export function AtAGlance({ detail }: { detail: LiveCampaignWorkspace }) {
  const { reasoning, campaign } = detail;
  const facts: Array<[string, string]> = [
    ["Objective", campaign.objective || "—"],
    ["Audience", campaign.audienceSummary || "—"],
    ["Offer", campaign.offerSummary || "—"],
    ["Recommended", reasoning.recommendedAction || "—"],
  ];
  return (
    <Panel>
      <p className={theme.text.eyebrow}>At a glance</p>
      {reasoning.whyBuilt ? (
        <p className="mt-3 font-serif text-[15px] leading-relaxed text-[var(--text-primary)]">“{reasoning.whyBuilt}”</p>
      ) : null}
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="text-[13px]">
            <dt className={cx("inline", theme.text.bodyMuted)}>{k}&nbsp;&nbsp;</dt>
            <dd className="inline text-[var(--text-primary)]">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
```

> Note: confirm the serif family is exposed as a Tailwind `font-serif` (DESIGN says Fraunces via `--font-serif`). If not wired as a utility, use `style={{ fontFamily: "var(--font-serif)" }}`.

- [ ] **Step 2: `package-panel.tsx`** — the asset grid with inline approve/decline.

Use the existing `decideAssetAction` (a `useActionState`-shaped action). Because it needs client state, make `package-panel.tsx` a `"use client"` component that maps `detail.assets` to tiles; each tile is a form with two submit buttons (`decision=approved|declined`) plus a status pill. Reuse `AssetThumb` for the visual.

```tsx
// src/app/campaigns/_components/overview/package-panel.tsx
"use client";

import { useActionState } from "react";

import { Panel, StatusPill } from "@/app/_components/page-header";
import { theme, cx } from "@/app/_components/theme";
import { AssetThumb } from "@/app/arc/_components/asset-thumb";
import { decideAssetAction, type DecisionActionState } from "../../actions";
import type { CampaignWorkspaceAsset } from "@/lib/campaigns/read-model";
import type { MarkActionCard } from "@/domain";

function assetTone(status: string): "amber" | "green" | "red" | "gray" {
  if (status === "approved") return "green";
  if (status === "declined") return "red";
  if (status === "pending_approval") return "amber";
  return "gray";
}

/** Adapt a campaign asset to the MarkActionCard shape AssetThumb expects. */
function toCard(a: CampaignWorkspaceAsset): MarkActionCard {
  return {
    kind: "draft",
    title: a.title,
    channel: a.channel,
    format: a.assetType,
    rows: [],
    flags: [],
    preview: a.preview,
  };
}

function AssetTile({ asset, campaignId }: { asset: CampaignWorkspaceAsset; campaignId: string }) {
  const [state, action, pending] = useActionState<DecisionActionState, FormData>(decideAssetAction, null);
  const decided = asset.status === "approved" || asset.status === "declined";
  return (
    <div className={cx(theme.surface.inset, "flex flex-col overflow-hidden rounded-lg border")}>
      <div className="relative h-[70px]">
        <AssetThumb card={toCard(asset)} media={asset.media[0] ? { kind: "image", url: asset.media[0].url } : undefined} />
        <span className="absolute right-1.5 top-1.5">
          <StatusPill tone={assetTone(asset.status)}>{asset.status.replace(/_/g, " ")}</StatusPill>
        </span>
      </div>
      <div className="flex flex-col gap-1 p-2.5">
        <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{asset.title}</p>
        <p className="truncate text-[10px] text-[var(--text-muted)]">{asset.channel}</p>
        {!decided ? (
          <form action={action} className="mt-1 flex gap-1.5">
            <input type="hidden" name="assetId" value={asset.id} />
            <input type="hidden" name="campaignId" value={campaignId} />
            <button name="decision" value="approved" disabled={pending}
              className="flex-1 rounded-md bg-[var(--accent)] py-1 text-[10px] font-semibold text-[var(--on-accent)] disabled:opacity-60">Approve</button>
            <button name="decision" value="declined" disabled={pending}
              className="flex-1 rounded-md border border-[var(--border-panel)] bg-[var(--surface-raised)] py-1 text-[10px] text-[var(--text-secondary)] disabled:opacity-60">Decline</button>
          </form>
        ) : null}
        {state && !state.ok ? <p className="text-[10px] text-[var(--priority)]">{state.message}</p> : null}
      </div>
    </div>
  );
}

export function PackagePanel({ detail }: { detail: import("@/lib/campaigns/read-model").LiveCampaignWorkspace }) {
  const approved = detail.assets.filter((a) => a.status === "approved").length;
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <p className={theme.text.eyebrow}>The package · {detail.assets.length} assets</p>
        <span className="text-[12px] text-[var(--text-muted)]">{approved} of {detail.assets.length} approved</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {detail.assets.map((a) => <AssetTile key={a.id} asset={a} campaignId={detail.campaign.id} />)}
      </div>
    </Panel>
  );
}
```

> Note: confirm `MarkActionCard` required fields (from `@/domain`) — `rows`/`flags` are arrays, `kind` is `"draft"|"result"`. Match exactly so `toCard` typechecks. `CampaignMediaAsset` shape: pass `{ kind: "image", url }`; check `MarkMedia` requires only `kind` + `url` (it does, per `domain/arc-chat.ts`).

- [ ] **Step 3: `whats-live.tsx`** — launch state counts + the launch gate.

```tsx
// src/app/campaigns/_components/overview/whats-live.tsx
"use client";
import { useActionState } from "react";
import { Panel } from "@/app/_components/page-header";
import { theme } from "@/app/_components/theme";
import { launchCampaignAction, type LaunchActionState } from "../../actions";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

export function WhatsLive({ detail }: { detail: LiveCampaignWorkspace }) {
  const [state, action, pending] = useActionState<LaunchActionState, FormData>(launchCampaignAction, null);
  const s = detail.launchState;
  const stat = (n: number, label: string, color?: string) => (
    <div><div className="font-display text-[22px]" style={color ? { color } : undefined}>{n}</div><div className="text-[11px] text-[var(--text-muted)]">{label}</div></div>
  );
  return (
    <Panel>
      <p className={theme.text.eyebrow}>What&apos;s live</p>
      <div className="mt-3 flex items-center gap-6">
        {stat(s.deployedCount, "deployed", "var(--ok)")}
        {stat(s.approvedCount, "approved · locked")}
        {stat(s.pendingCount, "awaiting you", s.pendingCount > 0 ? "var(--warn)" : undefined)}
        <form action={action} className="ml-auto">
          <input type="hidden" name="campaignId" value={detail.campaign.id} />
          <button type="submit" disabled={!s.ready || pending}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-[var(--on-accent)] disabled:opacity-50">
            {s.live ? "Launched" : "Launch"}
          </button>
        </form>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">Outbound stays locked until you launch.</p>
      {state ? <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{state.message}</p> : null}
    </Panel>
  );
}
```

- [ ] **Step 4: `audience-panel.tsx`** — personas + linked records + sources.

```tsx
// src/app/campaigns/_components/overview/audience-panel.tsx
import Link from "next/link";
import { Panel } from "@/app/_components/page-header";
import { theme } from "@/app/_components/theme";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

export function AudiencePanel({ detail }: { detail: LiveCampaignWorkspace }) {
  const records = detail.sources.filter((s) => s.kind === "company" || s.kind === "contact" || s.kind === "lead");
  const evidence = detail.sources.filter((s) => s.kind === "web" || s.kind === "evidence");
  return (
    <Panel>
      <p className={theme.text.eyebrow}>Audience</p>
      <p className="mt-2 inline-flex rounded-full border border-[var(--border-panel)] bg-[var(--surface-inset)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
        {detail.campaign.persona}
      </p>
      <ul className="mt-3 flex flex-col gap-1.5 text-[12px] text-[var(--text-secondary)]">
        {records.slice(0, 5).map((r) => (
          <li key={r.id} className="truncate">
            {r.recordHref ? <Link href={r.recordHref} className="no-underline hover:text-[var(--text-primary)]">{r.label}</Link> : r.label}
            <span className="text-[var(--text-muted)]"> · {r.kind}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-[var(--text-muted)]">{records.length} records · {evidence.length} evidence sources</p>
    </Panel>
  );
}
```

- [ ] **Step 5: `work-lane.tsx`** — the campaign's board tasks + "+ New task" + "Hand to Arc".

```tsx
// src/app/campaigns/_components/overview/work-lane.tsx
import Link from "next/link";
import { Panel } from "@/app/_components/page-header";
import { theme, cx } from "@/app/_components/theme";
import { EntityAvatar } from "@/app/_components/entity-avatar";
import { handToMarkAction } from "../../actions";
import type { CampaignTask } from "@/lib/campaigns/campaign-threads";

export function WorkLane({ campaignId, tasks }: { campaignId: string; tasks: CampaignTask[] }) {
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <p className={theme.text.eyebrow}>Work · the board lane</p>
        <Link href={`/board?campaign=${campaignId}`} className="text-[11px] text-[var(--accent)] no-underline">Open in board</Link>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="text-[12px] text-[var(--text-muted)]">No active work. Hand it to Arc to keep building.</p>
        ) : tasks.map((t) => (
          <Link key={t.fullId} href={t.href} className={cx(theme.surface.inset, "flex items-center gap-2 rounded-lg border px-3 py-2 no-underline")}>
            <EntityAvatar owner={t.driver === "agent" ? { kind: "agent" } : { kind: "human", name: "You" }} size={16} pending={t.status === "running"} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-primary)]">{t.objective}</span>
            <span className={cx("text-[10px]", t.driver === "operator" ? "text-[var(--warn)]" : "text-[var(--text-muted)]")}>
              {t.status.replace(/_/g, " ")}
            </span>
          </Link>
        ))}
      </div>
      <form action={handToMarkAction} className="mt-3">
        <input type="hidden" name="campaignId" value={campaignId} />
        <button type="submit" className="text-[11px] text-[var(--accent)]">+ Hand to Arc</button>
      </form>
    </Panel>
  );
}
```

- [ ] **Step 6: `threads-panel.tsx`** — Arc conversations under the campaign.

```tsx
// src/app/campaigns/_components/overview/threads-panel.tsx
import Link from "next/link";
import { Panel } from "@/app/_components/page-header";
import { theme, cx } from "@/app/_components/theme";
import { MarkAvatar } from "@/app/arc/_components/arc-avatar";
import type { CampaignThread } from "@/lib/campaigns/campaign-threads";

export function ThreadsPanel({ threads }: { threads: CampaignThread[] }) {
  return (
    <Panel>
      <p className={theme.text.eyebrow}>Arc threads</p>
      <div className="mt-3 flex flex-col gap-2">
        {threads.length === 0 ? (
          <p className="text-[12px] text-[var(--text-muted)]">No conversations yet.</p>
        ) : threads.map((t) => (
          <Link key={t.id} href={t.href} className={cx(theme.surface.inset, "flex items-center gap-2 rounded-lg border px-3 py-2 no-underline")}>
            <MarkAvatar size={15} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-primary)]">{t.title}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 7: `history-timeline.tsx`** — collapsible decisions + audit.

```tsx
// src/app/campaigns/_components/overview/history-timeline.tsx
import { Panel } from "@/app/_components/page-header";
import { theme } from "@/app/_components/theme";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

export function HistoryTimeline({ detail }: { detail: LiveCampaignWorkspace }) {
  return (
    <Panel>
      <details>
        <summary className={theme.text.eyebrow} style={{ cursor: "pointer" }}>
          History · {detail.auditLog.length} events
        </summary>
        <ul className="mt-3 flex flex-col gap-2 text-[12px]">
          {detail.auditLog.slice(0, 30).map((e, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="text-[var(--text-secondary)]">{e.detail ?? e.type ?? "event"}</span>
              <span className="shrink-0 text-[var(--text-muted)]">{e.occurredAt ?? ""}</span>
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}
```

> Note: re-read the `AuditEntry` type in `read-model.ts` and match field names (`detail`/`type`/`occurredAt` may differ). Adjust the row render to the real fields.

- [ ] **Step 8: Compose `campaign-overview.tsx`** (server component, asymmetric two-column).

```tsx
// src/app/campaigns/_components/campaign-overview.tsx
import { getCampaignTasks, getCampaignThreads } from "@/lib/campaigns/campaign-threads";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

import { AtAGlance } from "./overview/at-a-glance";
import { PackagePanel } from "./overview/package-panel";
import { WhatsLive } from "./overview/whats-live";
import { AudiencePanel } from "./overview/audience-panel";
import { WorkLane } from "./overview/work-lane";
import { ThreadsPanel } from "./overview/threads-panel";
import { HistoryTimeline } from "./overview/history-timeline";

export async function CampaignOverview({ detail }: { detail: LiveCampaignWorkspace }) {
  const campaignId = detail.campaign.id;
  const [tasks, threads] = await Promise.all([getCampaignTasks(campaignId), getCampaignThreads(campaignId)]);

  return (
    <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[1.7fr_1fr]">
      <div className="flex flex-col gap-3.5">
        <AtAGlance detail={detail} />
        <PackagePanel detail={detail} />
        <WhatsLive detail={detail} />
      </div>
      <div className="flex flex-col gap-3.5">
        <AudiencePanel detail={detail} />
        <WorkLane campaignId={campaignId} tasks={tasks} />
        <ThreadsPanel threads={threads} />
        <HistoryTimeline detail={detail} />
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Typecheck + lint + commit**

```bash
pnpm exec tsc --noEmit
pnpm exec eslint src/app/campaigns/_components/campaign-overview.tsx src/app/campaigns/_components/overview/*.tsx
```
Fix every type/field mismatch against the real `read-model.ts` types (this is where re-reading pays off). Then:

```bash
git add src/app/campaigns/_components/campaign-overview.tsx src/app/campaigns/_components/overview
git commit -m "feat(campaigns): Overview composition (at-a-glance, package, what's-live, audience, work, threads, history)"
```

---

## Task 10: Wire Overview into the campaign page (fold the 7 tabs)

**Files:**
- Modify: `src/app/campaigns/_components/campaign-workspace.tsx` (re-read first), `src/app/campaigns/[campaignId]/page.tsx` (only if a header lives there)

- [ ] **Step 1: Replace the workspace body with the header + Overview**

`campaign-workspace.tsx` currently renders the 7-tab `TabNav` + tab panels + sticky decision bar. Replace its return with the `PageHeader` (serif title, status pill, persona subline, `backHref="/campaigns"`, aside = driver avatars + "Open in Arc" + the launch gate handled inside Overview's WhatsLive) followed by `<CampaignOverview detail={detail} />`. Keep the `{ detail, dispatches }` prop signature so `page.tsx` is unchanged.

```tsx
// src/app/campaigns/_components/campaign-workspace.tsx  (new body — keep existing imports you still use)
import Link from "next/link";
import { PageHeader, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { EntityAvatar } from "@/app/_components/entity-avatar";
import { campaignLifecycleTone } from "@/domain";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import type { CampaignDispatch } from "@/lib/dispatch/read-model";
import { CampaignOverview } from "./campaign-overview";

export function CampaignWorkspace({ detail }: { detail: LiveCampaignWorkspace; dispatches: CampaignDispatch[] }) {
  const { campaign, launchState } = detail;
  // First Arc thread for this campaign opens via the markConversation linkage;
  // fall back to a campaign-scoped /arc deep link.
  const openInMark = `/arc?campaign=${campaign.id}`;
  return (
    <>
      <PageHeader
        eyebrow="Campaign"
        title={campaign.name}
        description={`${campaign.persona}${campaign.objective ? ` · ${campaign.objective}` : ""}`}
        backHref="/campaigns"
        backLabel="campaigns"
        aside={
          <div className="flex shrink-0 items-center gap-2">
            <EntityAvatar owner={{ kind: "agent" }} size={22} />
            <StatusPill tone={campaignLifecycleTone(launchState.lifecycle)}>{launchState.lifecycle}</StatusPill>
            <Link href={openInMark} className={buttonClasses({ variant: "ghost", size: "sm" })}>Open in Arc</Link>
          </div>
        }
      />
      <CampaignOverview detail={detail} />
    </>
  );
}
```

> Note: confirm `/arc` supports a `?campaign=<id>` deep link that opens or creates a campaign-scoped thread. If not, change "Open in Arc" to link to the newest thread from `getCampaignThreads`, or to `/arc` plainly — and capture wiring a campaign deep-link as a follow-up. `CampaignDispatch` import path: match the real type from `@/lib/dispatch/read-model`.

- [ ] **Step 2: Delete now-dead tab components if unreferenced**

After the rewrite, these are no longer imported: `approvals-tab.tsx`, `creative-tab.tsx`, `performance-tab.tsx`, `reasoning-tab.tsx`, `audience-leads-tab.tsx`, `campaign-media-board.tsx`, `sticky-decision-bar.tsx`, `campaign-triage-strip.tsx`, `momentum-strip.tsx`, `arc-conversation.tsx`. Run a grep to confirm zero references, then delete. Keep `campaign-economics-panel.tsx` (still mounted by `page.tsx`).

```bash
grep -rl "creative-tab\|approvals-tab\|reasoning-tab\|sticky-decision-bar\|arc-conversation\|campaign-triage-strip\|momentum-strip" src/app/campaigns
```
Delete only files with no remaining references.

- [ ] **Step 3: Typecheck + lint + commit**

```bash
pnpm exec tsc --noEmit
pnpm exec eslint src/app/campaigns/_components/campaign-workspace.tsx
```

```bash
git add -A src/app/campaigns
git commit -m "feat(campaigns): campaign page = Overview; retire the 7 tabs"
```

---

## Task 11: New-campaign chooser

**Files:**
- Create: `src/app/campaigns/_components/new-campaign-chooser.tsx`
- Modify: `src/app/campaigns/new/page.tsx` (re-read first)

- [ ] **Step 1: Implement the chooser** (client; three paths)

```tsx
// src/app/campaigns/_components/new-campaign-chooser.tsx
"use client";
import { useState } from "react";
import { theme, cx } from "@/app/_components/theme";
import { MarkAvatar } from "@/app/arc/_components/arc-avatar";
import { askMarkToBuildCampaignAction } from "../actions";

export function NewCampaignChooser({ manualForm }: { manualForm: React.ReactNode }) {
  const [mode, setMode] = useState<"choose" | "manual">("choose");
  if (mode === "manual") return <>{manualForm}</>;

  return (
    <div className="flex flex-col gap-3">
      <form action={askMarkToBuildCampaignAction} className={cx(theme.surface.panel, "flex flex-col gap-2 rounded-xl p-4")}>
        <div className="flex items-center gap-2"><MarkAvatar size={20} /><span className="text-sm font-semibold text-[var(--text-primary)]">Ask Arc to build it</span></div>
        <textarea name="prompt" rows={2} maxLength={2000} placeholder="Describe the campaign…" className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] p-2.5 text-sm text-[var(--text-primary)] focus:outline-none" />
        <button type="submit" className="self-start rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--on-accent)]">Build with Arc</button>
      </form>

      <button onClick={() => setMode("manual")} className={cx(theme.surface.inset, "rounded-xl border p-4 text-left")}>
        <div className="text-sm font-semibold text-[var(--text-primary)]">I&apos;ll set it up</div>
        <div className="text-[12px] text-[var(--text-muted)]">Create it by hand, then hand to Arc anytime.</div>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Host it in `new/page.tsx`**

Wrap the existing manual `CampaignCreateForm` as the `manualForm` prop of `NewCampaignChooser` inside the existing page shell (keep the `PageHeader`/back-link).

- [ ] **Step 3: Typecheck + lint + commit**

```bash
pnpm exec tsc --noEmit
pnpm exec eslint src/app/campaigns/_components/new-campaign-chooser.tsx src/app/campaigns/new/page.tsx
git add src/app/campaigns/_components/new-campaign-chooser.tsx src/app/campaigns/new/page.tsx
git commit -m "feat(campaigns): who-drives creation chooser (ask Arc / manual)"
```

---

## Task 12: Demo-mode parity + full verification

The campaigns list/detail read-models already degrade to "unavailable" without Supabase. Ensure the new pieces don't throw in preview mode (the Task 3 read-model returns `[]` when unconfigured — good).

- [ ] **Step 1: Full typecheck + scoped lint**

```bash
pnpm exec tsc --noEmit
pnpm exec eslint src/app/campaigns src/lib/campaigns/campaign-threads.ts src/domain/campaign-presentation.ts
```
Expected: both clean.

- [ ] **Step 2: Run the unit suites touched**

```bash
pnpm test src/domain/__tests__/campaign-presentation.test.ts src/lib/campaigns
```
Expected: all green.

- [ ] **Step 3: Visual check (headless Chrome)**

Start (or reuse) dev server, then screenshot at 1280px and 1260px:
- `/campaigns` — ask-Arc bar, filters, status cards with driver avatars + gold "needs you".
- `/campaigns/<id>` — Overview: At a glance, package with inline Approve/Decline, What's live, Audience, Work lane, Threads, History; "Open in Arc" + Launch in the header.
- `/campaigns/new` — the chooser.

Use the project's `chrome-browser` skill (`scripts/screenshot.js <url> <out> 1280 900`). Confirm: no emojis, gold (not red) for "needs you", serif title, panels not nested.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test(campaigns): verify Phase 1 redesign (tsc, lint, units, screenshots)"
```

---

## Self-Review

- **Spec coverage:**
  - List page cards + ask-Arc bar + needs-you filter + new-campaign chooser → Tasks 5–8, 11. ✓
  - Campaign Overview folding the 7 tabs (at-a-glance / package+inline-approve / what's-live / audience / work lane / threads / history) → Tasks 9–10. ✓
  - Board-as-spine: campaign tasks via `campaign_id`, driver avatars, "+ Hand to Arc", "Open in board" → Tasks 3–5, 9. ✓
  - Arc handoff: ask-to-build creates shell + linked conversation + queued task + redirect to `/arc`; "Open in Arc" → Tasks 5, 10. ✓
  - No migration; additive; approval-gated; outbound locked → Tasks 4–5 (metadata flags), inline approve reuses `decideAssetAction`. ✓
  - DESIGN.md: tokens-only, gold not red, serif titles, EntityAvatar reuse → all UI tasks. ✓
- **Placeholder scan:** No "TBD"/"add validation"-style gaps; every code step has real code. The `> Note:` callouts flag exact existing signatures to re-read (not placeholders — concrete integration checks).
- **Type consistency:** `CampaignDriver`/`campaignDriver`/`campaignLifecycleTone`/`needsYouCount` (Task 1) are used identically in Tasks 2, 7, 8, 10. `CampaignTask`/`CampaignThread` (Task 3) flow into Task 9 unchanged. `decideAssetAction`/`DecisionActionState`, `launchCampaignAction`/`LaunchActionState` match `actions.ts`. `askMarkToBuildCampaignAction`/`handToMarkAction` (Task 5) are consumed by Tasks 6, 9, 11.
- **Deferred to later plans (per spec):** Board view toggle on the campaign page, `/board?campaign=` filtering UI + human-owned tasks migration (Phase 2), live Arc dock (Phase 3).
```

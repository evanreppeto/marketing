# Campaigns × Board × Mark — Redesign Spec

**Date:** 2026-06-11
**Status:** Approved direction (Direction A layout + Board toggle + deferred live dock). Phased.

## Problem

The Campaigns feature is feature-complete but **complexity-dense and disconnected from Mark**:

- The **list page** groups campaigns by lifecycle but the only creation path is a single "Ask Mark to build one" link.
- The **detail page** is **7 dense tabs** (Creative, Media, Decision log, Audience & sources, Talk to Mark, Measurement, Audit) with redundant data paths. "Talk to Mark" is a **read-only transcript** that queues `agent_task` rows — it is *not* the real live Mark chat + Studio that now exists at `/mark`.
- The **board** (`/board`, "you and Mark share this board") is a separate surface. Campaign work and board work feel unrelated even though a board task can already carry `campaign_id`.

The app's whole premise is **humans and Mark working synchronously, approval-gated**. The campaigns surface should embody that: a place to *see* status and *start work* — for both a human and Mark — not a tab maze.

## Vision: one spine, three lenses

A **campaign** is the deliverable (assets + audience + approvals + lifecycle). Everything else hangs off three existing surfaces that share one data spine:

- **Spine** — a campaign's *work* is `agent_tasks` rows linked by `campaign_id`, flowing the board's 5 columns (Queued → Running → Blocked → Needs approval → Completed). Every task carries an **EntityAvatar** (Mark's sphere or a human's photo) = *who is driving*. A campaign's *conversations* are Mark threads (`mark_conversations.campaign_id`).
- **`/board`** — every task across *all* campaigns: the cross-campaign cockpit.
- **`/campaigns/[id]`** — one campaign's deliverable + *its slice of that board* + a redirect into Mark.
- **`/mark`** — open a thread to actually do the work; the Studio loads that campaign's assets (already wired via `activeCampaignId`).

"Open in Mark" is the redirect: it opens `/mark` on a thread scoped to the campaign (creating one if needed), Studio loaded. A revision spawns a **new thread** (and a board task) filed under the campaign.

This reuses what already exists (board cards, columns, create+schedule, the Studio, the campaigns read-model/actions, `EntityAvatar`/`MarkAvatar`) rather than inventing parallel systems.

## Design system (non-negotiable)

Follow `DESIGN.md` — **Obsidian & Gold**. Build from `globals.css` tokens + `theme.ts`; never hard-code hex. No emojis, no neon/purple "AI" aesthetic, no nested cards, no equal 3-column rows, no decorative bg imagery behind headers, no side-stripe accent borders. **Red (`--priority`) is destructive/risk only** — "needs you" is **gold (`--warn`)**. Serif (Fraunces) for page titles + Mark's voice; Archivo for metrics/labels; SVG line icons only. Reuse `PageHeader`/`Panel`/`StatusPill`/`Button`/`TabNav`/`EmptyState` and the board's `EntityAvatar`.

This is a **product for any Hermes operator**, not BSR-only chrome: copy in the page shell stays generic ("Mark" is the surfaced agent name); BSR specifics live in data, not layout.

---

## Phase 1 — List page + Campaign Overview + Mark handoff

### 1A. Campaigns list page (`/campaigns`)

- **Header** (`PageHeader`): eyebrow "Library", title "Campaigns", description. Aside: a gold `StatusPill` "N awaiting you" (green "All decided" when zero) + primary `Button` **"New campaign"** → opens the creation chooser (1C).
- **Ask-Mark command bar** — an inset input (`--surface-inset`, gold focus) with a `MarkAvatar`: *"Describe a campaign and Mark will build it…"*. Submit → `askMarkToBuildCampaignAction`: creates a campaign shell (`createCampaignShell`) + a build task (`agent_tasks`, `task_type: "campaign_brief_draft"`, `campaign_id`) + a Mark thread scoped to the campaign, then redirects to `/mark` on that thread. This is the headline human↔Mark intertwine.
- **Filters** — pill row / `TabNav`: **Needs you** · Live · In progress · Drafts · All. Default ordering floats "Needs you" first (reuse today's lifecycle partition).
- **Campaign cards** (asymmetric grid, not equal-3): cover thumbnail strip (approved media), serif name, status `StatusPill` (In review / Live / Drafting / Ready), audience one-liner, an inside-count ("6 assets · **2 need you**" in gold when pending), **driver EntityAvatars** (Mark + human), relative time. A *Drafting* card where Mark is actively working uses the single allowed `status-breathe` indicator. Click → campaign page.
- Replaces today's `campaign-triage-strip` / `momentum-strip` complexity with the simpler card affordance (keep a slim "needs you" emphasis at top if useful).

### 1B. Campaign page (`/campaigns/[id]`) — Overview (Direction A)

`PageHeader` with `backHref="/campaigns"`: serif title, status pill, persona/channels subline. Aside: **driver EntityAvatars** + `Button` ghost **"Open in Mark"** + `Button` primary **"Launch"** (gated by launch state). Directly under the header, a `TabNav` view toggle: **Overview** (default) | **Board** (Phase 2).

**Overview** is one calm scroll, asymmetric two-column (≈1.7 / 1):

Main column:
1. **At a glance** (`Panel`) — Mark's "why" in Fraunces + facts (objective / timeframe / where / success) from `reasoning` + `executiveOverview` in the read-model.
2. **The package** (`Panel`) — asset tiles reusing the **Studio asset-library visual** (thumbnail, title, channel chip, status pill, provenance/format/risk badges). Inline **Approve / Decline** per tile (`decideAssetAction`); risk in red. Click a tile → detail (drawer or `?asset=`) or "open in Mark". Progress: "4 of 6 approved".
3. **What's live** (`Panel`) — deployed / approved-locked / awaiting-you counts (Archivo metrics) + the launch gate + "outbound locked until you launch".

Right rail:
- **Audience** (`Panel`) — persona(s) + confidence, linked CRM records (companies/contacts/leads), evidence-source count, expand to the full list. (Condenses today's `audience-leads-tab`.)
- **Work** (`Panel`) — the campaign's **board lane**: its `agent_tasks` rendered as compact board cards grouped by state (reuse the board `Card` look + `EntityAvatar`). "+ New task" reuses the board's create+schedule dialog **pre-linked to this campaign** (choose Mark or a human owner; optional `scheduled_for`). "Open in board" → `/board?campaign=<id>`.
- **Threads** (`Panel`) — Mark conversations under this campaign; "+ New thread" → `/mark` scoped (sets `mark_conversations.campaign_id`); each row opens that thread.
- **History** — collapsible timeline merging approval decisions + audit events (folds today's Decision log + Audit tabs).

**The 7 tabs collapse:** Creative + Media → *The package*; Audience & sources → *Audience*; Talk to Mark → *Threads* (real chat links, not a transcript); Measurement → *What's live* / a collapsed performance block when data exists; Decision log + Audit → *History*.

### 1C. Creation flow — "who drives"

Single entry **"New campaign"** → a small chooser (modal or redesigned `/campaigns/new`):
- **Ask Mark to build it** → goal prompt → same path as the list-page Ask-Mark bar (shell + build task + Mark thread).
- **I'll set it up** → existing manual form (`createOperatorCampaign`).
- **Start a brief, then hand to Mark** → minimal fields → shell + opens a Mark thread to continue.

From any campaign: **"Hand to Mark"** (queues a build/continue task owned by Mark) / **"Take it back"** toggle, reflected by the header driver avatars.

### Phase 1 data/actions

No migration. Reuse: `getCampaignWorkspaceList` / `getCampaignWorkspaceDetail`, `decideAssetAction` / `requestRevisionAction` / `launchCampaignAction`, `createCampaignShell` / `createOperatorCampaign`, `setConversationCampaign` (`persistence.ts:405`), the board `createTaskAction` (extended to accept `campaignId`), and `agent_tasks.campaign_id` for the Work lane query. New thin server actions: `askMarkToBuildCampaignAction`, `handToMarkAction` (both compose existing helpers). All approval-gated (`requireOperator()` + `isSupabaseAdminConfigured()`), outbound stays locked.

---

## Phase 2 — Board toggle + shared ownership

- **Board view** on the campaign page: the campaign's tasks + deliverables as a focused kanban across the 5 board columns, **identical card design to `/board`**, drag-to-move where allowed, inline approve in the "Needs you" column. Reuse `task-kanban-board.tsx` components, scoped by `campaign_id`.
- **`/board?campaign=<id>`** filter so the cross-campaign board can focus one campaign.
- **Human-owned tasks**: the board today always renders Mark's avatar (`agent_id`). For true synchronous human↔Mark, allow a task `owner` of Mark *or* a human so `EntityAvatar` reflects reality. *Schema note:* add an `owner_kind` / `owner_user` (or reuse metadata) on `agent_tasks` — a new timestamped migration; surfaced through the read-model. Keep additive.

---

## Phase 3 — Live Mark dock (Direction C)

A docked **live Mark conversation** on the campaign page (right side), scoped to the campaign, for quick back-and-forth without leaving; big asks "pop out" to `/mark`. Built on the existing `/mark` chat components. Deferred because it's the highest-risk layout and earns its place after Overview + Board prove out.

---

## Constraints

- **Approval-safe:** no outbound send/publish/launch without explicit human approval; approvals are real backend state transitions; declined/blocked stay locked. Never add automatic outbound.
- **Additive & reversible:** Phase 1 = no migration; Phase 2 migration is additive. Don't edit shipped migrations.
- **Reuse before building:** `page-header.tsx` primitives, `theme.ts`, `TabNav`, `StatusPill`, `EntityAvatar`/`MarkAvatar`, board `Card`, Studio asset-library tiles, campaigns read-model + actions.
- **Legible to Mark too:** the campaign page is the canonical campaign state — clear sections, stable labels, structured status.
- `tsc` clean; eslint clean on changed files (repo-wide lint scans vendor noise — scope to changed files).

## Out of scope

A/B/C variant diffing UI; drag-reorder of assets; Higgsfield (flag-off until subscription); the Mark worker contract for emitting multi-asset packages (separate deliverable); deep performance/attribution redesign (reuse existing economics panel, collapsed until data).

## Verification

- `pnpm exec tsc --noEmit` clean; eslint clean on changed files; campaigns + board + mark-chat tests green.
- Headless-Chrome screenshots: list page (cards + ask-Mark bar + needs-you + filters); campaign Overview (at-a-glance, package with inline approve, what's-live, audience, work lane, threads, history); "Open in Mark" opens a campaign-scoped thread with the Studio loaded; creation chooser; Phase 2 board toggle mirrors `/board`.
- Approve/decline/launch remain real, gated state transitions; outbound stays locked throughout.
- DESIGN.md compliance: Obsidian & Gold tokens, gold (not red) for "needs you", no emojis, SVG icons, serif titles.

## Components touched / created

- **List:** rewrite `campaigns/page.tsx` + `campaign-library.tsx`; new `ask-mark-bar.tsx`, `campaign-card.tsx`, `new-campaign-chooser.tsx`; retire/fold `campaign-triage-strip.tsx` / `momentum-strip.tsx` into the card.
- **Detail:** rewrite `campaign-workspace.tsx` into an Overview composition; new `campaign-overview.tsx`, `package-panel.tsx` (Studio-tile reuse), `audience-panel.tsx`, `work-lane.tsx` (board-card reuse), `threads-panel.tsx`, `history-timeline.tsx`; fold the 7 tab components.
- **Actions:** `askMarkToBuildCampaignAction`, `handToMarkAction`; extend `createTaskAction` to accept `campaignId`; reuse decide/launch/revision actions.
- **Board (Phase 2):** campaign-scoped reuse of `task-kanban-board.tsx`; `/board?campaign=` filter; owner-kind migration + read-model.
```

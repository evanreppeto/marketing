# Arc Campaign Studio — Design Spec

**Date:** 2026-06-11
**Status:** Approved direction (carousel + asset-library Studio, built together). Phase 1.

## Problem

Today a Arc reply renders one draft thinly: an inline copy-card plus a loose image, and a right-side "Work canvas" that only shows the single latest draft. Per the new `CLAUDE.md` charter, Arc is BSR's lead-marketing operator that produces **campaign packages** (many assets) and must surface **evidence, approval state, media, and provenance** obviously. The chat needs to render whole campaigns, and the side panel needs to become a persistent home for everything Arc generates.

## Vision

Reframe Arc from "a chat that drafts one thing" into a **campaign studio**. The chat is the conversation + the moment Arc produces something; the right panel ("**Studio**") is the persistent workspace holding every asset/media item in flight for the thread's campaign. Everything stays **outbound-locked** until a human approves.

## Projects vs. Campaigns (clarified)

They are distinct and orthogonal in the data (`MarkConversation` has independent `projectId` and `campaignId`):

- **Project** (`MarkProject`) — an **initiative folder** that groups chat threads (and, conceptually, can span multiple campaigns). Organization only; no assets, no approval, no outbound. Lives in Arc chat.
- **Campaign** (`src/lib/campaigns/`) — the **deliverable**: a package of assets + audience + approval pipeline + provenance + status. Lives at `/campaigns`; linked to a chat via `campaignId`.

**Anchor:** the project is *where the conversation lives*; the campaign is *what it's producing*. The Studio works on the **campaign**, not the project.

**Phase-1 treatment (no schema change):** express the hierarchy via UI + naming. Projects render as folders (folder icon, chat count); campaign linkage renders as a distinct icon + status pill that opens the Studio. Demo data is renamed so roles read clearly: project **"Q3 Storm Season"** ⊃ chat **"Storm-response campaign for landlords"** → campaign **"Storm Response 2026."**
**Future (documented, not built):** add `campaign_assets`/`campaigns.project_id` (or a join) so a project formally owns multiple campaigns.

## Domain model changes (additive, durable — not faked)

`src/domain/arc-chat.ts`. All new fields optional; existing data and parsers keep working.

**`MarkMedia`** gains provenance + format per `CLAUDE.md` "Asset Review and Provenance":
- `source?: "bsr_real" | "ai_generated" | "composite" | "stock" | "external"`
- `sourceId?: string` (approved-media source id), `jobId?: string`, `model?: string` (generation provenance)
- `format?: string` (`"1:1" | "4:5" | "9:16" | "16:9" | "pdf" | "mp4"` etc.)
- `status?: "draft" | "revision" | "approved" | "rejected"`
- `riskFlags?: string[]` (e.g. "embedded text", "claim risk", "privacy/redaction")

**`MarkActionCard`** gains (so each deck/library tile is self-describing):
- `media?: MarkMedia` (the asset's own visual)
- `channel?: string` (e.g. "Meta / Instagram", "Email", "SMS")
- `format?: string`
- `status?: "draft" | "revision" | "approved" | "rejected"`

`parseMedia` / `parseActions` updated to read the new optional fields defensively.

## Chat: the Campaign Deck (carousel)

New `src/app/arc/_components/campaign-deck.tsx`.

- **Trigger:** a Arc message with **≥2 draft action cards** renders a `CampaignDeck` instead of stacked `ActionCard`s. A single draft keeps today's `ActionCard` (with folded image).
- **Layout:** header line (*"Storm Response · 6 assets · 3 need approval"*), a horizontal **scroll-snap** carousel of compact asset cards, dot indicators + ‹ › arrow buttons. CSS scroll-snap (`overflow-x-auto`, `snap-x`); arrows scroll by card width.
- **Asset card (compact):** thumbnail, title, channel chip, status pill, source/provenance badge, **Approve** + "open in Studio" (calls `onOpenCanvas` and focuses that asset). Reuses `decideCampaignDraftAction` for approve.
- Each card draws from its own `MarkActionCard` (+ `card.media`).

## Studio (the right panel, formerly "Work canvas")

`src/app/arc/_components/work-canvas.tsx` → reframed as **Studio**, tabbed. Keep the docked/drawer + toggle behavior already shipped.

- **Tab: Now** — current behavior. Building timeline while pending; otherwise the latest deliverable (image hero + copy + approve, with the read-only fallback for preview). Default tab while Arc is actively working.
- **Tab: Assets** — the **library**: a grid of *every* asset + media item generated in the thread (all draft action cards across messages + their media + standalone media), deduped. Filter chips: **All · Images · Ads · Email · SMS** (and/or status). Each tile: thumbnail · title · channel · status pill · source badge. Click a tile → asset **detail** = the existing `ChannelArtifact` (editable) / `Artifact` (read-only fallback) for that asset, with a back affordance to the grid. Default tab when not actively building.
- Provenance/format/status/risk render on tiles and in detail per the charter. Everything outbound-locked.

Aggregation is pure (derived from the in-memory `messages`), no extra fetches. When a campaign is linked and Supabase is configured, a later phase can merge `getCampaignWorkspace` assets.

## Demo data

`src/app/arc/_data/demo.ts`: turn the Storm Response thread's Arc reply into a real **6-asset package** — 2 social-ad variants (images; Meta; 1:1 / 4:5), 1 email, 1 SMS, 1 landing one-pager (pdf), 1 hero image — with mixed provenance (real BSR media + AI-generated) and per-asset status. Rename project/campaign as above. This drives both the deck and the library in preview. Wire preview-mode send already done.

## Backend / schema (documented; deferred in Phase 1)

- `campaign_assets` already has `channel`, `asset_type`, `title`, `status`, `dispatch_locked`, `prompt_inputs` (jsonb), `audit_payload` (jsonb). Provenance (source type, source media id, gen job/model, format, risk flags) can ride in `audit_payload`/`prompt_inputs` **without a migration**; the read-model (`getDraftAsset`, `CampaignWorkspaceAsset`) surfaces it.
- Real multi-asset replies require Arc's worker to post messages whose `metadata.actions` is an array of asset cards with the new fields — a **Arc contract** deliverable (mirror the steps contract in the Phase-2 plan). Documented, not built here.
- Optional future: `campaigns.project_id` for the project⊃campaign hierarchy.

## Constraints

- **Outbound stays locked**; approve/decline/request-revision only. No automatic outbound.
- **No emojis** in UI (SVG icons only); follow `DESIGN.md` tokens. `/arc` may use richer "alive" visuals (memory: arc-chat visual exception) but stays on-palette.
- Reuse existing primitives (`ArtifactImage`, `ChannelArtifact`, `ActionCard`, theme `cx`).
- Additive domain changes only; `tsc` clean; eslint clean on changed files (repo-wide lint scans vendor noise — scope to changed files).

## Components touched / created

- **Create:** `campaign-deck.tsx`, (Studio tabs may extract `asset-library.tsx`, `asset-tile.tsx`).
- **Modify:** `domain/arc-chat.ts` (types + parsers), `work-canvas.tsx` (→ Studio tabs + library), `message-list.tsx` (deck trigger), `action-card.tsx` (provenance/status chips), `_data/demo.ts`.

## Out of scope (Phase 2+)

Audience tab; live merge of linked-campaign assets from Supabase; variant A/B/C diffing UI; metrics/performance cards; drag-reorder; Higgsfield (stays flag-off until subscription confirmed); the Arc worker contract for emitting multi-asset packages; `campaigns.project_id` migration.

## Verification

- `pnpm exec tsc --noEmit` clean; eslint clean on changed files.
- Headless Chrome screenshots at ≥1280px and ~1260px: deck renders as a carousel in chat; Studio "Assets" tab shows the library grid; tile → detail → approve; provenance/status visible; projects vs campaign visually distinct.
- Preview-mode send still works.

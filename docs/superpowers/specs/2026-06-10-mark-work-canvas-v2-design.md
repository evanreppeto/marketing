# Live Work Canvas v2 — Inline Editing + Channel-True Previews

Date: 2026-06-10
Branch: `feat/mark-kanban-board`
Status: Approved design → ready for implementation plan

## Problem

The Mark Work Canvas (`src/app/mark/_components/work-canvas.tsx`) renders an agent
deliverable **read-only**, derived from each message's `MarkActionCard` metadata
(`title`, a `preview` snippet, `rows`, `flags`, `approval{campaignId, assetId}`).
The operator can view and approve in place, but cannot edit the copy, and the
deliverable is shown as a generic "page" regardless of the channel it ships on.

v2 makes the canvas **live and editable**: the operator types directly into the
asset's fields, sees it rendered in a channel-true frame (Gmail / Meta / SMS), and
saves edits that persist to the backing `campaign_assets` row. Outbound stays locked
throughout — this is review/refine, not dispatch.

## Decisions (locked with the user)

- **Edit persistence:** real backend write to `campaign_assets`. Body → `edited_body`;
  structured fields (subject/headline/CTA) → a new `edited_fields jsonb` column. The
  original draft (`draft_body` + `prompt_inputs`) stays pristine. Approve consumes the
  edited version (`approved_body = edited_body ?? draft_body`).
- **Frames shipped in v1:** Email (Gmail reading pane), Ad (Meta feed placement),
  SMS (phone bubble), and the existing Generic page as fallback.
- **Edit granularity:** field-level. Email = subject + body; Ad = primary text +
  headline + CTA label; SMS = body; Generic = title + body.
- **Save affordance:** one explicit **Save** button per artifact (not save-on-blur).
- **Editable primitive:** hand-rolled controlled `textarea`/input with a focus-driven
  preview↔edit swap and auto-resize. No new dependency (the Magic mock pass surfaced
  `ark-ui`'s `Editable`; we replicate its model, matching this codebase's hand-rolled
  input style instead of adding a package).

## Architecture (domain → lib → app)

### Migration
`supabase/migrations/<timestamp>_campaign_asset_edited_fields.sql`:
```sql
alter table public.campaign_assets
  add column edited_fields jsonb not null default '{}'::jsonb;
```
New timestamped file; never edit shipped migrations.

### Domain — `src/domain/mark-canvas.ts` (pure, unit-tested)
- `channelPreviewKind(channel: string | null, assetType: string | null): ChannelPreviewKind`
  where `ChannelPreviewKind = "email" | "ad" | "sms" | "generic"`. Classifier with
  synonym matching: email/newsletter/mail → `email`; ad/meta/facebook/instagram/paid/
  social → `ad`; sms/text/mms → `sms`; everything else → `generic`. Case-insensitive,
  deterministic.
- `editableFieldSpec(kind): EditableFieldSpec[]` — ordered field descriptors per kind:
  - email → `subject` (single-line), `body` (multiline)
  - ad → `primaryText` (multiline), `headline` (single-line), `cta` (single-line)
  - sms → `body` (multiline)
  - generic → `title` (single-line), `body` (multiline)
  Each descriptor: `{ key, label, multiline, maxLength?, placeholder }`.
- `resolveDraftFields(raw): ResolvedDraftFields` — merges the persisted record into the
  editable field values. Precedence: structured fields from `edited_fields` fall back to
  `prompt_inputs` (reads `subject`, `headline`/`title`, `cta`/`call_to_action`/
  `primary_cta`, `primaryText`/`primary_text`/`body`); body from `edited_body ??
  draft_body`. Pure — takes already-parsed values, returns
  `{ subject?, primaryText?, headline?, body, cta?, title? }`.
- `isDraftEdited(raw): boolean` — true when `edited_body` is non-null OR `edited_fields`
  is non-empty. Drives the "Edited" pill.

### Lib — `src/lib/campaigns/draft-editing.ts`
- `type DraftAssetView = { assetId; campaignId; channel; kind: ChannelPreviewKind;
  fields: ResolvedDraftFields; edited: boolean; status; dispatchLocked }`.
- `getDraftAsset(assetId, client?): Promise<DraftAssetView | null>` — selects the asset
  row, runs `channelPreviewKind` + `resolveDraftFields` + `isDraftEdited`, returns the view.
- `editDraftAsset(input: { assetId; campaignId; title?; body?; fields: Record<string,string> },
  operator, client?): Promise<void>` — updates `campaign_assets` with `edited_body`
  (from `body`), `edited_fields` (from `fields`), and `title` when provided; inserts a
  `campaign_events` row `event_type: "asset_edited"` with an actor + a diff-summary
  detail. **Never** touches `dispatch_locked` / `launch_locked`.

### Actions — `src/app/mark/actions.ts`
- `getDraftAssetAction(assetId: string): Promise<DraftAssetView | null>` —
  `requireOperator()`; returns `null` when Supabase unconfigured or asset missing.
- `editDraftAssetAction(input): Promise<{ ok: boolean; message: string }>` —
  `requireOperator()` + `isSupabaseAdminConfigured()` guard; calls `editDraftAsset`;
  `revalidatePath("/mark")`, `revalidatePath("/campaigns")`,
  `revalidatePath(\`/campaigns/${campaignId}\`)`. Returns a small result for inline
  feedback. Outbound stays locked.

### UI — `src/app/mark/_components/`
- **`work-canvas.tsx` (refactor):** when the surfaced draft card has `approval.assetId`,
  render `<ChannelArtifact assetId … campaignId … />` instead of the generic `Artifact`.
  Cards with no backing asset keep today's read-only generic surface unchanged. The
  `building` and `context` states are untouched.
- **`channel-artifact.tsx` (new, client):** owns the live fetch. On mount / when assetId
  changes, calls `getDraftAssetAction`; holds field state; tracks dirty; renders the
  matching frame; renders Save (calls `editDraftAssetAction`, re-fetches on success) and
  the existing Approve/Decline forms; shows the "Edited" pill from `edited`/dirty.
  Loading + error states reuse existing skeleton tokens.
- **`channel-preview.tsx` (new):** presentational frames switched on `kind` —
  `EmailFrame`, `MetaAdFrame`, `SmsFrame`, `GenericFrame`. Each receives the field values +
  an `EditableField` render path. Authored to the design system (see below).
- **`editable-field.tsx` (new):** the inline-edit primitive. Renders styled text; on
  focus/click becomes an auto-growing `textarea` (multiline) or input (single-line) with a
  gold focus ring; reports changes up via `onChange`. No internal persistence — the parent
  owns state and Save.

## Data flow

```
draft card (approval.assetId)
  → ChannelArtifact mounts → getDraftAssetAction(assetId) → DraftAssetView
  → render ChannelPreview[kind] with EditableFields bound to local field state
  → operator edits fields (local, dirty=true)
  → Save → editDraftAssetAction({assetId, campaignId, body, fields, title})
        → editDraftAsset: write edited_body + edited_fields (+ title), log asset_edited event
        → revalidate /mark + /campaigns
  → ChannelArtifact re-fetches → frame shows persisted edit + "Edited" pill, dirty=false
  → Approve → existing decideCampaignDraftAction (approves edited version); outbound stays locked
```

## Design system

Obsidian & Gold (`src/app/globals.css`). Surfaces: `--canvas` / `--surface-soft` /
`--surface-panel`. Borders: `--border-hairline` / `--border-strong`. Headlines:
`--font-serif` (Fraunces). Gold (`--accent` `#c8a24a`) used **only** as the active/focus
accent, the Save button fill, and the "Edited" pill — never as fills or stripes elsewhere.
The frames evoke their platforms with restraint (a Gmail-ish sender row, a Meta-ish footer
bar, a phone silhouette) without literally cloning brand chrome or using brand colors/logos.
No gradients, no neon, no emoji, no >1px side-stripes. Respect `motion-safe`; reuse the one
calm presence animation already in the canvas.

## Testing & verification

- Domain unit tests in `src/domain/__tests__/mark-canvas.test.ts`:
  - `channelPreviewKind` across all synonyms + null/unknown → generic.
  - `resolveDraftFields` precedence (edited over prompt_inputs over draft; missing fields).
  - `editableFieldSpec` shape per kind.
  - `isDraftEdited` true/false cases.
- `pnpm lint && pnpm build && pnpm test` green.
- `pnpm dev` manual preview of all four frames + a Save round-trip.

## Scope guard (YAGNI / out of scope)

In: four frames, field-level inline edit, explicit Save → persist to `edited_body` +
`edited_fields`, "Edited" pill, Approve consumes edited version.

Out: rich-text formatting, swapping the image inside the ad frame (that's feature #3, the
per-project asset library), live collaborative editing, re-prompting Mark from an edit, and
any dispatch/launch (stays locked).

## Constraints honored

- Commit only the specific files this work touches; never `git add -A`.
- Do not touch `campaign-library.tsx` or `campaigns/page.tsx` (other session's WIP).
- Linear history on `feat/mark-kanban-board`.

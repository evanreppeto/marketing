# Vault — Live & Dynamic Upgrade

**Date:** 2026-06-02
**Status:** Approved design, ready for implementation planning
**Builds on:** `2026-06-01-vault-notebook-design.md` (+ Revision 1, the editable/Supabase Vault).

## Summary

Upgrade the existing Vault tab from a static-feeling editable surface into a **living,
color-differentiated operations view** that syncs with the Arc agent and live
Supabase data. Four capabilities, all within the DESIGN.md palette (one blue accent +
restoration red + green/amber/gray status — no new hues, no emojis):

1. **Arc activity feed** — a live rail showing Arc's status/heartbeat, what he's
   drafting, the real review-queue count, and recent agent outputs.
2. **Live record signals on notes** — a chip beside each outgoing record/persona link
   showing a live or reference stat for that record.
3. **Live collection counts + freshness** — per-collection counts and "updated Xm ago"
   sourced from real state, not static numbers.
4. **Auto-refresh feel** — a small client component that refreshes the page periodically
   so the surface stays current without a manual reload.

Architecture follows the codebase's server-component + read-model pattern (Approach A):
one new isolated live-signals module, new presentational components, and one small client
component. The existing pure domain logic and the `agent-operations` dashboard are
untouched.

## Goals

- Make the Vault feel connected to Arc and to live data, not templated.
- Differentiate collections and statuses with color, staying strictly on-palette.
- Degrade gracefully when Supabase is unconfigured (parallels the rest of the app).

## Non-goals

- No new brand hues, gradients, emojis, or side-stripe accent borders (DESIGN.md).
- No websockets / true realtime; "live" = server-fetched data + periodic client refresh.
- No changes to the `agent-operations` read-model or the pure `src/domain/notebook.ts`.
- CRM-record live persistence is out of scope; record-link signals stay reference-derived
  (persona-link signals ARE live — see below).

## Architecture

### Live-signals read-model — `src/lib/vault/live-signals.ts`

Two async functions, each returning a discriminated union with graceful degradation,
mirroring `src/lib/vault/read-model.ts` and `src/lib/agent-operations/read-model.ts`.
Takes an untyped `SupabaseClient` internally via `getSupabaseAdminClient()`; guarded by
`isSupabaseAdminConfigured()`.

```ts
export type MarkActivity = {
  name: string;            // "Arc"
  status: string;          // titleized agent status, e.g. "Ready"
  killSwitch: string;      // e.g. "Outbound locked"
  lastHeartbeat: string | null;
  drafting: Array<{ title: string; taskType: string; updated: string }>; // open agent_tasks
  awaitingReview: number;  // vault_notes where status = 'needs_review'
  recentOutputs: Array<{ title: string; status: string; time: string }>; // agent_outputs
};

export type VaultLiveSignals =
  | { status: "live"; activity: MarkActivity; generatedAt: string }
  | { status: "fallback"; activity: MarkActivity; message: string }
  | { status: "error"; activity: MarkActivity; message: string };

export async function getVaultLiveSignals(): Promise<VaultLiveSignals>;
```

- Sources: `agents` (Arc row → status/heartbeat/killSwitch from metadata, same fields the
  agent-ops `mapMarkRunner` reads), `agent_tasks` (Arc's open tasks → `drafting`),
  `agent_outputs` (recent → `recentOutputs`), `vault_notes` (count `needs_review`).
- `fallback` (unconfigured) returns an empty `MarkActivity` (name "Arc", status "Offline",
  `drafting: []`, `awaitingReview` from seed notes, `recentOutputs: []`) + a message.
- Pure shaping helpers are extracted and unit-tested: `toMarkActivity(agentRow, tasks,
  outputs, reviewCount)`, `shortTime(iso)`.

```ts
export type RecordSignal = {
  target: string;
  label: string;   // e.g. "Insurance Agent" / "Apex Plumbing Co."
  stat: string;    // e.g. "12 leads · 3 new" (persona, live) or "Active · Robby" (record, ref)
  tone: "green" | "amber" | "blue" | "gray";
  live: boolean;   // true for persona lead counts; false for reference-derived record stats
};

export async function getRecordSignals(
  links: Array<{ kind: string; target: string; label: string }>,
): Promise<Map<string, RecordSignal>>;
```

- **persona** links → live: `select count` on `leads` where `persona = target`, plus a
  recent-window count for "+N new"; `live: true`. Unconfigured → reference count from the
  existing `audienceSegments`/persona reference data, `live: false`.
- **record** links → reference snapshot from `crmObjects` sample rows in
  `src/app/_data/growth-engine.ts` (status/owner), `live: false`.
- Pure helper `personaSignalLabel(total, recent)` is unit-tested. Only record/persona links
  are looked up; note/unresolved links are skipped.

### Visual system — `collectionThemes` in `src/app/notebook/_data/notebook.ts`

```ts
export const collectionThemes: Record<string, { tone: StatusTone; icon: CollectionIcon }> = {
  Playbooks: { tone: "blue", icon: "play" },
  "Partner Intel": { tone: "green", icon: "handshake" },
  "Persona Docs": { tone: "amber", icon: "user" },
  SOPs: { tone: "red", icon: "shield" },
  "Field Notes": { tone: "gray", icon: "note" },
};
```

- `StatusTone` reuses the `StatusPill` tones. Icons are small inline SVG glyphs in a new
  `src/app/notebook/_components/collection-icon.tsx` (no emoji). A guard test asserts every
  entry in `vaultCollections` has a theme.
- Color is applied as: a tone dot + glyph in the collection eyebrow, a tone-colored count
  chip, and link-kind colored dots — never as a filled card or a side-stripe border.

### Components

- `src/app/notebook/_components/arc-activity-rail.tsx` — renders `MarkActivity`: a status
  line (breathing dot when "live"), "drafting now" list, an "N awaiting review" row linking
  to the first needs-review note's detail page (or staying on `/notebook` when the queue is
  empty), recent outputs, heartbeat. Server component; pure props — it receives the resolved
  review-link href so it stays presentational.
- `src/app/notebook/_components/collection-icon.tsx` — `{ icon, tone }` → inline SVG.
- `src/app/notebook/_components/record-signal-chip.tsx` — `RecordSignal` → a tone-colored
  chip with the stat and a small "live"/"ref" marker.
- `src/app/notebook/_components/auto-refresh.tsx` — `"use client"`. `useEffect` interval
  (default 30000ms) calling `useRouter().refresh()`; pauses while `document.hidden`
  (visibilitychange); clears on unmount. Renders a small "● updated just now / Xm ago"
  indicator. Respects `prefers-reduced-motion` for the dot animation only.

### Page changes

- **`src/app/notebook/page.tsx`** (redesign): asymmetric hero (PageHeader + compact live
  Arc aside); tone-coded stat strip; left column = color-coded collection sections (theme
  dot/glyph + live count + "updated Xm ago" freshness derived from the newest note in the
  collection); right rail = `MarkActivityRail` above the graph; `<AutoRefresh />` mounted;
  fallback/error banners for both the notes read-model and live-signals. Calls
  `getVaultNotes()` and `getVaultLiveSignals()`.
- **`src/app/notebook/[noteSlug]/page.tsx`**: build `getRecordSignals()` for the note's
  outgoing links and render a `RecordSignalChip` beside each record/persona link in the
  "Links in this note" panel; mount `<AutoRefresh />`. Everything else unchanged.

## Data flow

Server components fetch `getVaultNotes()` + `getVaultLiveSignals()` (home) or
`getVaultNote()` + `getRecordSignals()` (detail) per request. The client `AutoRefresh`
triggers `router.refresh()` on its interval, re-running those server fetches so the rail,
counts, freshness, and review queue update. Writes still `revalidatePath("/notebook")`.

## Error handling / degradation

- Every live fetch is wrapped; failures return `error`/`fallback` with seeded or empty data
  and a banner. The page never crashes on a Supabase outage.
- `getRecordSignals` failures yield an empty Map → links render without chips (no error).
- Unconfigured Supabase: Arc rail shows "Offline", persona signals show reference counts,
  review count comes from seed notes.

## Testing

`src/lib/vault/live-signals.test.ts`:
- `toMarkActivity` shaping from fixture agent/task/output rows + review count.
- `personaSignalLabel(total, recent)` formatting ("12 leads · 3 new", singular, zero).
- `shortTime` relative formatting from a fixed ISO input (no `Date.now()` — pass a `now`
  argument so it stays deterministic).
- `getVaultLiveSignals()` returns `fallback` with an empty/seed `MarkActivity` when env
  vars are unset (env save/restore pattern from `read-model.test.ts`).

`src/app/notebook/_data/notebook.test.ts` (or extend existing): every `vaultCollections`
folder has a `collectionThemes` entry.

`AutoRefresh` and the presentational components are verified by `pnpm build` + manual smoke;
the live Supabase paths (agent rows, persona lead counts) are verified manually against a
configured project and explicitly reported as run-or-not (not asserted blind).

## Out of scope / future

- Real CRM-record persistence so record-link signals go live (persona signals already are).
- Server-sent events / websockets for true realtime.
- A dedicated review-filter view (a `?filter=review` listing); the rail links straight to
  the first pending note instead.

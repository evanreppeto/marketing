# shadcn Data Table — App-Wide Migration

**Date:** 2026-06-23
**Status:** Approved (design)
**Owner:** Evan

## Goal

Replace the app's hand-rolled and bespoke tables with the canonical shadcn
**Data Table** pattern — the shadcn `Table` primitive plus a reusable
`@tanstack/react-table`-backed `DataTable` component — themed to the existing
Command Charcoal palette so there is **no visual regression**.

The motivation is consolidation and capability: one engine for sorting,
filtering, search, column visibility, pagination, and row selection, instead of
three separately-maintained table implementations.

## Constraints

- **No visual regression.** This is an engine/markup swap, not a reskin. Palette,
  spacing, bespoke cell content (score rings, persona tags, status pills, accent
  rail), and per-table behavior must look and feel the same after migration.
- **Design system.** Follow `DESIGN.md` (Command Charcoal / Canvas White /
  Restoration Red; hairlines not card-soup; no AI-slop aesthetic). Re-skin shadcn
  defaults with Signal CSS tokens (`--surface-inset`, `--border-hairline`,
  `--text-muted`, `--accent`, `--accent-soft`, `--surface-raised`), matching the
  existing `src/components/ui/*` convention (see `badge.tsx`).
- **Generic, not BSR-specific.** The shared `DataTable` is a product primitive;
  no hardcoded personas/segments in the component itself.
- **shadcn is already configured.** `components.json` (new-york, RSC, lucide) and
  `src/components/ui/` exist; `globals.css` already bridges shadcn tokens
  (`--background`, `--foreground`, …) to Signal tokens. Missing pieces are only
  the `table.tsx` primitive and the `@tanstack/react-table` dependency.

## Architecture

Two layers, matching the canonical shadcn split:

### Layer 1 — `src/components/ui/table.tsx` (primitive)

The shadcn `Table` primitive: `Table`, `TableHeader`, `TableBody`,
`TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`. Pure markup.
Re-skinned to Signal tokens:

- header row: `bg-[var(--surface-inset)]`, `text-[var(--text-muted)]`, the small
  uppercase/tracking treatment used today
- row borders: `border-[var(--border-hairline)]`
- row hover: `hover:bg-[var(--surface-raised)]`
- selected row: `bg-[var(--accent-soft)]` (+ `aria-current="page"`)

### Layer 2 — shared `DataTable` (engine)

Built on `@tanstack/react-table` (headless). Owns:

- **Sorting** (per-column, opt-in via `enableSorting`)
- **Filtering** — global search box + per-column filters
- **Column visibility** (show/hide)
- **Pagination** — reuse the existing `PaginationControls` visual treatment
  (`src/app/_components/pagination-controls.tsx`) driven by the TanStack
  pagination state
- **Row selection** — controlled `selectedId` for the CRM master/detail pattern
- **Row navigation** — `rowHref` (renders `<Link>`-wrapped cells, as today) and/or
  `onRowClick` / `onRowDoubleClick`
- **Pinned first column accent rail** (CRM behavior)
- **Empty state** slot
- **Horizontal-scroll wrapper** with configurable `minWidth`

**API shape (canonical shadcn):**

```ts
function DataTable<TData, TValue>(props: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  getRowId: (row: TData) => string;
  // options
  enableSorting?: boolean;
  searchColumn?: string;        // wires the search box to a column
  searchPlaceholder?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
  // navigation / selection
  rowHref?: (row: TData) => string | null | undefined;
  onRowClick?: (row: TData) => void;
  onRowDoubleClick?: (row: TData) => void;
  selectedId?: string;
  pinnedAccentRail?: boolean;
  // chrome
  emptyState?: ReactNode;
  minWidth?: string;
  toolbar?: ReactNode;          // page-specific filter controls (e.g. MUI selects)
}): JSX.Element;
```

Bespoke cell content stays in `ColumnDef.cell` renderers. TanStack is headless,
so score rings, persona tags, status pills, missing badges, and mono/tabular
treatments all carry over unchanged.

**Placement decision:** the shared `DataTable` lives at
`src/components/ui/data-table.tsx` (shadcn convention). The old
`src/app/_components/data-table.tsx` is deleted and its imports repointed.

## Migration Map

### Replace + repoint (consumers of the old shared `DataTable<T>`)

These already use a column API; translate `Column<T>` → `ColumnDef<TData>`:

1. `src/app/brain/_components/brain-browser.tsx`
2. `src/app/analytics/page.tsx`
3. `src/app/analytics/_components/overview/analytics-explorer.tsx`
4. `src/app/analytics/_components/overview/campaign-performance-table.tsx`
5. `src/app/agent-operations/agent-task-board.tsx`
6. `src/app/agent-operations/[agentKey]/page.tsx`

### Rebuild on the new component, preserving UX

7. `src/app/crm/_components/crm-object-table.tsx` — the rich one. Preserve:
   single-click select (debounced) / double-click open, keyboard row handling,
   MUI filter selects (passed via `toolbar`), score rings, missing badges,
   persona tags, the per-view tab strip, and the pinned first-column accent rail.
   The page-level search + page-size + view tabs stay; only the table engine and
   markup move to `DataTable` + the `ui/table` primitive.
8. `src/app/approvals/approval-history-table.tsx` — preserve search, the decision
   filter tabs (`all/approved/revision/declined/archived`), and pagination.

### Convert raw table

9. `src/app/analytics/_components/campaign-detail-explorer.tsx` — raw `<table>` →
   `DataTable`.

### Leave alone (intentionally not data tables)

- `src/app/crm/_components/crm-pipeline-board.tsx` — kanban board.
- `src/app/arc/_components/message-list.tsx` — markdown-rendered table in chat.

## Dependencies

- Add `@tanstack/react-table` (runtime dependency, via pnpm).

## Sequencing

1. Add dep; create `ui/table.tsx` primitive (Signal-themed).
2. Build shared `DataTable` on TanStack; verify with a throwaway render.
3. Migrate the 6 simple consumers (mechanical `Column` → `ColumnDef`).
4. Delete old `src/app/_components/data-table.tsx`; fix imports.
5. Migrate Approvals history (medium).
6. Migrate CRM object table (hard — preserve all bespoke UX).
7. Migrate Analytics `campaign-detail-explorer`.
8. Cleanup pass: dead code, consistent toolbar treatment.

## Verification

- `pnpm build` (catches type errors; `pnpm lint` alone does not typecheck).
- `pnpm lint` scoped to changed files (full lint scans vendored files).
- `pnpm test` (no table unit tests today; domain logic untouched, but run to
  confirm nothing regressed).
- Preview each migrated surface and confirm via DOM / computed-style checks
  (`preview_eval`) rather than screenshots — screenshots can hang on the
  particle-canvas pages. Confirm: header treatment, row hover/selected states,
  sorting, search/filter, pagination, and (CRM) select-vs-open behavior.

## Risks

- **Craft loss on the CRM table.** Highest-risk surface. Mitigation: reproduce
  select/open handlers and the pinned accent rail explicitly; do not accept a
  generic shadcn look. Compare against the current table side-by-side before
  considering it done.
- **Token drift.** If a shadcn default class (e.g. `text-muted-foreground`) leaks
  through unthemed, it could render off-palette. Mitigation: re-skin every class
  in `table.tsx` to Signal tokens; verify computed styles.
- **RSC boundaries.** The TanStack `DataTable` is a client component; some current
  consumers are server components passing data down. Keep the data-fetch in the
  server component and render `DataTable` as a client leaf (as the current
  consumers already do).
- **Large blast radius.** Nine files migrate. Mitigation: ship the primitive +
  shared component first, then migrate consumers in dependency order so each step
  builds green.

## Out of Scope

- Server-side pagination/filtering (all current tables are client-side over
  already-loaded rows; keep that).
- New table features beyond parity (e.g. CSV export, saved views) — not now.
- Converting the kanban board or chat markdown table.

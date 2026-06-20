# Personas Relaunch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the orphaned persona page back into the app as a reachable, unified "Personas" roster → drill-in lens, cross-linked with Brain, with performance staged as a fast-follow.

**Architecture:** Rename the existing `src/app/persona-intelligence/` route to `src/app/personas/` (with a permanent redirect from the old path), add it to the Intelligence nav group, restructure the index page from tab-first to roster-first, relabel the drill-in tabs to the unified vision, and add bidirectional Brain↔Personas cross-links. All data comes from the existing `getPersonaIntelligenceData()` read-model and static `PERSONA_CTA_RULES`; no faked data. Performance is a visibly-deferred tab.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript, existing `page-header.tsx` UI primitives, lucide-react icons, Vitest for the one pure helper, preview MCP for UI smoke.

**Important repo conventions (read before starting):**
- `pnpm lint` is eslint-only and scans vendored files — it does **not** typecheck. Use `pnpm build` to catch type/route errors. Scope lint to changed files only.
- Sidebar nav is a **hardcoded array in `src/app/_components/console-frame.tsx`**, not `growth-engine.ts`. This file is a known merge-collision hotspot — rebase on fresh `origin/main` before merging.
- This Next.js has breaking changes vs. training data. Before writing the redirect config, skim `node_modules/next/dist/docs/` for the current `redirects()` contract.
- The page stays **read/inspect-only** — no mutations, no outbound. This is non-negotiable per the project's core principle.
- Keep the `src/lib/persona-intelligence/` directory name and the `/api/v1/arc/persona-intelligence` API route **unchanged** — only the `src/app/` UI route moves. Renaming either would break programmatic contracts.

---

## Task 1: Rename the route directory and wire the redirect

**Files:**
- Move: `src/app/persona-intelligence/page.tsx` → `src/app/personas/page.tsx`
- Move: `src/app/persona-intelligence/[personaKey]/page.tsx` → `src/app/personas/[personaKey]/page.tsx`
- Modify: `next.config.ts`

- [ ] **Step 1: Move the route directory with git**

```bash
cd "$(git rev-parse --show-toplevel)"
git mv src/app/persona-intelligence src/app/personas
```

- [ ] **Step 2: Update internal self-references inside the moved files**

Both moved files contain hardcoded `/persona-intelligence` links that point back at themselves. Update every UI link string from `/persona-intelligence` to `/personas`.

In `src/app/personas/page.tsx`, replace all occurrences:
- `href={`/persona-intelligence?tab=${tab.id}`}` → `href={`/personas?tab=${tab.id}`}`
- `href={`/persona-intelligence?tab=snapshots&inspect=${row.key}`}` → `href={`/personas?tab=snapshots&inspect=${row.key}`}`
- `href={`/persona-intelligence?tab=${tab}&inspect=${signalKey(row, index)}`}` → `href={`/personas?tab=${tab}&inspect=${signalKey(row, index)}`}`
- `href={`/persona-intelligence?tab=personas&inspect=${personaSlug(rule.persona)}`}` → `href={`/personas?tab=personas&inspect=${personaSlug(rule.persona)}`}`
- `href: `/persona-intelligence/${selected.key}`` → `href: `/personas/${selected.key}``
- `href: `/persona-intelligence/${personaSlug(selectedRule.persona)}`` → `href: `/personas/${personaSlug(selectedRule.persona)}``

In `src/app/personas/[personaKey]/page.tsx`, replace all occurrences:
- `href={`/persona-intelligence/${personaKey}`}` → `href={`/personas/${personaKey}`}`
- `href={`/persona-intelligence/${personaKey}?tab=${tab.key}`}` → `href={`/personas/${personaKey}?tab=${tab.key}`}`
- `href="/persona-intelligence"` (the "Back to personas" link) → `href="/personas"`

Verify none remain:

```bash
grep -rn "/persona-intelligence" src/app/personas/
```
Expected: no output.

- [ ] **Step 3: Add the permanent redirect from the old path**

Edit `next.config.ts` to add a `redirects()` function (confirm the signature against `node_modules/next/dist/docs/` first):

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: {
    position: "bottom-right",
  },
  async redirects() {
    return [
      { source: "/persona-intelligence", destination: "/personas", permanent: true },
      { source: "/persona-intelligence/:personaKey", destination: "/personas/:personaKey", permanent: true },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Verify the build compiles and routes resolve**

Run: `pnpm build`
Expected: build succeeds; output route list shows `/personas` and `/personas/[personaKey]` and no longer lists `/persona-intelligence`.

- [ ] **Step 5: Commit**

```bash
git add src/app/personas next.config.ts
git commit -m "refactor: move persona-intelligence route to /personas with redirect"
```

---

## Task 2: Update external internal links to the new path

These are link targets elsewhere in the app that point at the old route. The redirect makes them work either way, but they should point at the canonical path. **Do not touch** the `/api/v1/arc/persona-intelligence` API route or the `src/lib/persona-intelligence/` directory.

**Files (modify, link strings only):**
- `src/lib/arc-chat/mention-search.ts`
- `src/lib/activity/demo.ts`
- `src/app/vault/_data/notebook.ts`
- `src/app/arc/_data/demo.ts`
- `src/domain/__tests__/notebook.test.ts` (only if it asserts the path)

- [ ] **Step 1: Find every remaining UI reference**

```bash
grep -rn "/persona-intelligence" src --include=*.ts --include=*.tsx | grep -v "api/v1/arc/persona-intelligence" | grep -v "src/lib/persona-intelligence/"
```
This lists the link/string occurrences to update.

- [ ] **Step 2: Update each occurrence**

For each line from Step 1, change the string literal `/persona-intelligence` → `/personas` (and `/persona-intelligence/<x>` → `/personas/<x>`). These are route link strings in demo/seed/search data; preserve surrounding code exactly.

- [ ] **Step 3: Verify only API + lib references remain**

```bash
grep -rn "/persona-intelligence" src --include=*.ts --include=*.tsx | grep -v "api/v1/arc/persona-intelligence" | grep -v "src/lib/persona-intelligence/"
```
Expected: no output.

- [ ] **Step 4: Run the affected tests and build**

Run: `pnpm test src/domain/__tests__/notebook.test.ts`
Expected: PASS.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "refactor: point internal links at /personas"
```

---

## Task 3: Add Personas to the sidebar nav

**Files:**
- Modify: `src/app/_components/nav-icons.tsx`
- Modify: `src/app/_components/console-frame.tsx:108-113` (the `intelligenceNavItems` array)

- [ ] **Step 1: Add a `personas` icon to the nav icon registry**

In `src/app/_components/nav-icons.tsx`:

Add `Contact` to the lucide import block (alphabetically near the top imports):

```ts
import {
  Activity,
  Building2,
  Brain,
  ChartSpline,
  Columns3,
  Contact,
  GalleryHorizontalEnd,
  Home,
  Images,
  Megaphone,
  Send,
  Settings2,
  Target,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
```

Add `"personas"` to the `NavIconName` union:

```ts
export type NavIconName =
  | "home"
  | "campaigns"
  | "crm"
  | "outbox"
  | "gallery"
  | "library"
  | "arc"
  | "settings"
  | "board"
  | "analytics"
  | "brand"
  | "brain"
  | "activity"
  | "opportunities"
  | "personas";
```

Add the entry to the `icons` record:

```ts
const icons: Record<Exclude<NavIconName, "arc">, LucideIcon> = {
  activity: Activity,
  analytics: ChartSpline,
  brand: Building2,
  board: Columns3,
  brain: Brain,
  campaigns: Megaphone,
  crm: UsersRound,
  gallery: Images,
  home: Home,
  library: GalleryHorizontalEnd,
  opportunities: Target,
  outbox: Send,
  personas: Contact,
  settings: Settings2,
};
```

- [ ] **Step 2: Add the nav item to the Intelligence group**

In `src/app/_components/console-frame.tsx`, update `intelligenceNavItems`:

```ts
  const intelligenceNavItems: ShellNavItem[] = [
    { label: "Activity", href: "/activity", icon: "activity", matches: ["/activity"] },
    { label: "Analytics", href: "/analytics", icon: "analytics", matches: ["/analytics"] },
    { label: "Brand", href: "/brand", icon: "brand", matches: ["/brand"] },
    { label: "Brain", href: "/brain", icon: "brain", matches: ["/brain"] },
    { label: "Personas", href: "/personas", icon: "personas", matches: ["/personas"] },
  ];
```

- [ ] **Step 3: Verify the build compiles (icon name resolves)**

Run: `pnpm build`
Expected: build succeeds. If `Contact` fails to resolve from lucide-react, substitute `UserSquare` (import it and use it as the `personas` icon value), then rebuild.

- [ ] **Step 4: Verify the link renders and routes in the preview**

Start the preview (preview_start if not running), navigate to `/`, then:
- preview_snapshot — confirm a "Personas" item appears in the sidebar Intelligence group.
- preview_click the Personas nav item — confirm it routes to `/personas` and the persona page renders.

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/nav-icons.tsx src/app/_components/console-frame.tsx
git commit -m "feat: add Personas to the Intelligence nav group"
```

---

## Task 4: Restructure the index page to roster-first

Goal: the page lands directly on the 12-persona roster (no tab selection required), each card folding in live-memory state. Knowledge signals and guardrails move from headline tabs to secondary tabs so the roster is the main event. The right-hand `IntelligencePanel` inspector and all existing data wiring stay.

**Files:**
- Modify: `src/app/personas/page.tsx`

- [ ] **Step 1: Make the roster the default tab and demote signals/guardrails**

In `src/app/personas/page.tsx`, change the tab list so the roster reads as the primary surface and the reference tabs read as secondary. Replace `buildTabs`:

```ts
function buildTabs(agentName: string): Array<{ id: IntelligenceTab; label: string; detail: string }> {
  return [
    { id: "personas", label: "Roster", detail: "All 12 personas — rules and live memory" },
    { id: "snapshots", label: "Live snapshots", detail: "Current Supabase persona memory" },
    { id: "signals", label: "Knowledge", detail: `Reference entries ${agentName} can cite` },
    { id: "guardrails", label: "Guardrails", detail: "Copy and compliance checks" },
  ];
}
```

- [ ] **Step 2: Update the page header to the unified framing**

Replace the `PageHeader` block in `PersonaIntelligencePage` (note: the `eyebrow` prop is ignored by `PageHeader` per current design — title-first):

```tsx
      <PageHeader
        title="Personas"
        description={`Who BSR sells to and how ${agentName} should talk to them. Inspect each persona's rulebook and live memory. Nothing here publishes pages, sends outreach, or launches campaigns.`}
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={data.status === "live" ? "green" : "amber"}>{data.status === "live" ? "Live memory" : "Rules only"}</StatusPill>
            <StatusPill tone="amber">Inspect-only</StatusPill>
          </div>
        }
      />
```

- [ ] **Step 3: Fold live-memory detail into the roster cards**

In `PersonaRuleCard`, surface the live snapshot when present so the roster card unifies rule + memory (instead of forcing a trip to the Snapshots tab). Replace the `PersonaRuleCard` function body's content region (keep the outer `Link` wrapper, classes, and href exactly as they are) so that after the two CTA `RuleField`s it conditionally renders a live-memory strip:

```tsx
function PersonaRuleCard({ rule, live }: { rule: PersonaCtaRule; live: PersonaTrackerRow | null }) {
  return (
    <Link
      className="group block cursor-pointer rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 shadow-[inset_0_1px_0_oklch(0.98_0.01_240/0.04)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      href={`/personas?tab=personas&inspect=${personaSlug(rule.persona)}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={live ? live.tone : "gray"}>{rule.segment}</StatusPill>
        <StatusPill tone={live ? "green" : "gray"}>{live ? "Live memory" : "Rule only"}</StatusPill>
        <StatusPill tone="amber">No publish</StatusPill>
      </div>
      <h2 className="mt-3 text-lg font-bold tracking-[-0.03em] text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{rule.label}</h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{rule.messageAngle}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <RuleField label="Primary CTA" value={rule.primaryCta} />
        <RuleField label="Secondary CTA" value={rule.secondaryCta} />
      </div>

      {live ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <RuleField label="Stage" value={humanize(live.stage)} />
          <RuleField label="Confidence" value={`${live.score}%`} />
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold text-[var(--accent)]">
        Inspect in side panel
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Verify the build compiles**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Verify the roster renders in the preview**

Reload `/personas` in the preview. preview_snapshot and confirm: the page lands on the Roster tab by default, shows all 12 persona cards (these come from static `PERSONA_CTA_RULES`, so they render even without Supabase), and the tab labels read Roster / Live snapshots / Knowledge / Guardrails. preview_console_logs — confirm no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/personas/page.tsx
git commit -m "feat: make Personas roster-first with live memory on cards"
```

---

## Task 5: Relabel drill-in tabs and add the deferred Performance tab

Goal: the persona detail page reflects the unified vision (Rulebook / Live snapshot / How Arc uses it / Performance), with Performance visibly deferred (no faked numbers) and an "Open in Brain" cross-link.

**Files:**
- Modify: `src/app/personas/[personaKey]/page.tsx`

- [ ] **Step 1: Add the Performance tab key and relabel existing tabs**

Replace the tab type and builder:

```ts
type PersonaDetailTab = "rule" | "memory" | "arc-use" | "performance";

const PERSONA_DETAIL_TAB_KEYS: PersonaDetailTab[] = ["rule", "memory", "arc-use", "performance"];

function buildPersonaDetailTabs(agentName: string): Array<{ key: PersonaDetailTab; label: string; detail: string }> {
  return [
    { key: "rule", label: "Rulebook", detail: "Approved CTA and landing guidance" },
    { key: "memory", label: "Live snapshot", detail: "Supabase persona memory if available" },
    { key: "arc-use", label: `How ${agentName} uses it`, detail: "How the agent applies it" },
    { key: "performance", label: "Performance", detail: "Coming soon" },
  ];
}
```

- [ ] **Step 2: Render the deferred Performance panel**

In the detail page body, after the `arc-use` block and before the closing `</div>` of the main column, add a `performance` branch that renders an explicit "coming soon" state (no placeholder metrics):

```tsx
          {activeTab === "performance" ? (
            <WorkspacePanel
              eyebrow="Performance"
              title="Persona performance is coming soon"
              description="Conversion, pipeline, and what's working per persona will appear here once the persona-to-outcome join is wired."
            >
              <EmptyState
                title="Not yet wired"
                detail="This tab will show real campaign and outcome data attributed to this persona. It is intentionally empty until that data is connected — no placeholder numbers."
              />
            </WorkspacePanel>
          ) : null}
```

(`EmptyState` and `WorkspacePanel` are already imported in this file.)

- [ ] **Step 3: Add the "Open in Brain" cross-link**

In the right-hand `aside`, inside the existing Actions panel (the `<div>` containing "Back to personas"), add a link to the Brain graph filtered to this persona. Update that action block:

```tsx
          <div className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4">
            <div className="signal-eyebrow">Actions</div>
            <div className="mt-4 flex flex-col gap-2">
              <Link href={`/brain?persona=${personaSlug(rule.persona)}`} className={buttonClasses({ variant: "ghost" })}>
                Open in Brain
              </Link>
              <Link href="/personas" className={buttonClasses({ variant: "ghost" })}>
                Back to personas
              </Link>
              {livePersona ? (
                <Link href={livePersona.crmPath} className={buttonClasses({ variant: "ghost" })}>
                  Open related CRM
                </Link>
              ) : null}
            </div>
          </div>
```

- [ ] **Step 4: Verify the build compiles**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Verify the drill-in in the preview**

Navigate to `/personas/homeowner-emergency` in the preview. preview_snapshot and confirm: four tabs (Rulebook / Live snapshot / How Arc uses it / Performance); clicking Performance shows the "coming soon" empty state; the "Open in Brain" link is present in the Actions panel. preview_console_logs — no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/personas/[personaKey]/page.tsx
git commit -m "feat: relabel persona drill-in tabs, add deferred Performance + Open in Brain"
```

---

## Task 6: Brain → Personas cross-link and persona deep-link

Goal: complete the bidirectional link. Brain's selected-node detail gains an "Open in Personas" link for persona-tagged nodes, and the Brain workspace honors a `?persona=<slug>` query param to pre-select a matching node (so the "Open in Brain" link from Task 5 lands on the right node). The selection logic is extracted into a pure, unit-tested helper.

**Files:**
- Create: `src/app/brain/_components/initial-node.ts`
- Create: `src/app/brain/_components/__tests__/initial-node.test.ts`
- Modify: `src/app/brain/_components/brain-workspace.tsx`
- Modify: `src/app/brain/page.tsx`

- [ ] **Step 1: Write the failing test for the selection helper**

Create `src/app/brain/_components/__tests__/initial-node.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { pickInitialNodeId } from "../initial-node";

type N = { id: string; kind: string; label: string; persona: string | null };

const nodes: N[] = [
  { id: "hub-1", kind: "hub", label: "Arc", persona: null },
  { id: "flag-1", kind: "campaign", label: "Emergency Water Loss", persona: null },
  { id: "p-1", kind: "persona", label: "Emergency homeowner", persona: "persona_homeowner_emergency" },
  { id: "p-2", kind: "persona", label: "Landlord", persona: "persona_landlord" },
];

describe("pickInitialNodeId", () => {
  it("selects the node whose persona matches the requested slug", () => {
    expect(pickInitialNodeId(nodes, { persona: "homeowner-emergency", hubId: "hub-1" })).toBe("p-1");
  });

  it("matches a persona slug with underscores or persona_ prefix", () => {
    expect(pickInitialNodeId(nodes, { persona: "landlord", hubId: "hub-1" })).toBe("p-2");
  });

  it("falls back to the flagship campaign node when no persona is requested", () => {
    expect(pickInitialNodeId(nodes, { persona: undefined, hubId: "hub-1" })).toBe("flag-1");
  });

  it("falls back to the hub when there is no flagship and no persona match", () => {
    const plain: N[] = [{ id: "hub-1", kind: "hub", label: "Arc", persona: null }];
    expect(pickInitialNodeId(plain, { persona: "nope", hubId: "hub-1" })).toBe("hub-1");
  });

  it("returns null for an empty node list", () => {
    expect(pickInitialNodeId([], { persona: undefined, hubId: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/brain/_components/__tests__/initial-node.test.ts`
Expected: FAIL — `pickInitialNodeId` not defined / module not found.

- [ ] **Step 3: Implement the helper**

Create `src/app/brain/_components/initial-node.ts`:

```ts
type MinimalNode = { id: string; kind: string; label: string; persona: string | null };

function normalizePersona(value: string): string {
  const stripped = value.startsWith("persona_") ? value.slice("persona_".length) : value;
  return stripped.replaceAll("_", "-").toLowerCase();
}

/**
 * Picks the node a Brain view should focus on first.
 * Priority: an explicit persona match (from `?persona=<slug>`) → the flagship
 * "emergency water" campaign node → the hub → the first node → null.
 */
export function pickInitialNodeId(
  nodes: MinimalNode[],
  opts: { persona?: string; hubId: string | null },
): string | null {
  if (opts.persona) {
    const want = normalizePersona(opts.persona);
    const match = nodes.find((n) => n.persona && normalizePersona(n.persona) === want);
    if (match) return match.id;
  }
  const flagship = nodes.find((n) => /emergency water/i.test(n.label));
  return flagship?.id ?? opts.hubId ?? nodes[0]?.id ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/brain/_components/__tests__/initial-node.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Use the helper in the workspace and accept an initial persona**

In `src/app/brain/_components/brain-workspace.tsx`:

Add the import:

```ts
import { pickInitialNodeId } from "./initial-node";
```

Extend `Props` to accept an optional persona:

```ts
type Props = { nodes: BrainNode[]; edges: BrainEdge[]; agentName: string; initialPersona?: string };
```

Replace the existing `initial` `useMemo` (the one that finds the flagship/hub) so it delegates to the helper, using the requested persona:

```ts
  const initial = useMemo(
    () => pickInitialNodeId(nodes, { persona: initialPersona, hubId: hub?.id ?? null }),
    [nodes, hub, initialPersona],
  );
```

Make sure `initialPersona` is destructured from props in the component signature:

```ts
export function BrainWorkspace({ nodes, edges, agentName, initialPersona }: Props) {
```

- [ ] **Step 6: Add the "Open in Personas" link on persona nodes**

Still in `brain-workspace.tsx`, in the selected-node detail region (where `selected.source` / tags are rendered), add a link shown only when the selected node carries a persona. Add this import at the top:

```ts
import Link from "next/link";
```

And render, immediately after the selected node's summary/body paragraph block:

```tsx
            {selected.persona ? (
              <Link
                href={`/personas/${selected.persona.replace(/^persona_/, "").replaceAll("_", "-")}`}
                className="mt-3 inline-flex text-sm font-bold text-[var(--accent)] hover:underline"
              >
                Open in Personas →
              </Link>
            ) : null}
```

- [ ] **Step 7: Pass the persona query param from the Brain page**

In `src/app/brain/page.tsx`, accept `searchParams` and forward the persona to the workspace. Update the page signature and the `BrainWorkspace` usage:

```tsx
export default async function BrainPage({
  searchParams,
}: {
  searchParams?: Promise<{ persona?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const initialPersona = Array.isArray(params.persona) ? params.persona[0] : params.persona;
```

(Keep the rest of the existing `Promise.all` data loading as-is.) Then update the workspace render:

```tsx
      <BrainWorkspace nodes={graphNodes} edges={graphEdges} agentName={agentName} initialPersona={initialPersona} />
```

- [ ] **Step 8: Verify build and tests**

Run: `pnpm test src/app/brain/_components/__tests__/initial-node.test.ts`
Expected: PASS.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 9: Verify the round-trip in the preview**

In the preview: open `/personas/homeowner-emergency`, click "Open in Brain", confirm it lands on `/brain?persona=homeowner-emergency`. If the Brain graph has a persona node for that slug, confirm it is the selected node and shows an "Open in Personas →" link that routes back. (Without Supabase data the graph may be empty — in that case just confirm no console errors and the page renders.) preview_console_logs — no errors.

- [ ] **Step 10: Commit**

```bash
git add src/app/brain
git commit -m "feat: Brain<->Personas cross-links with persona deep-link"
```

---

## Task 7: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `pnpm build`
Expected: succeeds; route list includes `/personas`, `/personas/[personaKey]`, and the `/persona-intelligence` redirects.

- [ ] **Step 2: Scoped lint on changed files**

Run lint only on the files this plan touched (full-repo lint reports ~31k vendored problems and is not a signal):

```bash
pnpm exec eslint src/app/personas src/app/_components/nav-icons.tsx src/app/_components/console-frame.tsx src/app/brain/page.tsx src/app/brain/_components/brain-workspace.tsx src/app/brain/_components/initial-node.ts
```
Expected: no errors on these files.

- [ ] **Step 3: Targeted test run**

Run: `pnpm test src/app/brain/_components/__tests__/initial-node.test.ts src/domain/__tests__/personas.test.ts`
Expected: PASS.

- [ ] **Step 4: Preview smoke**

In the preview, confirm end to end:
- Sidebar shows Personas in the Intelligence group; clicking routes to `/personas`.
- `/personas` lands on the Roster with 12 cards.
- A card → drill-in shows four tabs incl. deferred Performance.
- "Open in Brain" → `/brain?persona=...`; persona node (if present) links back.
- Visiting `/persona-intelligence` redirects to `/personas`.

preview_screenshot the roster and the drill-in to share as proof.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore: personas relaunch verification fixups"
```
(Skip if the working tree is clean.)

---

## Notes for the implementer

- **Merge safety:** `console-frame.tsx` and `next.config.ts` are shared-edit hotspots. Rebase on fresh `origin/main` and regenerate `pnpm-lock.yaml` locally (never resolve the lockfile in GitHub's web editor) before merging.
- **Supabase-less local dev:** the roster renders from static `PERSONA_CTA_RULES` regardless of Supabase, so the preview smoke works without env vars. Live-memory strips and snapshots will simply be absent — that is the correct, intended empty state, not a bug.
- **Do not** add any mutation, send, publish, or outbound affordance. Personas is inspect-only.

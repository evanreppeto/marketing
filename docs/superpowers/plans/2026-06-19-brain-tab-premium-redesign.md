# Brain Tab Premium "Second Brain" Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/brain` feel premium like Obsidian and operate as Arc's second brain — every fact carries provenance + a deep-link to its real source, a source-filter bar makes the Brand/CRM/Library/Campaign/Arc connections visible, and the selected fact reads as an Obsidian "note" with backlinks and a live recall preview.

**Architecture:** A pure `brain-provenance` domain helper derives a node's source-system + deep-link from existing fields (no schema change). A new client `BrainShell` owns two pieces of UI state — the active source filter and the selected node id — and passes filtered data to the workspace (graph · explorer · note panel), the recently-learned timeline, and the browser. The Cytoscape graph already does Obsidian physics + neighborhood focus, so graph work is limited to feeding it the filtered node set. Backlinks and the recall preview reuse the existing pure `traverseFrom`/`enrichRecall` domain functions over the in-memory graph.

**Tech Stack:** Next.js 16 (RSC + client components), React 19, TypeScript, Tailwind + Signal design tokens (`theme.ts`), Cytoscape (already wired), Vitest. Package manager **pnpm**.

---

## Pre-flight

- [ ] **Step 0: Read the spec and confirm the worktree builds.**

Read `docs/superpowers/specs/2026-06-19-brain-tab-premium-redesign-design.md`.
Run: `pnpm install` then `pnpm test src/domain/__tests__/brain-recall.test.ts`
Expected: install succeeds; the brain-recall tests PASS (confirms `traverseFrom`/`enrichRecall` baseline is green before we build on them).

---

## File Structure

**Create:**
- `src/domain/brain-provenance.ts` — pure: `nodeProvenance(node)` → `{ system, label, learnedBy, deepLink }`.
- `src/domain/__tests__/brain-provenance.test.ts` — unit tests for every branch.
- `src/app/brain/_components/brain-colors.ts` — shared `KIND_DOT` + `SOURCE_DOT` maps and `sourceCounts()` helper.
- `src/app/brain/_components/brain-shell.tsx` — client wrapper owning source-filter + selected-node state.
- `src/app/brain/_components/brain-source-filter.tsx` — the source-filter pill bar.
- `src/app/brain/_components/brain-note-panel.tsx` — the Obsidian "note" detail panel.
- `src/app/brain/_components/brain-quick-switcher.tsx` — ⌘K jump-to-fact.

**Modify:**
- `src/domain/index.ts` — re-export `brain-provenance`.
- `src/app/brain/page.tsx` — render `BrainShell` instead of wiring panels directly.
- `src/app/brain/_components/brain-workspace.tsx` — become controlled (selected id + source filter from props); swap detail aside for `BrainNotePanel`; explorer filters by kind.
- `src/app/brain/_components/recently-learned.tsx` — client; shared colors; provenance chip; respect source filter.
- `src/app/brain/_components/brain-browser.tsx` — `DataTable` with a Source column + deep-link; respect source filter.
- `src/app/library/_components/asset-grid.tsx` — open the detail drawer from a `?asset=<id>` query param.

---

## Task 1: Provenance domain helper (pure, TDD)

**Files:**
- Create: `src/domain/brain-provenance.ts`
- Test: `src/domain/__tests__/brain-provenance.test.ts`

The helper takes the fields already present on a brain node and returns its source system, a human label, who learned it, and a resolved deep-link (or null). It must not import anything with I/O.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/__tests__/brain-provenance.test.ts
import { describe, expect, it } from "vitest";

import { nodeProvenance, type ProvenanceInput } from "../brain-provenance";

const base: ProvenanceInput = {
  kind: "proof_point",
  source: null,
  createdBy: null,
  refTable: null,
  refId: null,
  tags: [],
};

describe("nodeProvenance", () => {
  it("maps a CRM lead reference to the crm system with a record deep-link", () => {
    const p = nodeProvenance({ ...base, refTable: "leads", refId: "lead-1" });
    expect(p.system).toBe("crm");
    expect(p.label).toBe("CRM · Lead");
    expect(p.deepLink).toEqual({ href: "/crm/leads/lead-1", label: "Open CRM record" });
  });

  it("maps each CRM table", () => {
    for (const [t, id] of [["companies", "c1"], ["contacts", "k1"], ["properties", "p1"], ["jobs", "j1"], ["outcomes", "o1"]] as const) {
      expect(nodeProvenance({ ...base, refTable: t, refId: id }).system).toBe("crm");
      expect(nodeProvenance({ ...base, refTable: t, refId: id }).deepLink?.href).toBe(`/crm/${t}/${id}`);
    }
  });

  it("maps a campaign reference", () => {
    const p = nodeProvenance({ ...base, refTable: "campaigns", refId: "camp-9" });
    expect(p.system).toBe("campaign");
    expect(p.deepLink).toEqual({ href: "/campaigns/camp-9", label: "Open campaign" });
  });

  it("maps a media asset to the library with an asset query deep-link", () => {
    const p = nodeProvenance({ ...base, refTable: "media_assets", refId: "asset-7" });
    expect(p.system).toBe("library");
    expect(p.label).toBe("Library asset");
    expect(p.deepLink).toEqual({ href: "/library?asset=asset-7", label: "Open in Library" });
  });

  it("labels a brand-tagged media asset as a Brand asset but still links to the library", () => {
    const p = nodeProvenance({ ...base, refTable: "media_assets", refId: "asset-7", tags: ["brand-source", "proof"] });
    expect(p.system).toBe("brand");
    expect(p.label).toBe("Brand asset");
    expect(p.deepLink?.href).toBe("/library?asset=asset-7");
  });

  it("treats an unlinked arc-created node as arc inference with no deep-link", () => {
    const p = nodeProvenance({ ...base, createdBy: "arc" });
    expect(p.system).toBe("arc");
    expect(p.label).toBe("Arc inference");
    expect(p.deepLink).toBeNull();
    expect(p.learnedBy).toBe("arc");
  });

  it("treats an unlinked human-created node as human", () => {
    const p = nodeProvenance({ ...base, createdBy: "operator" });
    expect(p.system).toBe("human");
    expect(p.learnedBy).toBe("human");
    expect(p.deepLink).toBeNull();
  });

  it("flags brand-sync provenance from the ingestion source", () => {
    const p = nodeProvenance({ ...base, refTable: "media_assets", refId: "a1", source: "brand_source_ingestion" });
    expect(p.learnedBy).toBe("brand_sync");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/brain-provenance.test.ts`
Expected: FAIL — `Cannot find module '../brain-provenance'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/brain-provenance.ts

/** The six logical sources a brain fact can originate from. Drives the source
 *  filter bar and provenance dots. */
export type BrainSourceSystem = "brand" | "crm" | "library" | "campaign" | "arc" | "human";

/** Who taught Arc this fact. */
export type LearnedBy = "arc" | "brand_sync" | "human";

/** A resolved navigation target to the fact's originating record. */
export type ProvenanceDeepLink = { href: string; label: string };

export type NodeProvenance = {
  system: BrainSourceSystem;
  label: string;
  learnedBy: LearnedBy;
  deepLink: ProvenanceDeepLink | null;
};

/** The subset of a brain node this helper reads. Mirrors fields on BrainNode. */
export type ProvenanceInput = {
  kind: string;
  source: string | null;
  createdBy: string | null;
  refTable: string | null;
  refId: string | null;
  tags: string[];
};

const CRM_TABLES = new Set(["companies", "contacts", "leads", "properties", "jobs", "outcomes"]);

const CRM_SINGULAR: Record<string, string> = {
  companies: "Company",
  contacts: "Contact",
  leads: "Lead",
  properties: "Property",
  jobs: "Job",
  outcomes: "Outcome",
};

function learnedBy(input: ProvenanceInput): LearnedBy {
  if (input.source === "brand_source_ingestion") return "brand_sync";
  if (input.createdBy === "arc") return "arc";
  return "human";
}

/**
 * Derive a node's source system, display label, who learned it, and a deep-link
 * to its originating record — purely from fields already on the node. No I/O.
 */
export function nodeProvenance(input: ProvenanceInput): NodeProvenance {
  const lb = learnedBy(input);
  const table = input.refTable;
  const id = input.refId;

  if (table && id && CRM_TABLES.has(table)) {
    return {
      system: "crm",
      label: `CRM · ${CRM_SINGULAR[table]}`,
      learnedBy: lb,
      deepLink: { href: `/crm/${table}/${id}`, label: "Open CRM record" },
    };
  }

  if (table === "campaigns" && id) {
    return {
      system: "campaign",
      label: "Campaign",
      learnedBy: lb,
      deepLink: { href: `/campaigns/${id}`, label: "Open campaign" },
    };
  }

  if (table === "media_assets" && id) {
    const isBrand = input.tags.includes("brand-source");
    return {
      system: isBrand ? "brand" : "library",
      label: isBrand ? "Brand asset" : "Library asset",
      learnedBy: lb,
      deepLink: { href: `/library?asset=${id}`, label: "Open in Library" },
    };
  }

  // No linked record: Arc inference or a human-entered fact.
  const system: BrainSourceSystem = input.createdBy === "arc" ? "arc" : "human";
  return {
    system,
    label: system === "arc" ? "Arc inference" : "Entered by operator",
    learnedBy: lb,
    deepLink: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/brain-provenance.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Re-export from the domain barrel**

Modify `src/domain/index.ts` — add alongside the other re-exports:

```ts
export * from "./brain-provenance";
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm test src/domain/__tests__/brain-provenance.test.ts && npx tsc --noEmit`
Expected: tests PASS, tsc clean.

```bash
git add src/domain/brain-provenance.ts src/domain/__tests__/brain-provenance.test.ts src/domain/index.ts
git commit -m "feat(brain): add nodeProvenance domain helper"
```

---

## Task 2: Shared color maps + source-count helper

Consolidates the two diverging kind-color maps (`KIND_DOT` in `brain-workspace.tsx`, `KIND_COLOR` in `recently-learned.tsx`) into one, and adds a `SOURCE_DOT` map for the provenance axis plus a pure `sourceCounts` helper for the filter bar.

**Files:**
- Create: `src/app/brain/_components/brain-colors.ts`
- Test: `src/app/brain/_components/__tests__/brain-colors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/brain/_components/__tests__/brain-colors.test.ts
import { describe, expect, it } from "vitest";

import { sourceCounts } from "../brain-colors";

const node = (over: Partial<Parameters<typeof sourceCounts>[0][number]> = {}) => ({
  kind: "proof_point",
  source: null,
  createdBy: "arc",
  refTable: null,
  refId: null,
  tags: [] as string[],
  ...over,
});

describe("sourceCounts", () => {
  it("buckets nodes by source system with a total", () => {
    const counts = sourceCounts([
      node({ refTable: "leads", refId: "l1" }),
      node({ refTable: "media_assets", refId: "a1" }),
      node({ refTable: "media_assets", refId: "a2", tags: ["brand-source"] }),
      node({ createdBy: "arc" }),
      node({ createdBy: "arc" }),
    ]);
    expect(counts.all).toBe(5);
    expect(counts.bySystem.crm).toBe(1);
    expect(counts.bySystem.library).toBe(1);
    expect(counts.bySystem.brand).toBe(1);
    expect(counts.bySystem.arc).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/brain/_components/__tests__/brain-colors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/brain/_components/brain-colors.ts
import { nodeProvenance, type BrainSourceSystem, type ProvenanceInput } from "@/domain";

/**
 * Single source of truth for kind dot colors across the Brain UI. Previously this
 * map was duplicated (and diverged) between the workspace rail and the recently-
 * learned timeline. Values are concrete hex so Cytoscape's canvas can read them.
 */
export const KIND_DOT: Record<string, string> = {
  brand_fact: "#d05038",
  persona: "#b08755",
  segment: "#5d8a4f",
  service: "#3a72b0",
  proof_point: "#8a78c0",
  messaging_angle: "#d08a2c",
  cta: "#dc6a3a",
  asset_ref: "#2f93b8",
  learning: "#4f9a8a",
  signal: "#b3604a",
  crm_ref: "#6b7d8f",
  campaign_ref: "#5878a8",
  objection: "#cc6666",
  channel: "#86868e",
  campaign: "#5878a8",
};
export const kindDot = (kind: string): string => KIND_DOT[kind] ?? "#7a828f";

/** Provenance / source-system dot colors — a separate axis from kind. */
export const SOURCE_DOT: Record<BrainSourceSystem, string> = {
  brand: "#d05038",
  crm: "#3a72b0",
  library: "#8a78c0",
  campaign: "#5878a8",
  arc: "#c8a24a",
  human: "#86868e",
};

/** Display order + labels for the source filter bar. */
export const SOURCE_ORDER: Array<{ system: BrainSourceSystem; label: string }> = [
  { system: "brand", label: "Brand" },
  { system: "crm", label: "CRM" },
  { system: "library", label: "Library" },
  { system: "campaign", label: "Campaigns" },
  { system: "arc", label: "Arc inference" },
  { system: "human", label: "Human" },
];

export type SourceCounts = { all: number; bySystem: Record<BrainSourceSystem, number> };

/** Count nodes per source system (pure). Used to label the filter pills. */
export function sourceCounts(nodes: ProvenanceInput[]): SourceCounts {
  const bySystem: Record<BrainSourceSystem, number> = {
    brand: 0, crm: 0, library: 0, campaign: 0, arc: 0, human: 0,
  };
  for (const n of nodes) bySystem[nodeProvenance(n).system] += 1;
  return { all: nodes.length, bySystem };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/brain/_components/__tests__/brain-colors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/brain/_components/brain-colors.ts src/app/brain/_components/__tests__/brain-colors.test.ts
git commit -m "feat(brain): shared kind/source color maps + sourceCounts"
```

---

## Task 3: BrainShell client wrapper (owns filter + selection state)

Centralizes the two pieces of cross-panel UI state so the source filter affects the graph, explorer, note panel, recently-learned, and browser, and so ⌘K can drive selection. The workspace becomes controlled.

**Files:**
- Create: `src/app/brain/_components/brain-shell.tsx`
- Modify: `src/app/brain/page.tsx`
- Modify: `src/app/brain/_components/brain-workspace.tsx` (props become controlled — full new file in Task 5; for now just accept the new props)

- [ ] **Step 1: Create the shell**

```tsx
// src/app/brain/_components/brain-shell.tsx
"use client";

import { useMemo, useState } from "react";

import { nodeProvenance, type BrainSourceSystem } from "@/domain";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { ApprovalQueue } from "./approval-queue";
import { BrainBrowser } from "./brain-browser";
import { BrainQuickSwitcher } from "./brain-quick-switcher";
import { BrainSourceFilter } from "./brain-source-filter";
import { BrainWorkspace } from "./brain-workspace";
import { RecentlyLearned } from "./recently-learned";

type Props = {
  graphNodes: BrainNode[];
  graphEdges: BrainEdge[];
  allNodes: BrainNode[];
  proposedNodes: BrainNode[];
  agentName: string;
};

/** "all" plus the six source systems. */
export type SourceFilter = "all" | BrainSourceSystem;

function matchesSource(node: BrainNode, filter: SourceFilter): boolean {
  if (filter === "all") return true;
  return nodeProvenance(node).system === filter;
}

export function BrainShell({ graphNodes, graphEdges, allNodes, proposedNodes, agentName }: Props) {
  const [source, setSource] = useState<SourceFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredGraphNodes = useMemo(() => graphNodes.filter((n) => matchesSource(n, source)), [graphNodes, source]);
  const filteredGraphIds = useMemo(() => new Set(filteredGraphNodes.map((n) => n.id)), [filteredGraphNodes]);
  const filteredEdges = useMemo(
    () => graphEdges.filter((e) => filteredGraphIds.has(e.fromNodeId) && filteredGraphIds.has(e.toNodeId)),
    [graphEdges, filteredGraphIds],
  );
  const filteredAll = useMemo(() => allNodes.filter((n) => matchesSource(n, source)), [allNodes, source]);

  return (
    <div className="flex flex-col gap-6">
      <BrainSourceFilter nodes={allNodes} active={source} onChange={setSource} />
      <BrainWorkspace
        nodes={filteredGraphNodes}
        edges={filteredEdges}
        agentName={agentName}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <RecentlyLearned nodes={filteredAll} />
        <ApprovalQueue nodes={proposedNodes} />
      </div>
      <BrainBrowser nodes={filteredAll} agentName={agentName} />
      <BrainQuickSwitcher nodes={graphNodes} onSelect={setSelectedId} />
    </div>
  );
}
```

- [ ] **Step 2: Simplify `page.tsx` to render the shell**

Replace the JSX return in `src/app/brain/page.tsx` (keep all the data-fetching and `stats` computation above it) so the body is:

```tsx
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marketing Brain"
        description={`${agentName}'s durable marketing memory — brand facts, personas, proof, and what it has learned. ${summaryLine}`}
      />
      {summary.status === "live" ? <StatStrip items={stats} columns={4} /> : null}
      <BrainShell
        graphNodes={graphNodes}
        graphEdges={graphEdges}
        allNodes={allNodes}
        proposedNodes={proposedNodes}
        agentName={agentName}
      />
    </div>
  );
```

Update imports at the top of `page.tsx`: remove the now-unused direct panel imports (`ApprovalQueue`, `BrainBrowser`, `BrainWorkspace`, `RecentlyLearned`) and add:

```tsx
import { BrainShell } from "@/app/brain/_components/brain-shell";
```

> NOTE: `brain-source-filter.tsx`, `brain-note-panel.tsx`, and `brain-quick-switcher.tsx` don't exist yet — the build will fail until Tasks 4–6 land. That's expected; this task is committed together with Task 4–6 if you prefer a green tree, or commit now and keep going. To keep each task independently green, **do Tasks 4, 5, and 6 before building.**

- [ ] **Step 3: Commit (structural)**

```bash
git add src/app/brain/_components/brain-shell.tsx src/app/brain/page.tsx
git commit -m "refactor(brain): introduce BrainShell owning filter + selection state"
```

---

## Task 4: Source filter bar

**Files:**
- Create: `src/app/brain/_components/brain-source-filter.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/brain/_components/brain-source-filter.tsx
"use client";

import { useMemo } from "react";

import { cx } from "@/app/_components/theme";
import type { BrainNode } from "@/lib/knowledge-graph/read-model";

import { SOURCE_DOT, SOURCE_ORDER, sourceCounts } from "./brain-colors";
import type { SourceFilter } from "./brain-shell";

type Props = { nodes: BrainNode[]; active: SourceFilter; onChange: (next: SourceFilter) => void };

export function BrainSourceFilter({ nodes, active, onChange }: Props) {
  const counts = useMemo(() => sourceCounts(nodes), [nodes]);

  const pill = (key: SourceFilter, label: string, count: number, dot?: string) => {
    const isActive = active === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        aria-pressed={isActive}
        className={cx(
          "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
          isActive
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]"
            : "border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]",
        )}
      >
        {dot ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} /> : null}
        <span>{label}</span>
        <span className={cx("font-mono", isActive ? "text-[var(--on-accent)]" : "text-[var(--text-muted)]")}>{count}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="signal-eyebrow mr-1">Source</span>
      {pill("all", "All", counts.all)}
      {SOURCE_ORDER.filter((s) => counts.bySystem[s.system] > 0).map((s) =>
        pill(s.system, s.label, counts.bySystem[s.system], SOURCE_DOT[s.system]),
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/brain/_components/brain-source-filter.tsx
git commit -m "feat(brain): source filter pill bar"
```

---

## Task 5: The Obsidian "note" panel + controlled workspace

Replaces the right-hand detail aside in the workspace with a richer note panel (provenance, deep-link, split backlinks/outgoing links, recall preview), and makes the workspace controlled by `BrainShell`.

**Files:**
- Create: `src/app/brain/_components/brain-note-panel.tsx`
- Modify (full rewrite): `src/app/brain/_components/brain-workspace.tsx`

- [ ] **Step 1: Write the note panel**

```tsx
// src/app/brain/_components/brain-note-panel.tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import { enrichRecall, nodeProvenance, type RecallGraph } from "@/domain";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { SOURCE_DOT } from "./brain-colors";

type Relation = { node: BrainNode; relation: string };
type Props = {
  selected: BrainNode | null;
  nodes: BrainNode[];
  edges: BrainEdge[];
  agentName: string;
  onSelect: (id: string) => void;
};

function trustTone(tier: string): "green" | "amber" | "gray" {
  if (tier === "trusted") return "green";
  if (tier === "observed") return "amber";
  return "gray";
}

const KIND_LABELS: Record<string, string> = {
  arc: "Core", hub: "Core", brand_fact: "Brand fact", persona: "Persona", proof_point: "Proof point",
  campaign: "Campaign", objection: "Objection", channel: "Channel", service: "Service",
  learning: "Learning", signal: "Signal", messaging_angle: "Messaging", campaign_ref: "Campaign ref", cta: "CTA",
};
const kindLabel = (k: string) => KIND_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function BrainNotePanel({ selected, nodes, edges, agentName, onSelect }: Props) {
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Split incoming (backlinks) vs outgoing edges for the selected node.
  const { backlinks, outgoing } = useMemo(() => {
    const back: Relation[] = [];
    const out: Relation[] = [];
    if (!selected) return { backlinks: back, outgoing: out };
    for (const e of edges) {
      if (e.toNodeId === selected.id) {
        const n = byId.get(e.fromNodeId);
        if (n) back.push({ node: n, relation: e.relation });
      } else if (e.fromNodeId === selected.id) {
        const n = byId.get(e.toNodeId);
        if (n) out.push({ node: n, relation: e.relation });
      }
    }
    return { backlinks: back.slice(0, 8), outgoing: out.slice(0, 8) };
  }, [selected, edges, byId]);

  // Live recall preview: what Arc pulls into memory near this fact (pure domain fn).
  const recallLines = useMemo(() => {
    if (!selected) return [] as string[];
    const graph: RecallGraph = {
      nodes: nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
      edges: edges.map((e) => ({ fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, relation: e.relation })),
    };
    const seed = { id: selected.id, kind: selected.kind, label: selected.label, summary: selected.summary, tags: selected.tags, trustTier: selected.trustTier };
    return enrichRecall([seed], graph, { enrichLimit: 1, relationsPerNode: 4 })[0]?.related ?? [];
  }, [selected, nodes, edges]);

  if (!selected) {
    return (
      <aside className="signal-panel flex min-w-0 flex-col items-center justify-center gap-1 p-4 text-center">
        <div className="text-sm font-medium text-[var(--text-secondary)]">Select a fact</div>
        <p className="text-xs text-[var(--text-muted)]">Tap any node to inspect what {agentName} knows — its source, backlinks, and what Arc recalls around it.</p>
      </aside>
    );
  }

  const prov = nodeProvenance(selected);
  const confidence = selected.confidence != null ? Math.round(selected.confidence * 100) : null;
  const learnedLabel = prov.learnedBy === "brand_sync" ? "Brand sync" : prov.learnedBy === "arc" ? agentName : "Operator";

  const RelationRow = ({ node, relation }: Relation) => (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-[var(--surface-inset)]"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SOURCE_DOT[nodeProvenance(node).system] }} />
        <span className="truncate text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{node.label}</span>
      </span>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{relation.replace(/_/g, " ")}</span>
    </button>
  );

  return (
    <aside className="signal-panel min-w-0 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="signal-eyebrow">{kindLabel(selected.kind)}</span>
          <StatusPill tone={trustTone(selected.trustTier)}>{selected.trustTier}</StatusPill>
        </div>
        <h3 className="font-serif text-lg font-semibold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">{selected.label}</h3>
        {(selected.summary || selected.body) && (
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{selected.summary ?? selected.body}</p>
        )}

        {/* Properties / provenance */}
        <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-20 text-[var(--text-muted)]">Source</span>
            <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_DOT[prov.system] }} />
              {prov.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 text-[var(--text-muted)]">Learned by</span>
            <span className="text-[var(--text-secondary)]">{learnedLabel}</span>
          </div>
          {confidence != null && (
            <div className="flex items-center gap-2">
              <span className="w-20 text-[var(--text-muted)]">Confidence</span>
              <span className="font-mono text-[var(--text-secondary)]">{confidence}%</span>
            </div>
          )}
        </div>

        {/* Deep link to the originating record */}
        {prov.deepLink && (
          <Link
            href={prov.deepLink.href}
            className="flex items-center justify-between rounded-md border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-raised)]"
          >
            <span>{prov.deepLink.label}</span>
            <span aria-hidden>↗</span>
          </Link>
        )}

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div className="border-t border-[var(--border-hairline)] pt-3">
            <div className="signal-eyebrow mb-2">↩ Linked references · {backlinks.length}</div>
            <div className="flex flex-col gap-1">{backlinks.map((r) => <RelationRow key={`b-${r.node.id}`} {...r} />)}</div>
          </div>
        )}

        {/* Outgoing links */}
        {outgoing.length > 0 && (
          <div className="border-t border-[var(--border-hairline)] pt-3">
            <div className="signal-eyebrow mb-2">→ Links · {outgoing.length}</div>
            <div className="flex flex-col gap-1">{outgoing.map((r) => <RelationRow key={`o-${r.node.id}`} {...r} />)}</div>
          </div>
        )}

        {/* What Arc recalls here */}
        {recallLines.length > 0 && (
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[radial-gradient(120%_100%_at_0%_0%,var(--accent-soft),transparent_70%)] p-3">
            <div className="signal-eyebrow mb-1.5">⟡ What {agentName} recalls here</div>
            <p className="mb-1.5 text-[11px] text-[var(--text-muted)]">When reasoning near this fact, {agentName} also pulls:</p>
            <ul className="flex flex-col gap-1 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {recallLines.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>
        )}

        {selected.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-[var(--border-hairline)] pt-3">
            {selected.tags.slice(0, 8).map((t) => (
              <span key={t} className="rounded border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{t}</span>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
```

> The `--accent-contrast`, `--accent-soft`, and `--accent-border-strong` tokens are already used elsewhere in the brain components (see `approval-queue.tsx` / `data-table.tsx`). If tsc/lint flags any token as missing, fall back to `--accent` / `--surface-inset` per `DESIGN.md` — never invent a `--surface` bare token (known invisible-chip bug).

- [ ] **Step 2: Rewrite the workspace as controlled, using the note panel**

Full replacement for `src/app/brain/_components/brain-workspace.tsx`:

```tsx
// src/app/brain/_components/brain-workspace.tsx
"use client";

import { useEffect, useMemo } from "react";

import { cx } from "@/app/_components/theme";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { BrainGraphCytoscape } from "./brain-graph-cytoscape";
import { BrainNotePanel } from "./brain-note-panel";
import { KIND_DOT } from "./brain-colors";

type Props = {
  nodes: BrainNode[];
  edges: BrainEdge[];
  agentName: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

const KIND_LABELS: Record<string, string> = {
  arc: "Core", hub: "Core", brand_fact: "Brand facts", persona: "Personas", proof_point: "Proof points",
  campaign: "Campaigns", objection: "Objections", channel: "Channels", service: "Services",
  learning: "Learnings", signal: "Signals", messaging_angle: "Messaging", campaign_ref: "Campaign refs", cta: "CTAs",
};
const kindLabel = (k: string) => KIND_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function BrainWorkspace({ nodes, edges, agentName, selectedId, onSelect }: Props) {
  const hub = useMemo(() => nodes.find((n) => n.kind === "arc" || n.kind === "hub") ?? null, [nodes]);

  // Default focus the flagship/hub once, only when nothing is selected yet.
  useEffect(() => {
    if (selectedId) return;
    const flagship = nodes.find((n) => /emergency water/i.test(n.label));
    const initial = flagship?.id ?? hub?.id ?? nodes[0]?.id ?? null;
    if (initial) onSelect(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of nodes) {
      if (n.kind === "arc" || n.kind === "hub") continue;
      counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  return (
    <div className="grid gap-3 lg:grid-cols-[208px_minmax(0,1fr)_320px]">
      {/* Explorer rail */}
      <aside className="signal-panel hidden min-w-0 flex-col p-3 lg:flex">
        <div className="signal-eyebrow mb-2.5 px-1">Explore</div>
        <button
          type="button"
          onClick={() => hub && onSelect(hub.id)}
          className={cx(
            "mb-1 flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition",
            !selected || selected.id === hub?.id
              ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]",
          )}
        >
          <span className="flex items-center gap-2 font-medium">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            All knowledge
          </span>
          <span className="font-mono text-xs text-[var(--text-muted)]">{nodes.length}</span>
        </button>
        <div className="mt-1 flex flex-col">
          {categories.map(([kind, count]) => {
            const rep = nodes.find((n) => n.kind === kind);
            const active = selected?.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => rep && onSelect(rep.id)}
                className={cx(
                  "flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition",
                  active ? "bg-[var(--surface-inset)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_DOT[kind] ?? "var(--text-muted)" }} />
                  <span className="truncate">{kindLabel(kind)}</span>
                </span>
                <span className="font-mono text-xs text-[var(--text-muted)]">{count}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Graph hero */}
      <section className="signal-panel relative min-w-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Knowledge web</span>
            <span className="text-xs text-[var(--text-muted)]">{agentName}&apos;s connected memory</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--ok)]" />Trusted</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" />Observed</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-dashed border-[var(--text-muted)]" />Proposed</span>
          </div>
        </div>
        <div className="relative h-[74vh] min-h-[620px] w-full bg-[radial-gradient(120%_90%_at_50%_8%,rgba(200,162,74,0.05),transparent_60%)]">
          {nodes.length > 0 ? (
            <BrainGraphCytoscape nodes={nodes} edges={edges} selectedId={selectedId} onSelect={onSelect} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">No facts match this filter.</div>
          )}
        </div>
      </section>

      {/* Note panel */}
      <BrainNotePanel selected={selected} nodes={nodes} edges={edges} agentName={agentName} onSelect={onSelect} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/brain/_components/brain-note-panel.tsx src/app/brain/_components/brain-workspace.tsx
git commit -m "feat(brain): Obsidian note panel with backlinks + recall preview; controlled workspace"
```

---

## Task 6: Quick switcher (⌘K jump to a fact)

Mirrors the existing hand-rolled `command-palette.tsx` pattern (keyboard nav already solved there) rather than re-wiring cmdk, for consistency and low risk.

**Files:**
- Create: `src/app/brain/_components/brain-quick-switcher.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/brain/_components/brain-quick-switcher.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cx } from "@/app/_components/theme";
import { nodeProvenance } from "@/domain";
import type { BrainNode } from "@/lib/knowledge-graph/read-model";

import { SOURCE_DOT } from "./brain-colors";

/** ⌘K / Ctrl+K fuzzy jump to any fact. Opens on the shortcut; Enter selects. */
export function BrainQuickSwitcher({ nodes, onSelect }: { nodes: BrainNode[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => { setQuery(""); setActive(0); });
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? nodes.filter((n) => n.label.toLowerCase().includes(q)) : nodes;
    return list.slice(0, 30);
  }, [query, nodes]);

  useEffect(() => {
    void Promise.resolve().then(() => setActive((a) => Math.min(a, Math.max(0, results.length - 1))));
  }, [results.length]);

  if (!open) return null;

  const choose = (n: BrainNode | undefined) => {
    if (!n) return;
    onSelect(n.id);
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[18vh]" role="dialog" aria-modal="true" aria-label="Jump to a fact">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-raised)] shadow-[var(--elev-raised)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-4 py-3">
          <span className="font-mono text-xs text-[var(--accent)]">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a fact…"
            aria-label="Search facts"
            style={{ outline: "none" }}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
              else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
            }}
          />
          <span className="hidden shrink-0 rounded border border-[var(--border-hairline)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline">esc</span>
        </div>
        <ul role="listbox" className="max-h-72 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No matching facts</li>
          ) : (
            results.map((n, i) => (
              <li key={n.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(n)}
                  className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition", i === active ? "bg-[var(--surface-inset)]" : "hover:bg-[var(--surface-inset)]")}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SOURCE_DOT[nodeProvenance(n).system] }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{n.label}</span>
                  <span className="shrink-0 font-mono text-[10px] uppercase text-[var(--text-muted)]">{n.kind.replace(/_/g, " ")}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify Tasks 3–6 integrate**

Run: `pnpm build`
Expected: build SUCCEEDS (the `/brain` route compiles with shell + filter + note panel + quick switcher).

- [ ] **Step 3: Commit**

```bash
git add src/app/brain/_components/brain-quick-switcher.tsx
git commit -m "feat(brain): ⌘K quick switcher to jump to any fact"
```

---

## Task 7: Recently-learned — shared colors + provenance chip + filter-aware

**Files:**
- Modify (full rewrite): `src/app/brain/_components/recently-learned.tsx`

- [ ] **Step 1: Rewrite using shared colors + provenance**

```tsx
// src/app/brain/_components/recently-learned.tsx
"use client";

import { Panel, StatusPill } from "@/app/_components/page-header";
import { type ThemeTone } from "@/app/_components/theme";
import { nodeProvenance } from "@/domain";
import { type BrainNode } from "@/lib/knowledge-graph/read-model";

import { kindDot, SOURCE_DOT } from "./brain-colors";

const TIER_TONE: Record<string, ThemeTone> = {
  trusted: "green", proposed: "amber", observed: "blue", rejected: "red", archived: "gray",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export function RecentlyLearned({ nodes }: { nodes: BrainNode[] }) {
  const recent = [...nodes]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 8);

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Recently learned</h2>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{recent.length} latest</span>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm leading-6 text-[var(--text-secondary)]">Nothing recorded for this filter yet. As Arc learns, new facts land here newest-first.</p>
      ) : (
        <ol className="relative flex flex-col">
          {recent.map((node, i) => {
            const prov = nodeProvenance(node);
            return (
              <li key={node.id} className="flex gap-3 pb-3 last:pb-0">
                <div className="relative flex w-3 shrink-0 justify-center">
                  {i < recent.length - 1 ? <span aria-hidden className="absolute top-3 bottom-0 w-px bg-[var(--border-hairline)]" /> : null}
                  <span aria-hidden className="relative z-10 mt-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface-panel)]" style={{ backgroundColor: kindDot(node.kind) }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_DOT[prov.system] }} />
                      {prov.label}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{timeAgo(node.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-[var(--text-primary)]">{node.label}</p>
                    <StatusPill tone={TIER_TONE[node.trustTier] ?? "gray"}>{node.trustTier}</StatusPill>
                  </div>
                  {node.summary || node.body ? (
                    <p className="mt-0.5 truncate text-sm leading-6 text-[var(--text-secondary)]">{node.summary ?? node.body}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/brain/_components/recently-learned.tsx
git commit -m "feat(brain): recently-learned shows provenance + shared colors"
```

---

## Task 8: Brain browser — DataTable with a Source column + deep-link

**Files:**
- Modify (full rewrite): `src/app/brain/_components/brain-browser.tsx`

- [ ] **Step 1: Rewrite using DataTable**

```tsx
// src/app/brain/_components/brain-browser.tsx
"use client";

import Link from "next/link";

import { DataTable, type Column } from "@/app/_components/data-table";
import { Panel, StatusPill } from "@/app/_components/page-header";
import { type ThemeTone } from "@/app/_components/theme";
import { nodeProvenance } from "@/domain";
import { type BrainNode } from "@/lib/knowledge-graph/read-model";

import { SOURCE_DOT } from "./brain-colors";

const TIER_TONE: Record<string, ThemeTone> = {
  trusted: "green", proposed: "amber", observed: "blue", rejected: "red", archived: "gray",
};

export function BrainBrowser({ nodes, agentName = "Arc" }: { nodes: BrainNode[]; agentName?: string }) {
  if (nodes.length === 0) {
    return (
      <Panel>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Brain</h2>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          No facts for this filter. Run{" "}
          <code className="rounded border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-1 font-mono text-xs text-[var(--text-primary)]">pnpm seed:brain</code>{" "}
          or let {agentName} start recording what it learns.
        </p>
      </Panel>
    );
  }

  const columns: Array<Column<BrainNode>> = [
    {
      key: "fact",
      header: "Fact",
      cell: (n) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-[var(--text-primary)]">{n.label}</p>
          {n.body ? <p className="truncate text-sm leading-6 text-[var(--text-secondary)]">{n.body}</p> : null}
        </div>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      cell: (n) => <span className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{n.kind.replace(/_/g, " ")}</span>,
    },
    {
      key: "source",
      header: "Source",
      cell: (n) => {
        const prov = nodeProvenance(n);
        return (
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_DOT[prov.system] }} />
            {prov.label}
          </span>
        );
      },
    },
    {
      key: "trust",
      header: "Trust",
      cell: (n) => <StatusPill tone={TIER_TONE[n.trustTier] ?? "blue"}>{n.trustTier}</StatusPill>,
    },
    {
      key: "link",
      header: "",
      align: "right",
      cell: (n) => {
        const prov = nodeProvenance(n);
        return prov.deepLink ? (
          <Link href={prov.deepLink.href} className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--accent)] hover:underline">
            {prov.deepLink.label} ↗
          </Link>
        ) : null;
      },
    },
  ];

  return (
    <Panel>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Brain ({nodes.length})</h2>
      <DataTable columns={columns} rows={nodes} rowKey={(n) => n.id} minWidth="min-w-[760px]" />
    </Panel>
  );
}
```

> The browser is intentionally **not** row-linked via `rowHref` — the deep-link is its own cell, because not every fact has a source record and a whole-row link to `/crm/...` would be wrong for Arc-inference facts.

- [ ] **Step 2: Build + commit**

Run: `pnpm build`
Expected: SUCCEEDS.

```bash
git add src/app/brain/_components/brain-browser.tsx
git commit -m "feat(brain): browser as DataTable with source column + deep-link"
```

---

## Task 9: `/library?asset=<id>` deep-link target

Makes Brain's Library/Brand deep-links land on the right asset by opening the detail drawer from a query param. Purely additive.

**Files:**
- Modify: `src/app/library/_components/asset-grid.tsx`

- [ ] **Step 1: Read the current selection state**

Open `src/app/library/_components/asset-grid.tsx`. It holds `const [selectedId, setSelectedId] = useState<string | null>(null);` (around line 34) and derives `selected` from `filtered`.

- [ ] **Step 2: Initialize selection from the URL on mount**

Add the import at the top (with the other React imports):

```tsx
import { useEffect } from "react";
```

Immediately after the `selectedId` state declaration, add:

```tsx
  // Open a specific asset's drawer when arriving from a deep-link (e.g. the Brain
  // tab links to /library?asset=<id>). Runs once on mount; no-op without the param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const assetId = params.get("asset");
    if (assetId) setSelectedId(assetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

> If `asset-grid.tsx` already imports `useEffect`, don't duplicate the import — add the effect only.

- [ ] **Step 3: Verify + commit**

Run: `pnpm build`
Expected: SUCCEEDS. Manual check happens in Task 11.

```bash
git add src/app/library/_components/asset-grid.tsx
git commit -m "feat(library): open asset drawer from ?asset= deep-link"
```

---

## Task 10: Demo data source coverage

Ensures the local (Supabase-less) demo brain exercises multiple source systems so the filter bar and provenance read correctly without a database.

**Files:**
- Modify: `src/lib/knowledge-graph/demo.ts`

- [ ] **Step 1: Audit demo coverage**

Read `src/lib/knowledge-graph/demo.ts`. For each `BrainSourceSystem` (`brand`, `crm`, `library`, `campaign`, `arc`, `human`), confirm at least one demo node resolves to it via `nodeProvenance` — i.e. at least one node with `refTable: "media_assets"` + `tags: ["brand-source"]` (brand), one CRM `refTable` (crm), one `media_assets` without the brand tag (library), one `refTable: "campaigns"` (campaign), several unlinked `createdBy: "arc"` (arc), and optionally one `createdBy: "operator"` (human).

- [ ] **Step 2: Add any missing demo nodes**

If a system is unrepresented, add a demo node for it following the existing shape in the file (match the existing `BrainNode` fields exactly — `id`, `kind`, `label`, `body`, `summary`, `persona`, `trustTier`, `confidence`, `refTable`, `refId`, `source`, `tags`, `createdBy`, `createdAt`). Example for the brand + library + campaign gaps:

```ts
// add to the demo nodes array (adapt ids to the file's scheme)
{ id: "demo-brand-1", kind: "brand_fact", label: "Brand voice: calm, expert, fast", body: "Tone guide pulled from the brand kit.", summary: "Calm, expert, fast", persona: null, trustTier: "trusted", confidence: 0.9, refTable: "media_assets", refId: "demo-asset-brand", source: "brand_source_ingestion", tags: ["brand-source", "voice"], createdBy: "arc", createdAt: new Date(Date.now() - 6 * 3600_000).toISOString() },
{ id: "demo-lib-1", kind: "proof_point", label: "90-minute emergency water response", body: "From BSR_flood_response.pdf in the library.", summary: "90-min response, 24/7", persona: null, trustTier: "trusted", confidence: 0.92, refTable: "media_assets", refId: "demo-asset-lib", source: "library", tags: ["emergency", "water-damage"], createdBy: "arc", createdAt: new Date(Date.now() - 3 * 86400_000).toISOString() },
{ id: "demo-camp-1", kind: "campaign_ref", label: "Emergency Water Campaign", body: "Flagship campaign package.", summary: null, persona: null, trustTier: "observed", confidence: 0.7, refTable: "campaigns", refId: "demo-campaign", source: "arc", tags: ["campaign"], createdBy: "arc", createdAt: new Date(Date.now() - 2 * 86400_000).toISOString() },
```

If coverage is already complete, skip Step 2 and note it in the commit.

- [ ] **Step 3: Verify the demo renders all source pills**

Run: `pnpm test src/lib/knowledge-graph` and `pnpm build`
Expected: existing demo/graph tests still PASS; build SUCCEEDS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/knowledge-graph/demo.ts
git commit -m "test(brain): demo data covers every source system"
```

---

## Task 11: Full verification (build, lint, preview)

**Files:** none (verification only).

- [ ] **Step 1: Type + unit + targeted lint**

Run:
```bash
pnpm build
pnpm test src/domain/__tests__/brain-provenance.test.ts src/app/brain/_components/__tests__/brain-colors.test.ts src/domain/__tests__/brain-recall.test.ts
npx eslint src/app/brain src/domain/brain-provenance.ts src/app/library/_components/asset-grid.tsx
```
Expected: build SUCCEEDS; tests PASS; eslint clean on the changed paths (repo-wide lint is noisy — scope to changed files per project memory).

- [ ] **Step 2: Preview the page (Supabase-less demo path)**

Use the preview tooling to start the dev server and load `/brain`. Verify:
- The source filter bar shows `All` + pills for each represented system with counts; clicking a pill filters the graph, recently-learned, and browser.
- Selecting a node (graph click, explorer click, or ⌘K) populates the note panel with provenance, a deep-link (for linked nodes), backlinks, outgoing links, and a "What Arc recalls here" block.
- ⌘K opens the quick switcher; typing filters; Enter selects and the graph focuses that node's neighborhood.
- The browser renders as a table with a Source column; deep-links appear only on linked facts.
- No console errors; `prefers-reduced-motion` respected (graph already handles this).

Capture a screenshot for the user.

- [ ] **Step 3: Verify a deep-link round-trips**

From a Library/Brand fact's note panel, click "Open in Library ↗" and confirm `/library?asset=<id>` opens that asset's detail drawer.

- [ ] **Step 4: Final commit (if any preview fixes were needed)**

```bash
git add -A
git commit -m "fix(brain): preview-verified polish"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** provenance+deep-links (Tasks 1,5,8), source filter (Tasks 3,4), Obsidian note panel w/ backlinks (Task 5), recall preview (Task 5), graph neighborhood focus (already in `brain-graph-cytoscape.tsx` — no task needed), explorer rail (Task 5), ⌘K (Task 6), `/library?asset=` (Task 9), single shared color system (Task 2). The "future per-reply usage logging" is a documented non-goal — no task, by design.
- **Deferred from spec §5, intentional:** the explorer rail keeps the existing "click a kind → select a representative node" behavior rather than adding a second *kind-filter* axis on top of the source filter. The source filter already provides filtering; a second axis would double the state and the UX payoff is small (YAGNI). Revisit only if the user asks for per-kind filtering.
- **Recall-preview scope:** when a source filter is active, the note panel's "What Arc recalls here" traverses the filtered edge set (consistent with the visible graph), not the whole brain. Acceptable for v1; widen to the full graph later if needed.
- **Deviation from spec, intentional:** the graph keeps **trust-tier** node colors (it already encodes trusted/observed/proposed, matching the legend) rather than recoloring by source; the **source** axis is carried by the filter bar, note panel, recently-learned, browser, and quick-switcher dots, and the filter narrows which nodes the graph shows. This avoids double-encoding and destabilizing the working Obsidian physics graph.
- **Type consistency:** `nodeProvenance` / `ProvenanceInput` / `BrainSourceSystem` are defined in Task 1 and reused everywhere; `SourceFilter` is defined in `brain-shell.tsx` (Task 3) and imported by the filter bar (Task 4); `BrainWorkspace` props go controlled in Task 5 to match the calls in Task 3.
- **Token safety:** uses existing tokens only; never the bare `--surface` token (known invisible-element bug).

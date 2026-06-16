# Vault Notebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new top-level **Vault** tab — an Obsidian-style linked knowledge base shared by the team and the Arc agent, in scaffold-mode.

**Architecture:** Pure, deterministic notebook logic (frontmatter parsing, wiki-link resolution, backlinks, graph layout) lives in `src/domain/notebook.ts` and is unit-tested. Notes are stored as raw Obsidian-format markdown in `src/app/notebook/_data/notebook.ts`. Thin server-component views under `src/app/notebook/` render them with `react-markdown`, with `[[wiki-links]]` resolved (by our domain logic) to other notes, live CRM records, or personas. The tab is preview-only (`OperatorBar` + `ActionFeedback`), like every other page.

**Tech Stack:** Next.js 16, React 19, TypeScript, vitest, react-markdown + remark-gfm. Package manager: pnpm.

---

## Design decisions locked in

- **Tab label** is "Vault"; **route/folder** stays `/notebook` (display name vs. URL slug — confirmed acceptable with the user).
- **Wiki-link resolution is our own deterministic domain code**, not a third-party remark plugin. `react-markdown` (+ `remark-gfm` for tables) handles general markdown fidelity; a pure domain function pre-substitutes `[[target|alias]]` into standard markdown links pointing at resolved hrefs (or an `unresolved:` sentinel). This keeps resolution unit-testable and avoids a fragile remark dependency, while preserving the spec's react-markdown fidelity goal.
- **Notes are raw markdown** (YAML frontmatter + `[[links]]` + `#tags`) so Arc's future real-vault import is a drop-in.

## File structure

- Create: `src/domain/notebook.ts` — pure logic: types, `parseFrontmatter`, `resolveWikiTarget`, `extractLinks`, `computeBacklinks`, `toRenderableMarkdown`, `computeGraphLayout`.
- Create: `src/domain/__tests__/notebook.test.ts` — unit tests for all of the above.
- Modify: `src/domain/index.ts` — barrel-export `./notebook`.
- Create: `src/app/notebook/_data/notebook.ts` — seeded notes + collections + `buildLinkContext()` (wires CRM record ids + persona keys).
- Create: `src/app/notebook/_components/note-body.tsx` — react-markdown renderer with custom anchor handling.
- Create: `src/app/notebook/_components/note-card.tsx` — note tile for the home grid.
- Create: `src/app/notebook/_components/backlinks-panel.tsx` — "Linked references".
- Create: `src/app/notebook/_components/note-graph.tsx` — server-rendered SVG link graph.
- Create: `src/app/notebook/page.tsx` — vault home (static).
- Create: `src/app/notebook/[noteSlug]/page.tsx` — single note (dynamic).
- Modify: `src/app/_components/console-frame.tsx` — add the Vault nav entry.
- Create: `public/brand/nav-icons/vault-icon.png` — nav icon (placeholder copied from an existing icon).

---

## Task 1: Add markdown dependencies

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Read the Next.js bundled docs note**

Per `AGENTS.md`, before adding rendering libraries, skim any relevant guide under `node_modules/next/dist/docs/` for RSC/third-party-package guidance. Confirm there is no Next 16-specific reason a pure-render library like react-markdown cannot run in a server component.

- [ ] **Step 2: Install react-markdown and remark-gfm**

Run:
```bash
pnpm add react-markdown@^9 remark-gfm@^4
```
Expected: both added under `dependencies` in `package.json`, lockfile updated.

- [ ] **Step 3: Verify the project still builds**

Run:
```bash
pnpm build
```
Expected: build succeeds (no missing-module or peer-dependency errors).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add react-markdown and remark-gfm for vault notes"
```

---

## Task 2: Domain types and frontmatter parsing

**Files:**
- Create: `src/domain/notebook.ts`
- Test: `src/domain/__tests__/notebook.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/notebook.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "../notebook";

describe("parseFrontmatter", () => {
  it("splits YAML frontmatter from the body and parses scalars and lists", () => {
    const raw = [
      "---",
      "title: Apex Plumbing Intel",
      "author: Arc",
      "status: Needs review",
      "tags: [partner, plumbing]",
      "---",
      "",
      "# Apex Plumbing Intel",
      "Body text here.",
    ].join("\n");

    const result = parseFrontmatter(raw);

    expect(result.frontmatter).toEqual({
      title: "Apex Plumbing Intel",
      author: "Arc",
      status: "Needs review",
      tags: ["partner", "plumbing"],
    });
    expect(result.body.trim().startsWith("# Apex Plumbing Intel")).toBe(true);
  });

  it("returns an empty frontmatter object when no frontmatter block is present", () => {
    const result = parseFrontmatter("# Just a heading\nNo frontmatter.");
    expect(result.frontmatter).toEqual({});
    expect(result.body.trim().startsWith("# Just a heading")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm test src/domain/__tests__/notebook.test.ts
```
Expected: FAIL — cannot find module `../notebook` / `parseFrontmatter is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/notebook.ts`:
```ts
export type NoteStatus = "Published" | "Draft" | "Needs review";

export type VaultNote = {
  slug: string;
  title: string;
  folder: string;
  tags: string[];
  author: string; // "Arc" or an operator name
  status: NoteStatus;
  updated: string;
  body: string; // raw markdown body (no frontmatter)
};

export type ParsedFrontmatter = {
  frontmatter: Record<string, string | string[]>;
  body: string;
};

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const frontmatter: Record<string, string | string[]> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1).trim();
    if (!key) continue;

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      frontmatter[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    } else {
      frontmatter[key] = rawValue;
    }
  }

  return { frontmatter, body: raw.slice(match[0].length) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm test src/domain/__tests__/notebook.test.ts
```
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add src/domain/notebook.ts src/domain/__tests__/notebook.test.ts
git commit -m "feat: add vault note types and frontmatter parsing"
```

---

## Task 3: Wiki-link resolution

**Files:**
- Modify: `src/domain/notebook.ts`
- Test: `src/domain/__tests__/notebook.test.ts`

- [ ] **Step 1: Write the failing test (append to the existing file)**

Append to `src/domain/__tests__/notebook.test.ts`:
```ts
import { extractLinks, resolveWikiTarget, type LinkResolutionContext } from "../notebook";

function context(): LinkResolutionContext {
  return {
    notes: new Map([["apex-plumbing-co-intel", "/notebook/apex-plumbing-co-intel"]]),
    records: new Map([["apex-plumbing-co", "/crm/companies/apex-plumbing-co"]]),
    personas: new Map([["persona_insurance_agent", "/persona-intelligence"]]),
  };
}

describe("resolveWikiTarget", () => {
  it("resolves a note slug", () => {
    expect(resolveWikiTarget("apex-plumbing-co-intel", "Apex", context())).toEqual({
      kind: "note",
      target: "apex-plumbing-co-intel",
      label: "Apex",
      href: "/notebook/apex-plumbing-co-intel",
    });
  });

  it("resolves a CRM record id", () => {
    expect(resolveWikiTarget("apex-plumbing-co", "apex-plumbing-co", context()).kind).toBe("record");
  });

  it("resolves a persona key", () => {
    expect(resolveWikiTarget("persona_insurance_agent", "persona_insurance_agent", context()).kind).toBe("persona");
  });

  it("marks unknown targets as unresolved with a sentinel href", () => {
    const link = resolveWikiTarget("nonexistent", "nonexistent", context());
    expect(link.kind).toBe("unresolved");
    expect(link.href).toBe("unresolved:nonexistent");
  });
});

describe("extractLinks", () => {
  it("extracts plain and aliased wiki-links and resolves each", () => {
    const body = "See [[apex-plumbing-co-intel|the intel]] and [[apex-plumbing-co]] plus [[nonexistent]].";
    const links = extractLinks(body, context());
    expect(links.map((l) => [l.kind, l.label])).toEqual([
      ["note", "the intel"],
      ["record", "apex-plumbing-co"],
      ["unresolved", "nonexistent"],
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm test src/domain/__tests__/notebook.test.ts
```
Expected: FAIL — `resolveWikiTarget` / `extractLinks` not exported.

- [ ] **Step 3: Write minimal implementation (append to `src/domain/notebook.ts`)**

```ts
export type LinkKind = "note" | "record" | "persona" | "unresolved";

export type ResolvedLink = {
  kind: LinkKind;
  target: string;
  label: string;
  href: string;
};

export type LinkResolutionContext = {
  notes: Map<string, string>; // slug -> /notebook/<slug>
  records: Map<string, string>; // record id -> /crm/<object>/<id>
  personas: Map<string, string>; // persona key -> href
};

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

export function resolveWikiTarget(
  target: string,
  label: string,
  ctx: LinkResolutionContext,
): ResolvedLink {
  const note = ctx.notes.get(target);
  if (note) return { kind: "note", target, label, href: note };

  const record = ctx.records.get(target);
  if (record) return { kind: "record", target, label, href: record };

  const persona = ctx.personas.get(target);
  if (persona) return { kind: "persona", target, label, href: persona };

  return { kind: "unresolved", target, label, href: `unresolved:${target}` };
}

export function extractLinks(body: string, ctx: LinkResolutionContext): ResolvedLink[] {
  const links: ResolvedLink[] = [];
  for (const match of body.matchAll(WIKI_LINK_RE)) {
    const inner = match[1];
    const pipe = inner.indexOf("|");
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const label = (pipe === -1 ? inner : inner.slice(pipe + 1)).trim();
    links.push(resolveWikiTarget(target, label, ctx));
  }
  return links;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm test src/domain/__tests__/notebook.test.ts
```
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/domain/notebook.ts src/domain/__tests__/notebook.test.ts
git commit -m "feat: resolve vault wiki-links to notes, records, and personas"
```

---

## Task 4: Backlinks and renderable markdown

**Files:**
- Modify: `src/domain/notebook.ts`
- Test: `src/domain/__tests__/notebook.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { computeBacklinks, toRenderableMarkdown, type VaultNote } from "../notebook";

const NOTES: VaultNote[] = [
  { slug: "a", title: "A", folder: "Playbooks", tags: [], author: "Evan", status: "Published", updated: "Today", body: "Links to [[b]]." },
  { slug: "b", title: "B", folder: "Playbooks", tags: [], author: "Arc", status: "Published", updated: "Today", body: "No links." },
  { slug: "c", title: "C", folder: "SOPs", tags: [], author: "Evan", status: "Published", updated: "Today", body: "Also links to [[b|Bee]]." },
];

describe("computeBacklinks", () => {
  it("returns every note linking to the slug, sorted by title", () => {
    expect(computeBacklinks(NOTES, "b").map((n) => n.slug)).toEqual(["a", "c"]);
  });

  it("returns an empty array when nothing links to the slug", () => {
    expect(computeBacklinks(NOTES, "a")).toEqual([]);
  });
});

describe("toRenderableMarkdown", () => {
  it("rewrites wiki-links to markdown links with resolved hrefs", () => {
    const ctx = { notes: new Map([["b", "/notebook/b"]]), records: new Map(), personas: new Map() };
    expect(toRenderableMarkdown("Go to [[b|Bee]] now.", ctx)).toBe("Go to [Bee](/notebook/b) now.");
  });

  it("rewrites unresolved wiki-links with the sentinel href", () => {
    const ctx = { notes: new Map(), records: new Map(), personas: new Map() };
    expect(toRenderableMarkdown("Missing [[ghost]].", ctx)).toBe("Missing [ghost](unresolved:ghost).");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm test src/domain/__tests__/notebook.test.ts
```
Expected: FAIL — `computeBacklinks` / `toRenderableMarkdown` not exported.

- [ ] **Step 3: Write minimal implementation (append to `src/domain/notebook.ts`)**

```ts
export function computeBacklinks(allNotes: VaultNote[], slug: string): VaultNote[] {
  return allNotes
    .filter((note) => note.slug !== slug)
    .filter((note) =>
      [...note.body.matchAll(WIKI_LINK_RE)].some((match) => {
        const inner = match[1];
        const pipe = inner.indexOf("|");
        const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
        return target === slug;
      }),
    )
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function toRenderableMarkdown(body: string, ctx: LinkResolutionContext): string {
  return body.replace(WIKI_LINK_RE, (_full, inner: string) => {
    const pipe = inner.indexOf("|");
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const label = (pipe === -1 ? inner : inner.slice(pipe + 1)).trim();
    const link = resolveWikiTarget(target, label, ctx);
    return `[${link.label}](${link.href})`;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm test src/domain/__tests__/notebook.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/notebook.ts src/domain/__tests__/notebook.test.ts
git commit -m "feat: compute vault backlinks and renderable markdown"
```

---

## Task 5: Deterministic graph layout

**Files:**
- Modify: `src/domain/notebook.ts`
- Test: `src/domain/__tests__/notebook.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { computeGraphLayout, type GraphNode } from "../notebook";

describe("computeGraphLayout", () => {
  it("places the focus node at the center and others on a deterministic ring", () => {
    const nodes: GraphNode[] = [
      { id: "focus", label: "Focus", kind: "note" },
      { id: "n1", label: "One", kind: "note" },
      { id: "n2", label: "Two", kind: "record" },
    ];
    const layout = computeGraphLayout(nodes, "focus", 100, 100);

    const focus = layout.find((n) => n.id === "focus")!;
    expect([focus.x, focus.y]).toEqual([50, 50]);
    // ring nodes are evenly spaced and equidistant from center
    const others = layout.filter((n) => n.id !== "focus");
    const radii = others.map((n) => Math.round(Math.hypot(n.x - 50, n.y - 50)));
    expect(new Set(radii).size).toBe(1);
  });

  it("is deterministic across calls", () => {
    const nodes: GraphNode[] = [
      { id: "a", label: "A", kind: "note" },
      { id: "b", label: "B", kind: "note" },
    ];
    expect(computeGraphLayout(nodes, "a", 200, 200)).toEqual(computeGraphLayout(nodes, "a", 200, 200));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm test src/domain/__tests__/notebook.test.ts
```
Expected: FAIL — `computeGraphLayout` / `GraphNode` not exported.

- [ ] **Step 3: Write minimal implementation (append to `src/domain/notebook.ts`)**

```ts
export type GraphNode = {
  id: string;
  label: string;
  kind: LinkKind;
};

export type PlacedNode = GraphNode & { x: number; y: number };

export type GraphEdge = { from: string; to: string };

// Deterministic radial layout: focus node centered, the rest evenly spaced
// on a ring. No randomness, no physics — safe for server rendering.
export function computeGraphLayout(
  nodes: GraphNode[],
  focusId: string,
  width: number,
  height: number,
): PlacedNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.38;
  const ring = nodes.filter((n) => n.id !== focusId);

  return nodes.map((node) => {
    if (node.id === focusId) {
      return { ...node, x: cx, y: cy };
    }
    const index = ring.findIndex((n) => n.id === node.id);
    const angle = (index / Math.max(ring.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm test src/domain/__tests__/notebook.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/notebook.ts src/domain/__tests__/notebook.test.ts
git commit -m "feat: add deterministic vault graph layout"
```

---

## Task 6: Barrel export the notebook domain

**Files:**
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Add the export**

Edit `src/domain/index.ts`, appending after the existing exports:
```ts
export * from "./notebook";
```

- [ ] **Step 2: Verify types compile and tests still pass**

Run:
```bash
pnpm test src/domain/__tests__/notebook.test.ts
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/domain/index.ts
git commit -m "feat: export notebook domain from barrel"
```

---

## Task 7: Seed notes and link context

**Files:**
- Create: `src/app/notebook/_data/notebook.ts`

- [ ] **Step 1: Create the seed data and context builder**

Create `src/app/notebook/_data/notebook.ts`:
```ts
import { OFFICIAL_PERSONA_MAPPINGS, type LinkResolutionContext, type VaultNote } from "@/domain";

import { crmObjects } from "@/app/_data/growth-engine";

export const vaultCollections = [
  { folder: "Playbooks", description: "Repeatable plays for converting and growing accounts." },
  { folder: "Partner Intel", description: "What we know about referral partners and trade allies." },
  { folder: "Persona Docs", description: "How each restoration persona thinks, decides, and converts." },
  { folder: "SOPs", description: "Operating procedures and guardrails the team follows." },
  { folder: "Field Notes", description: "Dated observations from jobs, calls, and the field." },
];

// Hand-written examples in the SAME raw format real Obsidian files use, so
// Arc's eventual vault import is a drop-in. Bodies use [[wiki-links]] that
// resolve to other notes, CRM records, and personas.
export const vaultNotes: VaultNote[] = [
  {
    slug: "emergency-homeowner-playbook",
    title: "Emergency Homeowner Playbook",
    folder: "Playbooks",
    tags: ["homeowner", "urgent"],
    author: "Evan",
    status: "Published",
    updated: "Today",
    body: [
      "# Emergency Homeowner Playbook",
      "",
      "When an [[persona_homeowner_emergency|emergency homeowner]] reports active water, call within 15 minutes.",
      "",
      "- Reassure first, document second.",
      "- Request photos before the truck rolls.",
      "- See live example: [[basement-flooding]].",
      "",
      "Related: [[insurance-agent-handoff]].",
    ].join("\n"),
  },
  {
    slug: "insurance-agent-handoff",
    title: "Insurance Agent Handoff",
    folder: "Playbooks",
    tags: ["partner", "coverage-neutral"],
    author: "Arc",
    status: "Needs review",
    updated: "Today",
    body: [
      "# Insurance Agent Handoff",
      "",
      "Give the [[persona_insurance_agent|insurance agent]] a coverage-neutral path to refer a client.",
      "",
      "Never promise coverage. Lead with documentation.",
      "",
      "Partner record: [[north-branch-insurance]].",
    ].join("\n"),
  },
  {
    slug: "apex-plumbing-co-intel",
    title: "Apex Plumbing Co. — Partner Intel",
    folder: "Partner Intel",
    tags: ["partner", "plumbing"],
    author: "Arc",
    status: "Draft",
    updated: "Yesterday",
    body: [
      "# Apex Plumbing Co. — Partner Intel",
      "",
      "[[apex-plumbing-co]] stops the source and hands off property damage.",
      "",
      "Best channel: email then phone. Tie referrals to the [[emergency-homeowner-playbook]].",
      "",
      "TODO: confirm the owner's after-hours contact (link target [[apex-after-hours]] not imported yet).",
    ].join("\n"),
  },
  {
    slug: "coverage-neutral-language-sop",
    title: "Coverage-Neutral Language SOP",
    folder: "SOPs",
    tags: ["compliance"],
    author: "Evan",
    status: "Published",
    updated: "2 days ago",
    body: [
      "# Coverage-Neutral Language SOP",
      "",
      "Applies to every message aimed at the [[persona_insurance_agent|insurance agent]] persona.",
      "",
      "- No coverage promises.",
      "- No claim-approval language.",
      "- Used by [[insurance-agent-handoff]].",
    ].join("\n"),
  },
];

// Build the resolution context from live app data so wiki-links can point at
// real CRM records and personas, not just other notes.
export function buildLinkContext(notes: VaultNote[] = vaultNotes): LinkResolutionContext {
  const noteMap = new Map(notes.map((n) => [n.slug, `/notebook/${n.slug}`]));

  const recordMap = new Map<string, string>();
  for (const object of crmObjects) {
    for (const row of object.sampleRows) {
      recordMap.set(row.id, `${object.href}/${row.id}`);
    }
  }

  const personaMap = new Map<string, string>(
    OFFICIAL_PERSONA_MAPPINGS.map((persona) => [persona, "/persona-intelligence"]),
  );

  return { notes: noteMap, records: recordMap, personas: personaMap };
}

export function getNoteBySlug(slug: string): VaultNote | undefined {
  return vaultNotes.find((note) => note.slug === slug);
}
```

- [ ] **Step 2: Verify it type-checks via build of the domain consumers**

Run:
```bash
pnpm lint
```
Expected: no errors in `src/app/notebook/_data/notebook.ts` (unused-var / type errors would surface here).

- [ ] **Step 3: Commit**

```bash
git add src/app/notebook/_data/notebook.ts
git commit -m "feat: seed vault notes and link resolution context"
```

---

## Task 8: Note body renderer

**Files:**
- Create: `src/app/notebook/_components/note-body.tsx`

- [ ] **Step 1: Implement the renderer**

Create `src/app/notebook/_components/note-body.tsx`:
```tsx
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { toRenderableMarkdown, type LinkResolutionContext } from "@/domain";

export function NoteBody({ body, ctx }: { body: string; ctx: LinkResolutionContext }) {
  const markdown = toRenderableMarkdown(body, ctx);

  return (
    <div className="prose-vault max-w-none text-sm leading-7 text-[var(--text-secondary)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            const target = href ?? "";
            if (target.startsWith("unresolved:")) {
              return (
                <span
                  className="cursor-default text-[var(--text-muted)] underline decoration-dotted underline-offset-2"
                  title="Not imported yet"
                >
                  {children}
                </span>
              );
            }
            if (target.startsWith("/")) {
              return (
                <Link className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline" href={target}>
                  {children}
                </Link>
              );
            }
            return (
              <a className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline" href={target} rel="noreferrer" target="_blank">
                {children}
              </a>
            );
          },
          h1: ({ children }) => <h1 className="mt-0 mb-3 font-display text-2xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-6 mb-2 font-display text-lg font-semibold text-[var(--text-primary)]">{children}</h2>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
          p: ({ children }) => <p className="my-3">{children}</p>,
          code: ({ children }) => <code className="rounded bg-[var(--surface-inset)] px-1.5 py-0.5 text-[0.85em] text-[var(--text-primary)]">{children}</code>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds (catches any RSC incompatibility with react-markdown)**

Run:
```bash
pnpm build
```
Expected: build succeeds. If the build reports that react-markdown requires a client boundary, add `"use client";` as the first line of `note-body.tsx` and rebuild. (next/link works inside a client component.)

- [ ] **Step 3: Commit**

```bash
git add src/app/notebook/_components/note-body.tsx
git commit -m "feat: render vault note markdown with resolved wiki-links"
```

---

## Task 9: Note card and backlinks panel

**Files:**
- Create: `src/app/notebook/_components/note-card.tsx`
- Create: `src/app/notebook/_components/backlinks-panel.tsx`

- [ ] **Step 1: Create the note card**

Create `src/app/notebook/_components/note-card.tsx`:
```tsx
import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import type { VaultNote } from "@/domain";

function statusTone(status: VaultNote["status"]): "green" | "amber" | "gray" {
  if (status === "Published") return "green";
  if (status === "Needs review") return "amber";
  return "gray";
}

export function NoteCard({ note }: { note: VaultNote }) {
  return (
    <Link
      className="block rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 transition hover:border-[var(--border-strong)]"
      href={`/notebook/${note.slug}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{note.title}</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">{note.folder} · {note.updated}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusPill tone={statusTone(note.status)}>{note.status}</StatusPill>
          {note.author === "Arc" ? <StatusPill tone="blue">Arc</StatusPill> : null}
        </div>
      </div>
      {note.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {note.tags.map((tag) => (
            <span className="rounded-full border border-[var(--border-hairline)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
```

- [ ] **Step 2: Create the backlinks panel**

Create `src/app/notebook/_components/backlinks-panel.tsx`:
```tsx
import Link from "next/link";

import { EmptyState } from "@/app/_components/page-header";
import type { VaultNote } from "@/domain";

export function BacklinksPanel({ backlinks }: { backlinks: VaultNote[] }) {
  if (backlinks.length === 0) {
    return <EmptyState title="No linked references" detail="When another note links here, it will show up as a backlink." />;
  }

  return (
    <ul className="space-y-2">
      {backlinks.map((note) => (
        <li key={note.slug}>
          <Link
            className="block rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 transition hover:border-[var(--border-strong)]"
            href={`/notebook/${note.slug}`}
          >
            <div className="text-sm font-semibold text-[var(--text-primary)]">{note.title}</div>
            <div className="mt-0.5 text-xs text-[var(--text-muted)]">{note.folder}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Verify lint passes**

Run:
```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/notebook/_components/note-card.tsx src/app/notebook/_components/backlinks-panel.tsx
git commit -m "feat: add vault note card and backlinks panel"
```

---

## Task 10: Note graph (SVG)

**Files:**
- Create: `src/app/notebook/_components/note-graph.tsx`

- [ ] **Step 1: Implement the SVG graph**

Create `src/app/notebook/_components/note-graph.tsx`:
```tsx
import { computeGraphLayout, type GraphEdge, type GraphNode } from "@/domain";

const KIND_FILL: Record<GraphNode["kind"], string> = {
  note: "var(--accent)",
  record: "oklch(0.78 0.14 158)",
  persona: "oklch(0.82 0.13 85)",
  unresolved: "var(--text-muted)",
};

export function NoteGraph({
  nodes,
  edges,
  focusId,
  width = 520,
  height = 320,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focusId: string;
  width?: number;
  height?: number;
}) {
  const placed = computeGraphLayout(nodes, focusId, width, height);
  const byId = new Map(placed.map((n) => [n.id, n]));

  return (
    <svg
      aria-label="Note link graph"
      className="h-auto w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)]"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      {edges.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        return (
          <line
            key={`${edge.from}-${edge.to}`}
            stroke="var(--border-strong)"
            strokeWidth={1}
            x1={from.x}
            x2={to.x}
            y1={from.y}
            y2={to.y}
          />
        );
      })}
      {placed.map((node) => {
        const isFocus = node.id === focusId;
        return (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} fill={KIND_FILL[node.kind]} r={isFocus ? 7 : 4.5} />
            <text
              fill="var(--text-secondary)"
              fontSize={11}
              fontWeight={isFocus ? 700 : 500}
              textAnchor="middle"
              x={node.x}
              y={node.y - 10}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Verify lint passes**

Run:
```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/notebook/_components/note-graph.tsx
git commit -m "feat: add server-rendered vault note graph"
```

---

## Task 11: Vault home page

**Files:**
- Create: `src/app/notebook/page.tsx`

- [ ] **Step 1: Implement the home page**

Create `src/app/notebook/page.tsx`:
```tsx
import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { buttonClasses } from "../_components/page-header";
import { ActionFeedback, OperatorBar, PageHeader, Panel, StatusPill } from "../_components/page-header";
import { NoteCard } from "./_components/note-card";
import { NoteGraph } from "./_components/note-graph";
import { buildLinkContext, vaultCollections, vaultNotes } from "./_data/notebook";
import { extractLinks, type GraphEdge, type GraphNode } from "@/domain";

type VaultHomeProps = {
  searchParams?: Promise<{ action?: string | string[] }>;
};

const actionMessages: Record<string, string> = {
  sync: "Preview: Arc would read the markdown files from your Obsidian vault and queue each as a Needs-review note. No files were read.",
  new: "Preview: a blank note would open for editing. Saving is not wired yet.",
};

export default async function VaultHome({ searchParams }: VaultHomeProps) {
  await connection();
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);

  const ctx = buildLinkContext();
  const allLinks = vaultNotes.flatMap((note) => extractLinks(note.body, ctx));
  const resolved = allLinks.filter((l) => l.kind !== "unresolved").length;
  const unresolved = allLinks.length - resolved;
  const markDrafts = vaultNotes.filter((n) => n.author === "Arc" && n.status === "Needs review").length;

  // Whole-vault graph: one node per note, edges for note-to-note links.
  const slugs = new Set(vaultNotes.map((n) => n.slug));
  const graphNodes: GraphNode[] = vaultNotes.map((n) => ({ id: n.slug, label: n.title, kind: "note" }));
  const graphEdges: GraphEdge[] = vaultNotes.flatMap((note) =>
    extractLinks(note.body, ctx)
      .filter((l) => l.kind === "note" && slugs.has(l.target))
      .map((l) => ({ from: note.slug, to: l.target })),
  );

  const stats = [
    { label: "Notes", value: String(vaultNotes.length) },
    { label: "Collections", value: String(vaultCollections.length) },
    { label: "Links resolved", value: String(resolved) },
    { label: "Unresolved", value: String(unresolved) },
    { label: "Arc drafts", value: String(markDrafts) },
  ];

  return (
    <AppShell active="/notebook">
      <PageHeader
        eyebrow="Vault"
        title="The shared brain for Arc and the team"
        description="Linked notes, playbooks, and partner intel. Wiki-links connect notes to live CRM records and personas. Arc drafts land in review before they publish."
        aside={<StatusPill tone="gray">Preview</StatusPill>}
      />

      <OperatorBar
        task="Keep the vault in sync"
        detail="Import notes from your Obsidian vault, or start a new one. These are previews — no files are read and nothing is saved yet."
        status="Preview"
        primary={<Link className={buttonClasses({ variant: "primary" })} href="?action=sync">Sync vault</Link>}
        secondary={<Link className={buttonClasses({ variant: "ghost" })} href="?action=new">New note</Link>}
      />
      <ActionFeedback action={action} messages={actionMessages} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3" key={stat.label}>
            <div className="text-xs text-[var(--text-muted)]">{stat.label}</div>
            <div className="mt-1 font-display text-3xl font-black tabular-nums tracking-[-0.04em]">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {vaultCollections
            .filter((collection) => vaultNotes.some((n) => n.folder === collection.folder))
            .map((collection) => (
              <Panel key={collection.folder}>
                <div className="signal-eyebrow">{collection.folder}</div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{collection.description}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {vaultNotes.filter((n) => n.folder === collection.folder).map((note) => (
                    <NoteCard key={note.slug} note={note} />
                  ))}
                </div>
              </Panel>
            ))}
        </div>

        <Panel>
          <div className="signal-eyebrow">Graph</div>
          <p className="mt-1 mb-3 text-sm text-[var(--text-secondary)]">How the notes connect.</p>
          <NoteGraph edges={graphEdges} focusId={vaultNotes[0]?.slug ?? ""} nodes={graphNodes} />
        </Panel>
      </div>
    </AppShell>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
```

- [ ] **Step 2: Verify it builds**

Run:
```bash
pnpm build
```
Expected: build succeeds; `/notebook` appears in the route output.

- [ ] **Step 3: Commit**

```bash
git add src/app/notebook/page.tsx
git commit -m "feat: add vault home page"
```

---

## Task 12: Note detail page

**Files:**
- Create: `src/app/notebook/[noteSlug]/page.tsx`

- [ ] **Step 1: Implement the detail page**

Create `src/app/notebook/[noteSlug]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "../../_components/app-shell";
import { buttonClasses } from "../../_components/page-header";
import { ActionFeedback, EmptyState, OperatorBar, PageHeader, Panel, StatusPill } from "../../_components/page-header";
import { BacklinksPanel } from "../_components/backlinks-panel";
import { NoteBody } from "../_components/note-body";
import { NoteGraph } from "../_components/note-graph";
import { buildLinkContext, getNoteBySlug, vaultNotes } from "../_data/notebook";
import { computeBacklinks, extractLinks, type GraphEdge, type GraphNode } from "@/domain";

type NotePageProps = {
  params: Promise<{ noteSlug: string }>;
  searchParams?: Promise<{ action?: string | string[] }>;
};

export function generateStaticParams() {
  return vaultNotes.map((note) => ({ noteSlug: note.slug }));
}

const actionMessages: Record<string, string> = {
  edit: "Preview: the note would open in an editor. Saving is not wired yet.",
  publish: "Preview: publishing would move this note to Published after review. No state changed.",
  expand: "Preview: Arc would draft an expanded version and queue it for review.",
  archive: "Preview: the note would be archived out of the active vault.",
};

export default async function NotePage({ params, searchParams }: NotePageProps) {
  const { noteSlug } = await params;
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);

  const note = getNoteBySlug(noteSlug);
  if (!note) notFound();

  const ctx = buildLinkContext();
  const outgoing = extractLinks(note.body, ctx);
  const backlinks = computeBacklinks(vaultNotes, note.slug);
  const needsReview = note.author === "Arc" && note.status === "Needs review";

  // Local neighborhood graph: this note + its outgoing link targets.
  const nodes: GraphNode[] = [
    { id: note.slug, label: note.title, kind: "note" },
    ...outgoing.map((l) => ({ id: l.target, label: l.label, kind: l.kind })),
  ];
  const edges: GraphEdge[] = outgoing.map((l) => ({ from: note.slug, to: l.target }));

  const grouped = {
    note: outgoing.filter((l) => l.kind === "note"),
    record: outgoing.filter((l) => l.kind === "record"),
    persona: outgoing.filter((l) => l.kind === "persona"),
    unresolved: outgoing.filter((l) => l.kind === "unresolved"),
  };

  return (
    <AppShell active="/notebook">
      <PageHeader
        eyebrow={note.folder}
        title={note.title}
        description={`${note.author === "Arc" ? "Drafted by Arc" : `By ${note.author}`} · Updated ${note.updated}`}
        aside={
          <div className="flex flex-col items-end gap-1.5">
            <StatusPill tone={note.status === "Published" ? "green" : note.status === "Needs review" ? "amber" : "gray"}>{note.status}</StatusPill>
            {note.author === "Arc" ? <StatusPill tone="blue">Arc</StatusPill> : null}
          </div>
        }
      />

      <div className="mb-4">
        <Link className="text-sm font-semibold text-[var(--accent)]" href="/notebook">← All notes</Link>
      </div>

      {needsReview ? (
        <div className="mb-4 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Arc drafted this note. </span>
          It needs human review before it publishes.{" "}
          <Link className="font-semibold underline underline-offset-2" href={`/approvals?item=${note.slug}`}>Open review</Link>.
        </div>
      ) : null}

      <OperatorBar
        task="Work this note"
        detail="Edit, publish, ask Arc to expand it, or archive. These are previews — nothing is saved."
        status="Preview"
        primary={<Link className={buttonClasses({ variant: "primary" })} href="?action=publish">Publish</Link>}
        secondary={
          <>
            <Link className={buttonClasses({ variant: "ghost" })} href="?action=edit">Edit</Link>
            <Link className={buttonClasses({ variant: "ghost" })} href="?action=expand">Ask Arc to expand</Link>
          </>
        }
      />
      <ActionFeedback action={action} messages={actionMessages} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <NoteBody body={note.body} ctx={ctx} />
        </Panel>

        <div className="space-y-4">
          <Panel>
            <div className="signal-eyebrow">Linked references</div>
            <div className="mt-3">
              <BacklinksPanel backlinks={backlinks} />
            </div>
          </Panel>

          <Panel>
            <div className="signal-eyebrow">Links in this note</div>
            <div className="mt-3 space-y-3 text-sm">
              {(["record", "persona", "note", "unresolved"] as const).map((kind) =>
                grouped[kind].length > 0 ? (
                  <div key={kind}>
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{kindLabel(kind)}</div>
                    <ul className="mt-1.5 space-y-1">
                      {grouped[kind].map((link, i) => (
                        <li key={`${link.target}-${i}`}>
                          {link.kind === "unresolved" ? (
                            <span className="text-[var(--text-muted)]" title="Not imported yet">{link.label}</span>
                          ) : (
                            <Link className="font-semibold text-[var(--accent)] hover:underline" href={link.href}>{link.label}</Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
              {outgoing.length === 0 ? <EmptyState title="No outgoing links" detail="This note does not link to anything yet." /> : null}
            </div>
          </Panel>

          <Panel>
            <div className="signal-eyebrow">Local graph</div>
            <div className="mt-3">
              <NoteGraph edges={edges} focusId={note.slug} height={260} nodes={nodes} width={320} />
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function kindLabel(kind: "note" | "record" | "persona" | "unresolved") {
  if (kind === "record") return "CRM records";
  if (kind === "persona") return "Personas";
  if (kind === "note") return "Notes";
  return "Unresolved";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
```

- [ ] **Step 2: Verify it builds and prerenders all note params**

Run:
```bash
pnpm build
```
Expected: build succeeds; `/notebook/[noteSlug]` is statically generated for every seeded slug.

- [ ] **Step 3: Commit**

```bash
git add "src/app/notebook/[noteSlug]/page.tsx"
git commit -m "feat: add vault note detail page with backlinks and graph"
```

---

## Task 13: Add the Vault nav tab

**Files:**
- Modify: `src/app/_components/console-frame.tsx`
- Create: `public/brand/nav-icons/vault-icon.png`

- [ ] **Step 1: Add a nav icon asset (placeholder copied from an existing icon)**

Run:
```bash
cp public/brand/nav-icons/settings-icon.png public/brand/nav-icons/vault-icon.png
```
Expected: `vault-icon.png` now exists so the nav `Image` resolves. (Replace with a bespoke icon later; the recent "Add simple tab icon" commit shows where brand icons live.)

- [ ] **Step 2: Add the nav entry**

In `src/app/_components/console-frame.tsx`, add a Vault entry to the `navItems` array, between the Arc and Settings entries:
```tsx
  { label: "Vault", href: "/notebook", iconSrc: "/brand/nav-icons/vault-icon.png", matches: ["/notebook"] },
```

- [ ] **Step 3: Verify the build and that the route renders**

Run:
```bash
pnpm build
```
Expected: build succeeds. Then run `pnpm dev`, open `/notebook`, confirm the Vault tab is highlighted and notes render with working links/backlinks/graph.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/console-frame.tsx public/brand/nav-icons/vault-icon.png
git commit -m "feat: add Vault tab to the sidebar nav"
```

---

## Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run:
```bash
pnpm test
```
Expected: all tests pass, including the new `notebook.test.ts`.

- [ ] **Step 2: Lint the whole project**

Run:
```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 3: Production build**

Run:
```bash
pnpm build
```
Expected: build succeeds with `/notebook` and `/notebook/[noteSlug]` in the route manifest.

- [ ] **Step 4: Manual smoke check**

Run `pnpm dev` and verify:
- The Vault tab appears in the sidebar and highlights on `/notebook`.
- Collections list seeded notes; Arc-authored notes show the "Arc" pill.
- Opening a note renders markdown; `[[links]]` resolve to notes/records/personas; unresolved links (e.g. `apex-after-hours`) render muted.
- The backlinks panel shows reverse links; the graph renders.
- `?action=sync` on the home page and `?action=publish` on a note show the preview banner; no data is written.

---

## Self-review notes

- **Spec coverage:** new tab + nav (Task 13), notes-as-raw-Obsidian-markdown + data model (Tasks 2, 7), wiki-link resolution to notes/records/personas/unresolved (Task 3), backlinks (Task 4), markdown rendering via react-markdown (Tasks 1, 8), graph view (Tasks 5, 10), vault home with Sync-vault preview action (Task 11), note detail with Arc approval deep-link (Task 12), tests (Tasks 2–5), DESIGN.md primitives reused throughout. All spec sections map to tasks.
- **Wiki-link plugin deviation:** the spec said "react-markdown + remark wiki-link plugin." Implemented as react-markdown + remark-gfm with our own deterministic pre-substitution (`toRenderableMarkdown`) instead of a third-party remark plugin — keeps resolution unit-testable and dependency-light. Functionally equivalent for the user (react-markdown fidelity + resolved wiki-links). Flagged here for visibility.
- **Type consistency:** `LinkResolutionContext`, `ResolvedLink`, `VaultNote`, `GraphNode`, `GraphEdge`, `computeGraphLayout`, `extractLinks`, `computeBacklinks`, `toRenderableMarkdown` names are used identically across domain, data, and components.

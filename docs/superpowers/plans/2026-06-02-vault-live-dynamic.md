# Vault Live & Dynamic Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Vault tab feel live and color-differentiated — a Mark activity rail, live record/persona signals, live collection counts + freshness, and periodic auto-refresh — all within the DESIGN.md palette.

**Architecture:** One isolated live-signals read-model (`src/lib/vault/live-signals.ts`) with pure, unit-tested shaping helpers and graceful `live | fallback | error` degradation; small presentational components; one `"use client"` auto-refresh component; and redesigned home + note pages that consume them. The pure `src/domain/notebook.ts` and the `agent-operations` read-model are untouched.

**Tech Stack:** Next.js 16, React 19, TypeScript, vitest, Supabase JS. pnpm.

---

## Conventions reused (read these first)
- `src/lib/supabase/server.ts`: `isSupabaseAdminConfigured()`, `getSupabaseAdminClient()`.
- `src/lib/vault/read-model.ts`: the `live | fallback | error` shape + env save/restore test pattern (`read-model.test.ts`).
- `src/lib/agent-operations/read-model.ts`: how Mark's `metadata` fields are read (`last_heartbeat_at` / `runner_last_seen_at`, `kill_switch`) and `titleize`.
- `src/app/_components/page-header.tsx`: `StatusPill` tones are `amber|green|red|gray|blue|dark`. Reuse `Panel`, `PageHeader`, `OperatorBar`, `ActionFeedback`, `StatusPill`, `EmptyState`, `buttonClasses`.
- DESIGN.md: no emojis, no side-stripe accent borders, no equal 3-col rows, no fake round metrics. Color = dots/chips/ticks/icons in sanctioned tones only.

## File structure
- Create: `src/lib/vault/live-signals.ts` — types + pure helpers + `getVaultLiveSignals` + `getRecordSignals`.
- Create: `src/lib/vault/live-signals.test.ts` — pure-helper + fallback tests.
- Modify: `src/app/vault/_data/notebook.ts` — add `StatusTone`, `collectionThemes`, `collectionFreshness` helper.
- Create: `src/app/vault/_data/notebook.test.ts` — theme-coverage guard.
- Create: `src/app/vault/_components/collection-icon.tsx` — inline SVG glyphs.
- Create: `src/app/vault/_components/mark-activity-rail.tsx`.
- Create: `src/app/vault/_components/record-signal-chip.tsx`.
- Create: `src/app/vault/_components/auto-refresh.tsx` — `"use client"`.
- Modify: `src/app/vault/page.tsx` — redesigned home.
- Modify: `src/app/vault/[noteSlug]/page.tsx` — record-signal chips + auto-refresh.

---

## Task 0: Rename the Vault route from /notebook to /vault (precursor)

The sidebar nav already points the Vault tab at `/vault`, but the pages live at
`src/app/notebook` (URL `/notebook`). Rename the route so the tab works. This touches only
the Vault route folder + any stray links to it — not `src/domain/notebook.ts` (pure logic,
unrelated) and not the `notebook.ts` data filename (it keeps its name inside the folder).

**Files:**
- Rename: `src/app/notebook/` → `src/app/vault/` (folder, via `git mv`)
- Modify (route strings only): the moved files + any other file linking to `/notebook`

- [ ] **Step 1: Move the folder**

```bash
git mv src/app/notebook src/app/vault
```

- [ ] **Step 2: Rewrite route-URL strings inside the moved files**

Only URL strings (quote/backtick immediately followed by `/notebook`) change — import paths
like `"./_data/notebook"` are preceded by `_data`, so they are NOT matched. Run:
```bash
python - <<'PY'
import pathlib
root = pathlib.Path("src/app/vault")
for f in root.rglob("*"):
    if f.suffix in {".ts", ".tsx"}:
        s = f.read_text(encoding="utf-8")
        n = s.replace('"/notebook', '"/vault').replace('`/notebook', '`/vault')
        if n != s:
            f.write_text(n, encoding="utf-8", newline="")
            print("updated", f)
PY
```
This fixes: `buildLinkContext` note hrefs, `actions.ts` redirects/`revalidatePath`,
`note-card.tsx` + `backlinks-panel.tsx` hrefs, and the page `active="/notebook"`, back-link,
and edit hrefs.

- [ ] **Step 3: Fix any stray links to /notebook elsewhere**

```bash
grep -rn '"/notebook\|`/notebook' src --include=*.ts --include=*.tsx | grep -v 'src/app/vault'
```
Expected: no results. If any appear, change those `/notebook` URL strings to `/vault` too.
(Do NOT touch `src/domain/notebook.ts` or `_data/notebook` import paths.)

- [ ] **Step 4: Verify**

```bash
pnpm test src/lib/vault/read-model.test.ts
pnpm build
```
Expected: tests pass; build succeeds; routes show `/vault`, `/vault/[noteSlug]`,
`/vault/new`, `/vault/[noteSlug]/edit`; no `/notebook` routes.

- [ ] **Step 5: Commit**

```bash
git add src/app/vault
git commit -m "refactor: rename vault route from /notebook to /vault"
```
Stage only the moved folder (+ any stray-link files) so unrelated in-progress working-tree
changes are not swept in.

---

## Task 1: Live-signals types + pure shaping helpers

**Files:**
- Create: `src/lib/vault/live-signals.ts`
- Test: `src/lib/vault/live-signals.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/vault/live-signals.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { personaSignalLabel, shortTime, toMarkActivity } from "./live-signals";

const NOW = Date.parse("2026-06-02T12:00:00.000Z");

describe("shortTime", () => {
  it("formats relative times from a fixed now", () => {
    expect(shortTime(null, NOW)).toBe("—");
    expect(shortTime("2026-06-02T11:59:30.000Z", NOW)).toBe("just now");
    expect(shortTime("2026-06-02T11:45:00.000Z", NOW)).toBe("15m ago");
    expect(shortTime("2026-06-02T09:00:00.000Z", NOW)).toBe("3h ago");
    expect(shortTime("2026-05-31T12:00:00.000Z", NOW)).toBe("2d ago");
  });
});

describe("personaSignalLabel", () => {
  it("formats lead counts with a new-this-week suffix", () => {
    expect(personaSignalLabel(12, 3)).toBe("12 leads · 3 new");
    expect(personaSignalLabel(1, 0)).toBe("1 lead");
    expect(personaSignalLabel(0, 0)).toBe("0 leads");
  });
});

describe("toMarkActivity", () => {
  it("shapes agent rows, tasks, outputs, and review count into MarkActivity", () => {
    const activity = toMarkActivity(
      { name: "Mark", status: "ready", metadata: { last_heartbeat_at: "2026-06-02T11:50:00.000Z", kill_switch: "Outbound locked" } },
      [{ objective: "Draft partner note", task_type: "note_draft", status: "running", updated_at: "2026-06-02T11:58:00.000Z" }],
      [{ title: "Partner intel draft", approval_status: "pending_approval", created_at: "2026-06-02T11:40:00.000Z" }],
      2,
      NOW,
    );
    expect(activity).toEqual({
      name: "Mark",
      status: "Ready",
      killSwitch: "Outbound locked",
      lastHeartbeat: "10m ago",
      drafting: [{ title: "Draft partner note", taskType: "Note Draft", updated: "2m ago" }],
      awaitingReview: 2,
      recentOutputs: [{ title: "Partner intel draft", status: "Pending Approval", time: "20m ago" }],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/vault/live-signals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/vault/live-signals.ts`:
```ts
export type StatusTone = "amber" | "green" | "red" | "gray" | "blue" | "dark";

export type MarkActivity = {
  name: string;
  status: string;
  killSwitch: string;
  lastHeartbeat: string | null;
  drafting: Array<{ title: string; taskType: string; updated: string }>;
  awaitingReview: number;
  recentOutputs: Array<{ title: string; status: string; time: string }>;
};

function titleize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function shortTime(iso: string | null, now: number): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const diffMs = now - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function personaSignalLabel(total: number, recent: number): string {
  const noun = total === 1 ? "lead" : "leads";
  return recent > 0 ? `${total} ${noun} · ${recent} new` : `${total} ${noun}`;
}

type AgentRowLike = { name?: string | null; status?: string | null; metadata?: unknown } | null;
type TaskRowLike = { objective?: string | null; task_type?: string | null; status?: string | null; updated_at?: string | null };
type OutputRowLike = { title?: string | null; approval_status?: string | null; created_at?: string | null };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function toMarkActivity(
  agent: AgentRowLike,
  tasks: TaskRowLike[],
  outputs: OutputRowLike[],
  awaitingReview: number,
  now: number,
): MarkActivity {
  const metadata = asRecord(agent?.metadata);
  const heartbeatIso =
    (typeof metadata.last_heartbeat_at === "string" && metadata.last_heartbeat_at) ||
    (typeof metadata.runner_last_seen_at === "string" && metadata.runner_last_seen_at) ||
    null;
  const killSwitch = typeof metadata.kill_switch === "string" ? metadata.kill_switch : "Outbound locked";

  return {
    name: agent?.name ?? "Mark",
    status: agent?.status ? titleize(agent.status) : "Offline",
    killSwitch,
    lastHeartbeat: shortTime(heartbeatIso, now),
    drafting: tasks.map((t) => ({
      title: t.objective ?? "Agent task",
      taskType: titleize(t.task_type ?? "task"),
      updated: shortTime(t.updated_at ?? null, now),
    })),
    awaitingReview,
    recentOutputs: outputs.map((o) => ({
      title: o.title ?? "Agent output",
      status: titleize(o.approval_status ?? "draft"),
      time: shortTime(o.created_at ?? null, now),
    })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/vault/live-signals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vault/live-signals.ts src/lib/vault/live-signals.test.ts
git commit -m "feat: add vault live-signals types and pure shaping helpers"
```

---

## Task 2: getVaultLiveSignals (async + fallback)

**Files:**
- Modify: `src/lib/vault/live-signals.ts`
- Test: `src/lib/vault/live-signals.test.ts`

- [ ] **Step 1: Write the failing test (append)**

Append to `src/lib/vault/live-signals.test.ts`:
```ts
import { getVaultLiveSignals } from "./live-signals";

describe("getVaultLiveSignals (no Supabase configured)", () => {
  it("returns fallback with an Offline Mark when env vars are unset", async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const model = await getVaultLiveSignals();
      expect(model.status).toBe("fallback");
      expect(model.activity.name).toBe("Mark");
      expect(model.activity.status).toBe("Offline");
      expect(model.activity.drafting).toEqual([]);
    } finally {
      if (prevUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/vault/live-signals.test.ts`
Expected: FAIL — `getVaultLiveSignals` not exported.

- [ ] **Step 3: Write minimal implementation (append to `src/lib/vault/live-signals.ts`)**

```ts
import { seedVaultNotes } from "./seed-notes";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

const NOT_CONFIGURED = "Supabase is not configured — Mark activity is offline. Showing static counts.";

export type VaultLiveSignals =
  | { status: "live"; activity: MarkActivity; generatedAt: string }
  | { status: "fallback"; activity: MarkActivity; message: string }
  | { status: "error"; activity: MarkActivity; message: string };

function seedReviewCount(): number {
  return seedVaultNotes.filter((n) => n.status === "Needs review").length;
}

function offlineActivity(now: number): MarkActivity {
  return toMarkActivity({ name: "Mark", status: "offline", metadata: {} }, [], [], seedReviewCount(), now);
}

export async function getVaultLiveSignals(): Promise<VaultLiveSignals> {
  const now = Date.now();
  if (!isSupabaseAdminConfigured()) {
    return { status: "fallback", activity: offlineActivity(now), message: NOT_CONFIGURED };
  }
  try {
    const supabase = getSupabaseAdminClient();
    const [agentResult, tasksResult, outputsResult, reviewResult] = await Promise.all([
      supabase.from("agents").select("name,status,metadata").eq("key", "mark").maybeSingle(),
      supabase
        .from("agent_tasks")
        .select("objective,task_type,status,updated_at")
        .in("status", ["queued", "running", "needs_approval"])
        .order("updated_at", { ascending: false })
        .limit(4),
      supabase
        .from("agent_outputs")
        .select("title,approval_status,created_at")
        .order("created_at", { ascending: false })
        .limit(4),
      supabase.from("vault_notes").select("slug", { count: "exact", head: true }).eq("status", "needs_review"),
    ]);

    const reviewCount = reviewResult.count ?? 0;
    const activity = toMarkActivity(
      agentResult.data ?? null,
      tasksResult.data ?? [],
      outputsResult.data ?? [],
      reviewCount,
      now,
    );
    return { status: "live", activity, generatedAt: new Date(now).toISOString() };
  } catch (error) {
    return {
      status: "error",
      activity: offlineActivity(now),
      message: error instanceof Error ? error.message : "Mark activity is unavailable.",
    };
  }
}
```

> Note: `Date.now()` / `new Date()` are fine here — this is server runtime code, not a workflow script. The pure helpers stay deterministic because they take `now` as an argument.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/vault/live-signals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vault/live-signals.ts src/lib/vault/live-signals.test.ts
git commit -m "feat: add getVaultLiveSignals with offline fallback"
```

---

## Task 3: getRecordSignals

**Files:**
- Modify: `src/lib/vault/live-signals.ts`

**Context:** `crmObjects` (in `src/app/_data/growth-engine.ts`) is an array of `{ href, sampleRows: [{ id, name, status, owner }] }`. `personaDisplay` (same file) maps a persona key → `{ label }`. `OFFICIAL_PERSONA_MAPPINGS` (from `@/domain`) lists valid persona keys. The `leads` table has a `persona` column (enum) and `created_at`.

- [ ] **Step 1: Implement (append to `src/lib/vault/live-signals.ts`)**

```ts
import { crmObjects, personaDisplay } from "@/app/_data/growth-engine";
import { OFFICIAL_PERSONA_MAPPINGS } from "@/domain";

export type RecordSignal = {
  target: string;
  label: string;
  stat: string;
  tone: StatusTone;
  live: boolean;
};

type WikiLinkLike = { kind: string; target: string; label: string };

function recordReference(target: string): RecordSignal | null {
  for (const object of crmObjects) {
    const row = object.sampleRows.find((r) => r.id === target);
    if (row) {
      return { target, label: row.name, stat: `${row.status} · ${row.owner}`, tone: "gray", live: false };
    }
  }
  return null;
}

const PERSONA_KEYS = new Set<string>(OFFICIAL_PERSONA_MAPPINGS);

export async function getRecordSignals(links: WikiLinkLike[]): Promise<Map<string, RecordSignal>> {
  const signals = new Map<string, RecordSignal>();

  const personaTargets = [...new Set(links.filter((l) => l.kind === "persona" && PERSONA_KEYS.has(l.target)).map((l) => l.target))];
  const recordTargets = [...new Set(links.filter((l) => l.kind === "record").map((l) => l.target))];

  // Reference-derived record signals (no live persistence for CRM records yet).
  for (const target of recordTargets) {
    const ref = recordReference(target);
    if (ref) signals.set(target, ref);
  }

  // Persona signals: reference label only when Supabase is unconfigured.
  if (!isSupabaseAdminConfigured()) {
    for (const target of personaTargets) {
      const label = personaDisplay[target as keyof typeof personaDisplay]?.label ?? target;
      signals.set(target, { target, label, stat: "reference", tone: "amber", live: false });
    }
    return signals;
  }

  // Live persona lead counts.
  try {
    const supabase = getSupabaseAdminClient();
    const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
    await Promise.all(
      personaTargets.map(async (target) => {
        const label = personaDisplay[target as keyof typeof personaDisplay]?.label ?? target;
        const [totalResult, recentResult] = await Promise.all([
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("persona", target),
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("persona", target).gte("created_at", weekAgoIso),
        ]);
        const total = totalResult.count ?? 0;
        const recent = recentResult.count ?? 0;
        signals.set(target, { target, label, stat: personaSignalLabel(total, recent), tone: "amber", live: true });
      }),
    );
  } catch {
    // Best-effort: on failure, leave persona links without chips rather than erroring the page.
  }

  return signals;
}
```

- [ ] **Step 2: Verify it builds and existing tests pass**

Run: `pnpm test src/lib/vault/live-signals.test.ts && pnpm build`
Expected: tests PASS; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/vault/live-signals.ts
git commit -m "feat: add getRecordSignals for live persona and reference record stats"
```

---

## Task 4: Collection themes + theme guard test

**Files:**
- Modify: `src/app/vault/_data/notebook.ts`
- Test: `src/app/vault/_data/notebook.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/vault/_data/notebook.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { collectionThemes, vaultCollections } from "./notebook";

describe("collectionThemes", () => {
  it("has a theme for every vault collection", () => {
    for (const collection of vaultCollections) {
      expect(collectionThemes[collection.folder]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/vault/_data/notebook.test.ts`
Expected: FAIL — `collectionThemes` not exported.

- [ ] **Step 3: Implement (append to `src/app/vault/_data/notebook.ts`)**

```ts
export type StatusTone = "amber" | "green" | "red" | "gray" | "blue" | "dark";
export type CollectionIcon = "play" | "handshake" | "user" | "shield" | "note";

export const collectionThemes: Record<string, { tone: StatusTone; icon: CollectionIcon }> = {
  Playbooks: { tone: "blue", icon: "play" },
  "Partner Intel": { tone: "green", icon: "handshake" },
  "Persona Docs": { tone: "amber", icon: "user" },
  SOPs: { tone: "red", icon: "shield" },
  "Field Notes": { tone: "gray", icon: "note" },
};

export const DEFAULT_COLLECTION_THEME: { tone: StatusTone; icon: CollectionIcon } = { tone: "gray", icon: "note" };

export function collectionTheme(folder: string) {
  return collectionThemes[folder] ?? DEFAULT_COLLECTION_THEME;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/vault/_data/notebook.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/vault/_data/notebook.ts src/app/vault/_data/notebook.test.ts
git commit -m "feat: add collection themes with tone and icon mapping"
```

---

## Task 5: Collection icon component

**Files:**
- Create: `src/app/vault/_components/collection-icon.tsx`

- [ ] **Step 1: Implement**

Create `src/app/vault/_components/collection-icon.tsx`:
```tsx
import type { CollectionIcon as IconName, StatusTone } from "../_data/notebook";

const TONE_COLOR: Record<StatusTone, string> = {
  blue: "var(--accent)",
  green: "oklch(0.78 0.14 158)",
  amber: "oklch(0.82 0.13 85)",
  red: "var(--priority)",
  gray: "var(--text-muted)",
  dark: "var(--text-primary)",
};

const PATHS: Record<IconName, string> = {
  play: "M8 5v14l11-7z",
  handshake: "M12 11l3-3 4 4-5 5-2-2-2 2-5-5 4-4 3 3z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-7 2-7 5v1h14v-1c0-3-3-5-7-5z",
  shield: "M12 2l8 3v6c0 5-3.5 8-8 11-4.5-3-8-6-8-11V5l8-3z",
  note: "M5 3h11l3 3v15H5V3zm10 1.5V7h2.5L15 4.5z",
};

export function CollectionIcon({ icon, tone, size = 16 }: { icon: IconName; tone: StatusTone; size?: number }) {
  return (
    <svg aria-hidden="true" fill={TONE_COLOR[tone]} height={size} viewBox="0 0 24 24" width={size}>
      <path d={PATHS[icon]} />
    </svg>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/vault/_components/collection-icon.tsx
git commit -m "feat: add collection icon glyphs"
```

---

## Task 6: Mark activity rail

**Files:**
- Create: `src/app/vault/_components/mark-activity-rail.tsx`

- [ ] **Step 1: Implement**

Create `src/app/vault/_components/mark-activity-rail.tsx`:
```tsx
import Link from "next/link";

import { Panel, StatusPill } from "@/app/_components/page-header";
import type { MarkActivity } from "@/lib/vault/live-signals";

export function MarkActivityRail({
  activity,
  isLive,
  reviewHref,
}: {
  activity: MarkActivity;
  isLive: boolean;
  reviewHref: string;
}) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div className="signal-eyebrow">Mark — live</div>
        <StatusPill tone={isLive ? "green" : "gray"}>{isLive ? activity.status : "Offline"}</StatusPill>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <span className={`h-2 w-2 rounded-full ${isLive ? "bg-[oklch(0.78_0.14_158)] status-breathe" : "bg-[var(--text-muted)]"}`} aria-hidden="true" />
        <span>{activity.killSwitch}</span>
        <span className="text-[var(--text-muted)]">· heartbeat {activity.lastHeartbeat}</span>
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Drafting now</div>
        {activity.drafting.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {activity.drafting.map((task, i) => (
              <li className="flex items-start justify-between gap-2 text-sm" key={`${task.title}-${i}`}>
                <span className="min-w-0 truncate text-[var(--text-primary)]">{task.title}</span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">{task.updated}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[var(--text-muted)]">Nothing in progress.</p>
        )}
      </div>

      <Link
        className="mt-4 flex items-center justify-between rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 transition hover:border-[var(--border-strong)]"
        href={reviewHref}
      >
        <span className="text-sm font-semibold text-[var(--text-primary)]">Awaiting review</span>
        <StatusPill tone={activity.awaitingReview > 0 ? "amber" : "gray"}>{activity.awaitingReview}</StatusPill>
      </Link>

      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Recent output</div>
        {activity.recentOutputs.length > 0 ? (
          <ul className="mt-2 divide-y divide-[var(--border-hairline)]">
            {activity.recentOutputs.map((output, i) => (
              <li className="flex items-center justify-between gap-2 py-2 text-sm" key={`${output.title}-${i}`}>
                <span className="min-w-0 truncate text-[var(--text-secondary)]">{output.title}</span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">{output.time}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[var(--text-muted)]">No recent output.</p>
        )}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/vault/_components/mark-activity-rail.tsx
git commit -m "feat: add Mark activity rail component"
```

---

## Task 7: Record signal chip

**Files:**
- Create: `src/app/vault/_components/record-signal-chip.tsx`

- [ ] **Step 1: Implement**

Create `src/app/vault/_components/record-signal-chip.tsx`:
```tsx
import type { RecordSignal } from "@/lib/vault/live-signals";

const TONE_CLASS: Record<RecordSignal["tone"], string> = {
  amber: "text-[oklch(0.9_0.09_85)] border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)]",
  green: "text-[oklch(0.88_0.1_158)] border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.14)]",
  blue: "text-[var(--chicago-blue-soft)] border-[oklch(0.74_0.115_232/0.4)] bg-[var(--accent-soft)]",
  gray: "text-[var(--text-secondary)] border-[var(--border-strong)] bg-[var(--surface-raised)]",
  red: "text-[oklch(0.86_0.09_26)] border-[oklch(0.68_0.2_26/0.45)] bg-[oklch(0.68_0.2_26/0.16)]",
  dark: "text-[var(--text-primary)] border-[var(--border-strong)] bg-[var(--surface-raised)]",
};

export function RecordSignalChip({ signal }: { signal: RecordSignal }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[signal.tone]}`}>
      <span className={`h-1 w-1 rounded-full ${signal.live ? "bg-current status-breathe" : "bg-current opacity-60"}`} aria-hidden="true" />
      {signal.stat}
      <span className="opacity-60">{signal.live ? "live" : "ref"}</span>
    </span>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/vault/_components/record-signal-chip.tsx
git commit -m "feat: add record signal chip component"
```

---

## Task 8: Auto-refresh client component

**Files:**
- Create: `src/app/vault/_components/auto-refresh.tsx`

- [ ] **Step 1: Implement**

Create `src/app/vault/_components/auto-refresh.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return; // pause while the tab is backgrounded
      router.refresh();
      setRefreshedAt(Date.now());
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]" title="This view refreshes automatically">
      <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.14_158)] status-breathe" aria-hidden="true" />
      Live
    </span>
  );
}
```

> `refreshedAt` is reserved for a future "updated Xm ago" readout; keep the `setRefreshedAt` call so the component re-renders on each tick. If `pnpm lint` flags `refreshedAt` as unused, render it: replace `Live` with `{`Live`}` plus a `title` and drop the state — but prefer keeping the state and referencing `refreshedAt` in the `title` attribute: `title={`Refreshed at ${new Date(refreshedAt).toLocaleTimeString()}`}`.

To avoid any unused-variable lint error, use this exact return:
```tsx
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]"
      title={`Auto-refreshes every ${Math.round(intervalMs / 1000)}s · last ${new Date(refreshedAt).toLocaleTimeString()}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.14_158)] status-breathe" aria-hidden="true" />
      Live
    </span>
  );
```

- [ ] **Step 2: Verify build (client boundary compiles)**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/vault/_components/auto-refresh.tsx
git commit -m "feat: add auto-refresh client component"
```

---

## Task 9: Redesign the Vault home

**Files:**
- Modify: `src/app/vault/page.tsx` (full replacement)

- [ ] **Step 1: Replace the file**

Replace `src/app/vault/page.tsx` with:
```tsx
import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { ActionFeedback, buttonClasses, OperatorBar, PageHeader, Panel, StatusPill } from "../_components/page-header";
import { AutoRefresh } from "./_components/auto-refresh";
import { CollectionIcon } from "./_components/collection-icon";
import { MarkActivityRail } from "./_components/mark-activity-rail";
import { NoteCard } from "./_components/note-card";
import { NoteGraph } from "./_components/note-graph";
import { buildLinkContext, collectionTheme, vaultCollections } from "./_data/notebook";
import { getVaultLiveSignals } from "@/lib/vault/live-signals";
import { getVaultNotes } from "@/lib/vault/read-model";
import { extractLinks, type GraphEdge, type GraphNode } from "@/domain";

type VaultHomeProps = {
  searchParams?: Promise<{ action?: string | string[] }>;
};

const actionMessages: Record<string, string> = {
  sync: "Preview: Mark would read the markdown files from your Obsidian vault and queue each as a Needs-review note. No files were read.",
  "not-configured": "Saving needs Supabase env vars. Set them and apply the vault_notes migration to edit notes.",
  saved: "Note saved.",
  published: "Note published.",
  archived: "Note archived.",
  invalid: "That note was missing a title or collection.",
};

export default async function VaultHome({ searchParams }: VaultHomeProps) {
  await connection();
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);

  const [model, signals] = await Promise.all([getVaultNotes(), getVaultLiveSignals()]);
  const notes = model.notes;
  const ctx = buildLinkContext(notes);

  const allLinks = notes.flatMap((note) => extractLinks(note.body, ctx));
  const resolved = allLinks.filter((l) => l.kind !== "unresolved").length;
  const unresolved = allLinks.length - resolved;

  const slugs = new Set(notes.map((n) => n.slug));
  const graphNodes: GraphNode[] = notes.map((n) => ({ id: n.slug, label: n.title, kind: "note" }));
  const graphEdges: GraphEdge[] = notes.flatMap((note) =>
    extractLinks(note.body, ctx)
      .filter((l) => l.kind === "note" && slugs.has(l.target))
      .map((l) => ({ from: note.slug, to: l.target })),
  );

  const firstReview = notes.find((n) => n.status === "Needs review");
  const reviewHref = firstReview ? `/vault/${firstReview.slug}` : "/vault";

  const stats = [
    { label: "Notes", value: String(notes.length), tone: "blue" as const },
    { label: "Collections", value: String(vaultCollections.filter((c) => notes.some((n) => n.folder === c.folder)).length), tone: "gray" as const },
    { label: "Links resolved", value: String(resolved), tone: "green" as const },
    { label: "Unresolved", value: String(unresolved), tone: unresolved > 0 ? ("amber" as const) : ("gray" as const) },
    { label: "Awaiting review", value: String(signals.activity.awaitingReview), tone: signals.activity.awaitingReview > 0 ? ("amber" as const) : ("gray" as const) },
  ];

  return (
    <AppShell active="/vault">
      <PageHeader
        eyebrow="Vault"
        title="The shared brain for Mark and the team"
        description="Linked notes, playbooks, and partner intel. Wiki-links connect notes to live CRM records and personas. Mark drafts land in review before they publish."
        aside={
          <div className="flex flex-col items-end gap-2">
            <StatusPill tone={model.status === "live" ? "green" : "amber"}>{model.status === "live" ? "Live" : "Read-only"}</StatusPill>
            <AutoRefresh />
          </div>
        }
      />

      {model.status !== "live" ? (
        <div className="mb-4 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">{model.status === "fallback" ? "Read-only: " : "Vault error: "}</span>
          {model.message}
        </div>
      ) : null}

      <OperatorBar
        task="Keep the vault in sync"
        detail="Create a note now, or import from your Obsidian vault. New note and edits persist to Supabase; Sync vault is still a preview."
        status={model.status === "live" ? "Live" : "Read-only"}
        primary={<Link className={buttonClasses({ variant: "primary" })} href="/vault/new">New note</Link>}
        secondary={<Link className={buttonClasses({ variant: "ghost" })} href="?action=sync">Sync vault</Link>}
      />
      <ActionFeedback action={action} messages={actionMessages} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3" key={stat.label}>
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${toneDot(stat.tone)}`} aria-hidden="true" />
              <div className="text-xs text-[var(--text-muted)]">{stat.label}</div>
            </div>
            <div className="mt-1 font-display text-3xl font-black tabular-nums tracking-[-0.04em]">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {vaultCollections
            .filter((collection) => notes.some((n) => n.folder === collection.folder))
            .map((collection) => {
              const theme = collectionTheme(collection.folder);
              const collectionNotes = notes.filter((n) => n.folder === collection.folder);
              const freshest = collectionNotes.map((n) => n.updated).find(Boolean) ?? "—";
              return (
                <Panel key={collection.folder}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CollectionIcon icon={theme.icon} tone={theme.tone} />
                      <div className="signal-eyebrow">{collection.folder}</div>
                      <StatusPill tone={theme.tone}>{collectionNotes.length}</StatusPill>
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">updated {freshest}</div>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{collection.description}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {collectionNotes.map((note) => (
                      <NoteCard key={note.slug} note={note} />
                    ))}
                  </div>
                </Panel>
              );
            })}
        </div>

        <div className="space-y-4">
          <MarkActivityRail activity={signals.activity} isLive={signals.status === "live"} reviewHref={reviewHref} />
          <Panel>
            <div className="signal-eyebrow">Graph</div>
            <p className="mt-1 mb-3 text-sm text-[var(--text-secondary)]">How the notes connect.</p>
            <NoteGraph edges={graphEdges} focusId={notes[0]?.slug ?? ""} nodes={graphNodes} />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function toneDot(tone: "blue" | "green" | "amber" | "gray") {
  if (tone === "blue") return "bg-[var(--accent)]";
  if (tone === "green") return "bg-[oklch(0.78_0.14_158)]";
  if (tone === "amber") return "bg-[oklch(0.82_0.13_85)]";
  return "bg-[var(--text-muted)]";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: succeeds; `/vault` present.

- [ ] **Step 3: Commit**

```bash
git add src/app/vault/page.tsx
git commit -m "feat: redesign vault home with live Mark rail and color-coded collections"
```

---

## Task 10: Add record signals + auto-refresh to the note detail page

**Files:**
- Modify: `src/app/vault/[noteSlug]/page.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/app/vault/[noteSlug]/page.tsx`, add:
```tsx
import { AutoRefresh } from "../_components/auto-refresh";
import { RecordSignalChip } from "../_components/record-signal-chip";
import { getRecordSignals } from "@/lib/vault/live-signals";
```

- [ ] **Step 2: Fetch record signals**

After the line `const backlinks = computeBacklinks(notes, note.slug);`, add:
```tsx
  const recordSignals = await getRecordSignals(outgoing);
```

- [ ] **Step 3: Mount AutoRefresh in the header aside**

Replace the `aside={...}` block of the `<PageHeader>` with:
```tsx
        aside={
          <div className="flex flex-col items-end gap-1.5">
            <StatusPill tone={note.status === "Published" ? "green" : note.status === "Needs review" ? "amber" : "gray"}>{note.status}</StatusPill>
            {note.author === "Mark" ? <StatusPill tone="blue">Mark</StatusPill> : null}
            <AutoRefresh />
          </div>
        }
```

- [ ] **Step 4: Render chips beside record/persona links**

In the "Links in this note" panel, replace the `<li>` body that renders each link with this version (adds the chip when a signal exists):
```tsx
                        <li className="flex items-center justify-between gap-2" key={`${link.target}-${i}`}>
                          {link.kind === "unresolved" ? (
                            <span className="text-[var(--text-muted)]" title="Not imported yet">{link.label}</span>
                          ) : (
                            <Link className="font-semibold text-[var(--accent)] hover:underline" href={link.href}>{link.label}</Link>
                          )}
                          {recordSignals.get(link.target) ? <RecordSignalChip signal={recordSignals.get(link.target)!} /> : null}
                        </li>
```

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add "src/app/vault/[noteSlug]/page.tsx"
git commit -m "feat: show live record signals and auto-refresh on note detail"
```

---

## Task 11: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: all pass, including `live-signals.test.ts` and `notebook` data test.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors. (If `AutoRefresh`'s `refreshedAt` is flagged unused, confirm the `title` attribute references it as shown in Task 8.)

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: succeeds with `/vault` and `/vault/[noteSlug]`.

- [ ] **Step 4: Manual smoke (report run-or-not honestly)**

- Without Supabase env: home shows the read-only banner, the Mark rail shows "Offline", collections show color-coded counts + freshness, the "Live" auto-refresh indicator renders, and the detail page shows persona links with a "ref" chip. No crash.
- With Supabase env + migration applied + some `agents`/`agent_tasks`/`leads` rows: the Mark rail shows real status/drafting/outputs/heartbeat, "Awaiting review" reflects `vault_notes` needs-review count, and persona links on a note show live lead counts with a "live" marker. Explicitly state whether this configured path was exercised or only the fallback path.

---

## Self-review notes
- **Spec coverage:** Mark activity feed (Tasks 1,2,6,9), live record signals (Tasks 3,7,10), live collection counts + freshness (Tasks 4,5,9), auto-refresh (Tasks 8,9,10), color system on-palette (Tasks 4,5,9), graceful degradation (Tasks 2,3,9), tests (Tasks 1,2,4). All spec sections map to tasks.
- **Minor spec deviation:** unconfigured persona signals show a "reference" marker with the persona label rather than a fabricated count, to honor DESIGN.md's "no fake metrics." Live persona counts are real. Flagged for visibility.
- **Type consistency:** `StatusTone`, `MarkActivity`, `RecordSignal`, `getVaultLiveSignals`, `getRecordSignals`, `collectionTheme`, `collectionThemes`, `CollectionIcon`, `personaSignalLabel`, `shortTime`, `toMarkActivity` are used identically across files. `StatusTone` is defined in BOTH `live-signals.ts` and `_data/notebook.ts` as the same union — acceptable (no import cycle) since each is consumed locally; the chip/icon import the tone type from `_data/notebook.ts`, the rail uses string tones via `StatusPill`.

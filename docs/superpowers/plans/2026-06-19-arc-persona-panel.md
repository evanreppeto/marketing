# Persona Panel on /brand (SP3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only **Personas** panel to `/brand` that shows all 12 canonical personas overlaid with their live intelligence (segment / stage / score / next action), linking to `/persona-intelligence` for editing.

**Architecture:** A pure `buildPersonaPanelRows(data)` helper overlays live `PersonaTrackerRow`s onto `PERSONA_CTA_RULES` (the persona-intelligence page's exact pattern); a presentational `BrandPersonas` server component renders the rows; `/brand` fetches `getPersonaIntelligenceData()` and passes it in. No new persistence/route/runner/schema.

**Tech Stack:** Next.js 16 server components, TypeScript, Vitest.

**Test command:** `pnpm test <path>`.

**Verified facts:**
- `getPersonaIntelligenceData(client?)` → `{ status:"live"; stats; personas: PersonaTrackerRow[]; contentSignals; guardrailSignals } | { status:"unavailable"; message }` (`src/lib/persona-intelligence/read-model.ts`).
- `PersonaTrackerRow = { key, persona, segment, stage, intent, nextAction, contentNeed, score, offer, tone: PersonaTone, snapshot? }`; `PersonaTone = "amber"|"green"|"red"|"blue"`.
- `PERSONA_CTA_RULES: PersonaCtaRule[]` (12 personas; `persona: OfficialPersonaMapping`) + `personaSlug(persona)` (`src/lib/persona-intelligence/cta-rules.ts`). Live rows' `.key === personaSlug(rule.persona)` (the `/persona-intelligence` page overlays via `liveBySlug.get(personaSlug(rule.persona))`).
- `/brand` page (`src/app/brand/page.tsx`): server component; `Promise.all([loadBrandProfile(), listNodes({}), getMediaLibraryData(), getAgentName()])` at ~line 147; the facts/sources `</section>` closes ~line 303, `<BrandProfileEditor profile={profile} />` is ~line 305.
- Primitives: `Panel`, `StatusPill`, `buttonClasses` (`@/app/_components/page-header`); `cx` (`@/app/_components/theme`). `StatusPill` takes `tone` (e.g. "green"/"amber"/"blue"/"red"/"gray"). `Link` from `next/link`.

---

## File Structure
- `src/app/brand/_components/brand-personas.tsx` (create) — `buildPersonaPanelRows` + `BrandPersonas`
- `src/app/brand/_components/brand-personas.test.ts` (create) — helper unit tests
- `src/app/brand/page.tsx` (modify) — fetch + render

---

## Task 1: `buildPersonaPanelRows` helper + tests

**Files:** Create `src/app/brand/_components/brand-personas.tsx` (helper first) + `brand-personas.test.ts`

- [ ] **Step 1: Write the failing test** (`brand-personas.test.ts`)

```typescript
import { describe, expect, it } from "vitest";
import { buildPersonaPanelRows } from "./brand-personas";
import { PERSONA_CTA_RULES, personaSlug } from "@/lib/persona-intelligence/cta-rules";

const liveRow = (over: Record<string, unknown>) => ({
  key: "", persona: "X", segment: "Seg", stage: "Aware", intent: "", accelerator: "",
  nextAction: "Do thing", contentNeed: "", score: 72, blocker: "", offer: "", crmPath: "",
  tone: "green", ...over,
});

describe("buildPersonaPanelRows", () => {
  it("returns [] when persona memory is unavailable", () => {
    expect(buildPersonaPanelRows({ status: "unavailable", message: "no db" })).toEqual([]);
  });

  it("returns one row per canonical persona", () => {
    const rows = buildPersonaPanelRows({ status: "live", stats: [], personas: [], contentSignals: [], guardrailSignals: [] } as never);
    expect(rows).toHaveLength(PERSONA_CTA_RULES.length);
    expect(rows.every((r) => r.hasLive === false)).toBe(true);
  });

  it("overlays live tracker data by persona slug", () => {
    const first = PERSONA_CTA_RULES[0];
    const slug = personaSlug(first.persona);
    const data = { status: "live", stats: [], personas: [liveRow({ key: slug, persona: "Decision Maker", segment: "Homeowners", stage: "Evaluating", score: 81, tone: "green", nextAction: "Send proof" })], contentSignals: [], guardrailSignals: [] };
    const rows = buildPersonaPanelRows(data as never);
    const hit = rows.find((r) => r.key === slug)!;
    expect(hit).toMatchObject({ hasLive: true, label: "Decision Maker", segment: "Homeowners", stage: "Evaluating", score: 81, tone: "green", nextAction: "Send proof" });
    // personas without a live row still appear, marked not-live
    expect(rows.filter((r) => r.hasLive)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm test src/app/brand/_components/brand-personas.test.ts`).

- [ ] **Step 3: Implement the helper** at the top of `src/app/brand/_components/brand-personas.tsx`

```tsx
import Link from "next/link";

import { Panel, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { PERSONA_CTA_RULES, personaSlug } from "@/lib/persona-intelligence/cta-rules";
import {
  type PersonaIntelligenceData,
  type PersonaTone,
} from "@/lib/persona-intelligence/read-model";

export type PersonaPanelRow = {
  key: string;
  label: string;
  segment: string | null;
  stage: string | null;
  score: number | null;
  tone: PersonaTone | null;
  nextAction: string | null;
  hasLive: boolean;
};

function formatPersonaLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Overlay live persona tracker rows onto the canonical persona set (by slug). */
export function buildPersonaPanelRows(data: PersonaIntelligenceData): PersonaPanelRow[] {
  if (data.status !== "live") return [];
  const liveBySlug = new Map(data.personas.map((p) => [p.key, p]));
  return PERSONA_CTA_RULES.map((rule) => {
    const slug = personaSlug(rule.persona);
    const live = liveBySlug.get(slug) ?? null;
    return {
      key: slug,
      label: live?.persona ?? formatPersonaLabel(String(rule.persona)),
      segment: live?.segment ?? null,
      stage: live?.stage ?? null,
      score: live?.score ?? null,
      tone: live?.tone ?? null,
      nextAction: live?.nextAction ?? null,
      hasLive: Boolean(live),
    };
  });
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/app/brand/_components/brand-personas.tsx src/app/brand/_components/brand-personas.test.ts && git commit -m "feat(brand): buildPersonaPanelRows — overlay live intel on canonical personas"`

---

## Task 2: `BrandPersonas` component + page wiring

**Files:** `src/app/brand/_components/brand-personas.tsx` (add component), `src/app/brand/page.tsx` (modify)

- [ ] **Step 1: Add the `BrandPersonas` component** (append to `brand-personas.tsx`)

```tsx
const MANAGE_LINK = (
  <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/persona-intelligence">
    Manage in Persona Intelligence
  </Link>
);

export function BrandPersonas({ data }: { data: PersonaIntelligenceData }) {
  const rows = buildPersonaPanelRows(data);

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div>
          <div className="signal-eyebrow">Audience</div>
          <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Personas</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            Who the business markets to, with live read where available. Edit on the Persona Intelligence page.
          </p>
        </div>
        {MANAGE_LINK}
      </div>

      {data.status === "unavailable" ? (
        <div className="px-5 py-6 text-sm leading-6 text-[var(--text-secondary)]">
          Persona memory is unavailable right now. {data.message}
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-hairline)]">
          {rows.map((row) => (
            <article className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={row.key}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">{row.label}</h3>
                  {row.segment ? <span className="text-xs text-[var(--text-muted)]">{row.segment}</span> : null}
                  {row.hasLive ? null : <span className="text-xs text-[var(--text-muted)]">No live read yet</span>}
                </div>
                {row.hasLive ? (
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {row.stage ? <span className="font-semibold">{row.stage}.</span> : null} {row.nextAction || ""}
                  </p>
                ) : null}
              </div>
              {row.hasLive && row.score !== null ? (
                <StatusPill tone={row.tone ?? "gray"}>{`Score ${row.score}`}</StatusPill>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
```
> `StatusPill`'s `tone` accepts the `PersonaTone` values ("green"/"amber"/"red"/"blue") plus "gray"; the fallback `?? "gray"` covers a null tone. If TypeScript complains that `PersonaTone` isn't assignable to `StatusPill`'s tone union, widen by mapping any unexpected value to "gray" — but the four values overlap, so it should type-check; verify in Task 3's build.

- [ ] **Step 2: Wire into `src/app/brand/page.tsx`**

(a) Add imports near the other lib imports:
```typescript
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";
```
and near the local component imports:
```typescript
import { BrandPersonas } from "./_components/brand-personas";
```
(b) Add the fetch to the `Promise.all` and destructure it:
```typescript
  const [profile, brain, library, agentName, personaData] = await Promise.all([
    loadBrandProfile(),
    listNodes({}),
    getMediaLibraryData(),
    getAgentName(),
    getPersonaIntelligenceData(),
  ]);
```
(c) Render the panel between the facts/sources `</section>` and `<BrandProfileEditor … />`:
```tsx
      <BrandPersonas data={personaData} />

      <BrandProfileEditor profile={profile} />
```

- [ ] **Step 3: Typecheck the touched files** — `npx tsc --noEmit` (or proceed to Task 3's full build). Resolve any `StatusPill` tone-union complaint per the Step 1 note.

- [ ] **Step 4: Commit** — `git add src/app/brand && git commit -m "feat(brand): read-only Personas panel on /brand"`

---

## Task 3: Build + verify

- [ ] **Step 1:** `pnpm test src/app/brand/_components/brand-personas.test.ts` → pass.
- [ ] **Step 2:** `pnpm build` → succeeds (the real typecheck gate over the page + component). `pnpm install` first if deps missing. Fix only feature-caused failures (notably any `StatusPill` tone typing).
- [ ] **Step 3 (browser, if the dev server can reach Supabase):** start the preview, open `/brand`, confirm the Personas panel renders with the 12 personas + the "Manage in Persona Intelligence" link, and capture a screenshot. NOTE: locally `/brand` may hang on "Loading…" if Supabase is unreachable (known slow-load) — if so, rely on the build + the unit test; the panel renders where Supabase is reachable.
- [ ] **Step 4 (if fixups):** `git add -A && git commit -m "fix(brand): persona panel verification fixups"`

---

## Self-Review (plan author)

- **Spec coverage:** pure overlay helper → Task 1; presentational panel + page wiring (Promise.all + placement between facts/sources and editor) → Task 2; build/verify → Task 3. Read-only, no new persistence/route/runner/schema — matches spec.
- **Placeholder scan:** none. The one flagged risk (`StatusPill` tone union vs `PersonaTone`) has an explicit resolution + a build gate.
- **Type consistency:** `buildPersonaPanelRows(data: PersonaIntelligenceData): PersonaPanelRow[]` used by both the test and `BrandPersonas`. Live overlay keyed by `personaSlug(rule.persona)` matching `PersonaTrackerRow.key` (the persona-intelligence page's proven join). `getPersonaIntelligenceData()` added to the page `Promise.all` with matching destructure order.
- **Safety:** read-only; degrades via the read-model's `unavailable` branch (panel shows a note); no outbound/approval/schema impact.

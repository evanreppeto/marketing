# Configurable Agent Name (De-brand "Arc") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every user-facing "Arc" string render the operator-configured agent name (default "Agent"), with zero changes to internal identifiers, routes, the "Arc" worker, or env vars.

**Architecture:** The `assistantName` setting + `getAgentDisplayName()`/`agentProfile()` resolvers already exist. We add two distribution mechanisms — a `useAgentName()` client hook (provider hosted in the persistent `ConsoleFrame`) and a `cache()`-wrapped `getAgentName()` server helper — then migrate rendered copy surface-by-surface to use them. Default fallbacks flip `"Arc"` → `"Agent"`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Supabase, pnpm.

---

## Swap convention (read once; every migration task references this)

For each **rendered** "Arc" literal:

- **Static literal in JSX** → interpolate the resolved name.
  - Before: `title="What Arc created"`
  - After (client): `` title={`What ${agentName} created`} `` where `const agentName = useAgentName();`
  - After (server): `` title={`What ${agentName} created`} `` where `const agentName = await getAgentName();`
- **`assistantName = "Arc"` default parameter** → change the default to `"Agent"`.
- **Gendered pronouns referring to the agent** → neutralize:
  - "what data **he** touched" → "what data **the agent** touched"
  - "**his** reply" / "when **he**'s done" → "**its** reply" / "when **it**'s done"
  - "as **he** claims" → "as **it** claims"

**Do NOT change (these are data or non-rendered):**
- Code **comments** containing "Arc" (e.g. `// the Arc surface`, JSDoc). Out of scope.
- **Data comparisons / stored values**: `source === "Arc"`, map **keys** like `arc: {...}`, and any value persisted as a record field used for matching. Only the *displayed* part changes (see campaigns task for the one map-label case).
- File names, module names, `/arc` route, `import` paths, function names (`getMarkDisplayName`, `MarkChat`), CSS classes (`.arc-orb`), env vars.

**Per-file mechanical sweep:** after handling the explicit lines a task calls out, run
`pnpm exec grep -rn "Arc" <files>` (or the Grep tool with `\bMark\b`) over the task's files and confirm every remaining hit is a comment, identifier, or data value — not rendered copy.

**Per-task verification:** scope eslint to changed files (lint scans vendored code — see project memory):
`pnpm exec eslint <changed files>`. Full `pnpm test` + `pnpm build` run only in the final task.

---

## Task 1: Name distribution infrastructure + default flip

**Files:**
- Modify: `src/lib/settings/store.ts` (line 42)
- Modify: `src/lib/arc-chat/agent-config.ts` (lines 22, 30)
- Test: `src/lib/settings/store.test.ts`, `src/lib/arc-chat/agent-config.test.ts`
- Create: `src/lib/settings/agent-name.ts`
- Create: `src/app/_components/agent-name-context.tsx`
- Modify: `src/app/_components/console-frame.tsx`

- [ ] **Step 1: Update the failing tests for the default flip**

Open `src/lib/arc-chat/agent-config.test.ts`. Find the assertions that expect `"Arc"` as the empty/fallback result of `agentProfile("")` and `getAgentDisplayName(undefined)` and change them to expect `"Agent"`. Example:

```ts
// agentProfile fallback
expect(agentProfile("").name).toBe("Agent");
expect(agentProfile("   ").shortName).toBe("Agent");
expect(agentProfile(null).monogram).toBe("A");

// getAgentDisplayName fallback (no override, no env)
expect(getAgentDisplayName(undefined)).toBe("Agent");
expect(getAgentDisplayName("  ")).toBe("Agent");
```

Open `src/lib/settings/store.test.ts`. Find any assertion that `DEFAULT_APP_SETTINGS.assistantName` (or merged-default assistantName) is `"Arc"` and change it to `"Agent"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/arc-chat/agent-config.test.ts src/lib/settings/store.test.ts`
Expected: FAIL — assertions still see `"Arc"`.

- [ ] **Step 3: Flip the three default sites**

`src/lib/settings/store.ts` line 42:
```ts
  assistantName: "Agent",
```

`src/lib/arc-chat/agent-config.ts` line 22 (inside `agentProfile`):
```ts
  const name = (rawName ?? "").trim() || "Agent";
```

`src/lib/arc-chat/agent-config.ts` line 30 (inside `getAgentDisplayName`):
```ts
  return override?.trim() || process.env.ARC_DISPLAY_NAME?.trim() || "Agent";
```

(Leave the env var name `ARC_DISPLAY_NAME` and the function name `getAgentDisplayName` unchanged — internal identifiers.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/arc-chat/agent-config.test.ts src/lib/settings/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the cached server helper**

Create `src/lib/settings/agent-name.ts`:
```ts
import { cache } from "react";

import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";

import { getAppSettings } from "./store";

/**
 * Resolved, operator-configured agent display name for server components.
 * Wrapped in React `cache()` so repeated reads within one request collapse to a
 * single app_settings query. Degrades to "Agent" when Supabase is unconfigured.
 */
export const getAgentName = cache(async (): Promise<string> => {
  const settings = await getAppSettings();
  return getAgentDisplayName(settings.assistantName);
});
```

- [ ] **Step 6: Create the client context + hook**

Create `src/app/_components/agent-name-context.tsx`:
```tsx
"use client";

import { createContext, useContext } from "react";

/** Falls back to "Agent" so isolated component previews/tests don't crash. */
const AgentNameContext = createContext<string>("Agent");

export function AgentNameProvider({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return <AgentNameContext.Provider value={value}>{children}</AgentNameContext.Provider>;
}

/** The operator-configured agent display name (default "Agent"). */
export function useAgentName(): string {
  return useContext(AgentNameContext);
}
```

- [ ] **Step 7: Host the provider in ConsoleFrame**

In `src/app/_components/console-frame.tsx`, import the provider:
```tsx
import { AgentNameProvider } from "./agent-name-context";
```

`ConsoleFrame` already receives `agentName: string`. It has two return points (the auth-page early return and the main frame). Wrap **both** returned trees so the name is always in context. Change the early return:
```tsx
  if (pathname === "/login" || pathname === "/sign-in" || pathname === "/forgot-password") {
    return <AgentNameProvider value={agentName}>{children}</AgentNameProvider>;
  }
```
and wrap the main `return ( <main className={theme.shell.canvas}> ... </main> )` so the outermost element is `<AgentNameProvider value={agentName}>...</AgentNameProvider>`:
```tsx
  return (
    <AgentNameProvider value={agentName}>
      <main className={theme.shell.canvas}>
        {/* ...existing frame unchanged... */}
      </main>
    </AgentNameProvider>
  );
```
(The layout at `src/app/layout.tsx:67` already passes `agentName={getAgentDisplayName(settings.assistantName)}` — no change needed there.)

- [ ] **Step 8: Add a unit test for the helper + hook fallback**

Create `src/app/_components/agent-name-context.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgentNameProvider, useAgentName } from "./agent-name-context";

function Probe() {
  return <span>{useAgentName()}</span>;
}

describe("useAgentName", () => {
  it("returns 'Agent' with no provider", () => {
    render(<Probe />);
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("returns the provider value", () => {
    render(
      <AgentNameProvider value="Arc">
        <Probe />
      </AgentNameProvider>,
    );
    expect(screen.getByText("Arc")).toBeInTheDocument();
  });
});
```

(If the repo's vitest setup lacks `@testing-library/react`/`jest-dom`, match the pattern used by an existing `*.test.tsx` in `src/app`; if no component test harness exists, assert via `renderToStaticMarkup` from `react-dom/server` instead.)

- [ ] **Step 9: Run infra tests + lint**

Run: `pnpm test src/lib/settings/store.test.ts src/lib/arc-chat/agent-config.test.ts src/app/_components/agent-name-context.test.tsx`
Expected: PASS.
Run: `pnpm exec eslint src/lib/settings/agent-name.ts src/app/_components/agent-name-context.tsx src/app/_components/console-frame.tsx`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/settings/agent-name.ts src/app/_components/agent-name-context.tsx src/app/_components/console-frame.tsx src/lib/settings/store.ts src/lib/arc-chat/agent-config.ts src/lib/settings/store.test.ts src/lib/arc-chat/agent-config.test.ts src/app/_components/agent-name-context.test.tsx
git commit -m "feat: agent-name context + cached helper; default name -> Agent"
```

---

## Task 2: Migrate the agent-operations surface

**Files (all Modify):**
- `src/app/agent-operations/new-task-dialog.tsx` (client) — lines 143, 149
- `src/app/agent-operations/agent-task-board.tsx` (client) — lines 64, 75, 87, 100, 106, 113, 186
- `src/app/agent-operations/task-kanban-board.tsx` (client) — lines 17, 18 (line 56 is a comment: leave)
- `src/app/agent-operations/page.tsx` (server) — lines 20, 48, 56, 72, 80, 87, 116, 133, 135
- `src/app/agent-operations/[agentKey]/page.tsx` (server) — lines 110, 111, 124
- `src/app/agent-operations/tasks/[taskId]/page.tsx` (server) — lines 44, 124, 219, 226
- `src/app/agent-operations/tasks/[taskId]/task-record-panels.tsx` (client) — lines 106, 107, 192, 197, 272, 354, 534, 624, 625, 626, 628
- `src/app/agent-operations/tasks/[taskId]/ticket-latest-output.tsx` (client) — line 22
- `src/app/agent-operations/tasks/[taskId]/ticket-editable-header.tsx` (client) — lines 165, 188, 215, 226, 243
- `src/app/agent-operations/tasks/[taskId]/ticket-activity-timeline.tsx` (client) — line 31 (line 39 is a DATA comparison: leave)
- Test: `src/lib/agent-operations/read-model.test.ts` and any `agent-operations` component test asserting copy

- [ ] **Step 1: Wire the name into each file**

Client components: add `const agentName = useAgentName();` (import from `@/app/_components/agent-name-context` — verify the alias path resolves; the alias is `@/* -> src/*`, so `import { useAgentName } from "@/app/_components/agent-name-context";`) at the top of the component body.

Server components (`page.tsx`, `[agentKey]/page.tsx`, `tasks/[taskId]/page.tsx`): add `const agentName = await getAgentName();` (import `import { getAgentName } from "@/lib/settings/agent-name";`) near the top of the async component, before the returned JSX / built objects.

- [ ] **Step 2: Apply the Swap convention to every listed display line**

Use the Swap convention above. Specific non-mechanical lines:

`page.tsx:135` (pronoun):
```tsx
  description={`Use this page to see what ${agentName} is doing, what data the agent touched, what outputs the agent created, and what needs approval or repair.`}
```
`task-record-panels.tsx:354` (pronoun):
```tsx
detail={query ? "Clear the search or try another term." : `${agentName} writes run logs as it claims, processes, blocks, or completes tasks.`}
```
`task-record-panels.tsx:624-628` (status helper — these return rendered strings; ensure the function has access to `agentName`. If they are module-scope helpers, pass `agentName` as a parameter and update the call site):
```tsx
  if (log.errorMessage) return `${agentName} hit an issue while working`;
  if (/completed|approved|passed/i.test(log.runStatus)) return `${agentName} finished this step`;
  if (/running|processing/i.test(log.runStatus)) return `${agentName} is working on this step`;
  return `${agentName} recorded a runner step`;
```
`task-record-panels.tsx:534` ("Arc's runner" → possessive): `` `This is one recorded step from ${agentName}'s runner: ...` ``
`ticket-editable-header.tsx:188`: `` {needsApproval ? `Review ${agentName}'s draft.` : `${agentName} has a draft ready.`} ``
`ticket-editable-header.tsx:243`: `` setContinueMessage(result.ok ? `${agentName} was asked for the next step.` : result.message); ``

All other listed lines are mechanical `Arc` → `${agentName}` interpolations (titles, placeholders, aria-labels, EmptyState detail/title, eyebrow, descriptions, `description="Ready for Arc"` → `` description={`Ready for ${agentName}`} ``).

`ticket-activity-timeline.tsx:39` — **leave unchanged**: `if (source === "Arc") return "blue";` matches a stored source value, not display.

- [ ] **Step 3: Update affected tests**

Run: `pnpm test src/lib/agent-operations/read-model.test.ts`
For each failure, inspect: if the assertion checks **rendered copy** (a label/title/description string), update `"Arc"` → `"Agent"`. If "Arc" is **fixture data** (e.g. a sample task actor/source value), leave it. Re-run until green.

- [ ] **Step 4: Sweep + lint**

Grep the task's files for `\bMark\b`; confirm remaining hits are comments / the line-39 data comparison only.
Run: `pnpm exec eslint src/app/agent-operations` (directory scope is fine here).
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/agent-operations src/lib/agent-operations/read-model.test.ts
git commit -m "feat(agent-operations): render configurable agent name"
```

---

## Task 3: Migrate the /arc surface

**Files (all Modify):**
- Default-param flips (`assistantName = "Arc"` → `assistantName = "Agent"`):
  - `src/app/arc/_components/composer.tsx:114`
  - `src/app/arc/_components/arc-chat.tsx:126`
  - `src/app/arc/_components/message-list.tsx:514`
  - `src/app/arc/_components/thread-sidebar.tsx:240`
  - `src/app/arc/_components/work-canvas.tsx:345`
- Rendered copy:
  - `src/app/arc/saved/page.tsx` (server) — lines 19, 51 (`eyebrow="Arc"`)
- Test: `src/app/arc/_data/demo.ts` handled in Task 7; check `src/domain/__tests__/arc-chat.test.ts` / `arc-mode.test.ts` only if they assert the default string.

- [ ] **Step 1: Flip the default params**

In each of the five `_components` files, change the default parameter value:
```tsx
  assistantName = "Agent",
```
These already thread `assistantName` from `/arc/page.tsx` (which passes `settings.assistantName`); only the fallback default changes. The page sources the real value from settings, so configured names already flow — this just fixes the unconfigured fallback.

- [ ] **Step 2: Make saved/page.tsx dynamic**

`src/app/arc/saved/page.tsx` is a server component. Add `import { getAgentName } from "@/lib/settings/agent-name";` and `const agentName = await getAgentName();`, then:
```tsx
        eyebrow={agentName}
```
on both lines 19 and 51. (Per project memory, PageHeader ignores `eyebrow` visually, but keep it consistent.)

- [ ] **Step 3: Sweep + lint**

Grep `src/app/arc` for `\bMark\b`; confirm remaining hits are comments, CSS class names (`.arc-orb`), component/file names, or import paths — not rendered copy.
Run: `pnpm exec eslint src/app/arc`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/arc
git commit -m "feat(arc): default assistant fallback -> Agent; dynamic saved header"
```

---

## Task 4: Migrate the campaigns surface (incl. data-vs-display cases)

**Files (all Modify):**
- `src/app/campaigns/actions.ts` (server actions) — lines 243 (rendered message + pronouns), 515 (author name DATA)
- `src/app/campaigns/_components/arc-conversation.tsx` (client) — line 51 (rendered copy + pronouns)
- `src/app/campaigns/_components/audit-log.tsx` (client) — line 13 (label inside a const map)
- `src/app/campaigns/_components/campaign-detail-model.ts` (model builder) — line 269 (`title: "Arc"`)
- Other campaigns files flagged by sweep (creative-tab, reasoning-tab, approval-context, campaign-content-table, etc.) — apply Swap convention
- Test: `src/lib/campaigns/__tests__/read-model.test.ts`, `src/app/campaigns/_components/__tests__/*`

- [ ] **Step 1: actions.ts:243 — rendered message + pronouns**

This server action already can read settings. Add `const agentName = await getAgentName();` (import `@/lib/settings/agent-name`) in that action and change:
```ts
  return { ok: true, message: `Sent to ${agentName} — queued. Its reply lands here when it's done.` };
```

- [ ] **Step 2: actions.ts:515 — author name (DATA used as display)**

Line 515 sets `name: "Arc"` on a conversation message author. This value is rendered as the author label, so make it dynamic. Reuse `agentName` (add `const agentName = await getAgentName();` to this action if not already present):
```ts
        name: agentName,
```

- [ ] **Step 3: arc-conversation.tsx:51 — copy + pronouns**

Client component. Add `const agentName = useAgentName();` and rewrite:
```tsx
              No messages yet. Ask {agentName} to draft more pieces, revise an existing one, or explain its choices — your message is queued and its reply lands here.
```

- [ ] **Step 4: audit-log.tsx:13 — label inside a module-level const map**

The map key `arc` is DATA (matches a source type) and must stay; only its `label` is display. A module-level const can't call the hook, so move the label resolution into the component. Keep the key, drop the static label, and resolve at render:
```tsx
// keep the key `arc` and its styling; render the label via useAgentName()
```
Concretely: where the component renders `entry.label` for the `arc` source, replace the displayed label with `useAgentName()` when the source key is `arc`. If the map currently provides `label` directly to JSX, change the JSX to `source === "arc" ? agentName : config.label`. Keep the `arc:` map entry (styling/dot) intact; only the displayed text becomes dynamic.

- [ ] **Step 5: campaign-detail-model.ts:269 — model builder title**

This `.ts` builder runs server-side (no hook). Thread the name in: add an `agentName: string` parameter to the builder function that sets `title: "Arc"`, set `title: agentName`, and pass `await getAgentName()` from the server component that calls it. (Find the call site with `grep -rn "campaign-detail-model" src/app/campaigns` and pass the resolved name through.)

- [ ] **Step 6: Sweep remaining campaigns files**

Grep `src/app/campaigns` for `\bMark\b`. For each rendered hit in the other components (creative-tab, reasoning-tab, approval-context, campaign-content-table, campaign-package-panel, campaign-right-rail, library-model, etc.), apply the Swap convention (client → `useAgentName()`, server/model → threaded `getAgentName()`). Leave comments, `arc:`/`"arc"` data keys, and module/file names.

- [ ] **Step 7: Update tests + lint**

Run: `pnpm test src/lib/campaigns src/app/campaigns`
Update rendered-copy assertions `"Arc"` → `"Agent"`; leave fixture/source-key data. Re-run until green.
Run: `pnpm exec eslint src/app/campaigns src/lib/campaigns`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/campaigns src/lib/campaigns
git commit -m "feat(campaigns): render configurable agent name across workspace"
```

---

## Task 5: Migrate shared components, approvals, board, CRM interactions

**Files (all Modify):**
- `src/app/_components/approval-inbox.tsx` (client) — line 80
- `src/app/_components/opportunity-command-center.tsx` (client) — lines 68, 84
- `src/app/_components/intelligence-panel.tsx` (client) — line 160
- `src/app/_components/entity-avatar.tsx` — line 7 is a COMMENT: leave (verify no rendered hit)
- `src/app/approvals/page.tsx`, `src/app/approvals/approval-queue-table.tsx`, `src/app/approvals/approval-detail-panel.tsx`
- `src/app/board/page.tsx`
- `src/app/crm/_components/crm-object-page.tsx`, `crm-record-page.tsx`, `record-interactions/notes-panel.tsx`, `record-interactions/tasks-panel.tsx`
- `src/app/outbox/page.tsx`, `src/app/outbox/_components/outbox-console.tsx`
- `src/app/gallery/_components/gallery-grid.tsx`
- Tests: `src/lib/approvals/read-model.test.ts` and any component tests for these surfaces

- [ ] **Step 1: Apply the Swap convention per file**

For each file: client components get `const agentName = useAgentName();`; server components get `const agentName = await getAgentName();`. Replace rendered "Arc" literals with `${agentName}` interpolation. Neutralize any pronouns. Leave comments and data keys/values.

Explicit:
- `approval-inbox.tsx:80`: `` detail={`When ${agentName} prepares new work that needs a decision, it shows up here.`} ``
- `opportunity-command-center.tsx:68`: `` detail={`When CRM, partner, campaign, approval, and ${agentName} task data is available, the prioritized lanes will appear here.`} ``
- `opportunity-command-center.tsx:84`: `` ...{`Switch lanes instead of scrolling through every opportunity. ${agentName} can prepare and revise; humans approve anything external.`} ``
- `intelligence-panel.tsx:160`: `` {model.emptyDetail ?? `No intelligence fields are available yet. ${agentName} can enrich the record, but outbound remains locked until a human approval exists.`} ``

- [ ] **Step 2: Sweep each directory**

Grep `src/app/approvals src/app/board src/app/crm src/app/outbox src/app/gallery src/app/_components` for `\bMark\b`; confirm remaining hits are comments, data values, or identifiers.

- [ ] **Step 3: Update tests + lint**

Run: `pnpm test src/lib/approvals`
Update rendered-copy assertions; leave fixtures.
Run: `pnpm exec eslint src/app/approvals src/app/board src/app/crm src/app/outbox src/app/gallery src/app/_components/approval-inbox.tsx src/app/_components/opportunity-command-center.tsx src/app/_components/intelligence-panel.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/approvals src/app/board src/app/crm src/app/outbox src/app/gallery src/app/_components
git commit -m "feat: render configurable agent name across approvals/board/crm/shared"
```

---

## Task 6: Migrate remaining pages (persona-intelligence, reports, partners, analytics)

**Files (all Modify):**
- `src/app/persona-intelligence/page.tsx`, `src/app/persona-intelligence/[personaKey]/page.tsx`
- `src/app/reports/page.tsx`
- `src/app/partners/page.tsx`, `src/app/partners/partner-board.tsx`
- `src/app/analytics/page.tsx`
- `src/app/brain/page.tsx`, `src/app/brain/_components/brain-browser.tsx`, `src/app/brain/_components/approval-queue.tsx`
- Any other `src/app/**` file the global sweep (Task 7) flags

- [ ] **Step 1: Apply the Swap convention**

Per file: server → `await getAgentName()`, client → `useAgentName()`. Replace rendered "Arc" literals; neutralize pronouns; leave comments/data/identifiers.

- [ ] **Step 2: Sweep + lint**

Grep each directory for `\bMark\b`; confirm only non-rendered hits remain.
Run: `pnpm exec eslint src/app/persona-intelligence src/app/reports src/app/partners src/app/analytics src/app/brain`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/persona-intelligence src/app/reports src/app/partners src/app/analytics src/app/brain
git commit -m "feat: render configurable agent name across remaining pages"
```

---

## Task 7: Demo/preview data, global sweep, full verification

**Files:**
- Modify: `src/app/arc/_data/demo.ts` (framing copy → "Agent")
- Modify: any straggler flagged by the global sweep

- [ ] **Step 1: Update demo framing copy**

`src/app/arc/_data/demo.ts` renders in preview mode (no settings). Replace rendered "Arc" framing copy with the literal `"Agent"` (preview has no operator config). Leave any field that is matched as data (e.g. a `source`/author key compared elsewhere) — but since demo author labels are displayed, set displayed author names to `"Agent"`. Use judgment: displayed → "Agent"; matched-as-key → unchanged.

- [ ] **Step 2: Global rendered-copy sweep**

Run a repo-wide search for standalone "Arc" in app + rendered-string libs:
`Grep \bMark\b in src/app/**/*.tsx and src/app/**/*.ts`
For every remaining hit, classify: comment / identifier / data value → leave; rendered copy → apply Swap convention and fold into the nearest committed surface (or fix here).

Also confirm NOT touched (must still match):
- `=== "Arc"` / `source === "Arc"` comparisons
- `arc:` map keys and `"arc"` route/source string values
- env vars `ARC_*`, function names, file/module names, `/api/v1/arc`, "Arc"

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: PASS. For any failure asserting on rendered "Arc" copy, update to "Agent"; for fixture/data, restore. Re-run until green.

- [ ] **Step 4: Type-check via build (lint does NOT type-check — project memory)**

Run: `pnpm build`
Expected: compiles with no type errors. Fix any (e.g. a builder that now needs an `agentName` arg at a missed call site).

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run: `pnpm dev`, open `/`, `/arc`, `/agent-operations`, `/campaigns`. Confirm copy reads "Agent" (default). In Settings, change the assistant name and confirm it propagates to nav + copy after reload.

- [ ] **Step 6: Final commit**

```bash
git add src/app/arc/_data/demo.ts
git commit -m "feat: de-brand demo copy to Agent; finalize configurable agent name"
```

---

## Self-review notes (coverage vs. spec)

- Default flip (3 sites) → Task 1. ✓
- Client distribution (provider/hook in ConsoleFrame) → Task 1. ✓
- Server distribution (cached `getAgentName`) → Task 1. ✓
- Copy migration across agent-operations / arc / campaigns / shared / pages → Tasks 2–6. ✓
- Pronoun neutralization → called out per surface (Tasks 2, 4, 5). ✓
- Data-vs-display nuance (`source === "Arc"`, map keys, author-name data) → Tasks 2, 4, 7. ✓
- Demo/preview copy → Task 7. ✓
- Out-of-scope preserved (Arc, routes, modules, env, comments) → Swap convention + Task 7 Step 2. ✓
- Testing (`pnpm test` + `pnpm build`, scoped eslint) → per-task + Task 7. ✓

# Arc UI Redesign — Plan 1: Visual Elevation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Arc chat feel like a full-bleed, professional, *alive* chat tool — without changing any backend or send behavior.

**Architecture:** Pure presentation. Remove the floating-card wrapper so the chat fills the content area edge-to-edge; restyle the existing message/presence/composer pieces to the elevated Obsidian & Gold language (one calm presence, a work-timeline signature, no gradient-text AI tell). The send pipeline, mentions, steps/actions/media, and polling are untouched.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 (CSS-var tokens), existing `react-markdown` rendering.

**This is Plan 1 of 4** for the Arc UI redesign (`docs/superpowers/specs/2026-06-10-arc-ui-redesign-design.md` §5). Later plans: 2) composer simplification (drop mode), 3) structured slash commands, 4) Agent Port + connection states. This plan must keep the app building, linting, and tests green.

---

## Context

- `src/app/arc/_components/arc-chat.tsx` — the chat shell. **Line ~237** wraps everything in `rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]` — *this is the floating card*.
- The Arc route renders inside `ConsoleFrame`'s content section, which has padding (`theme.shell.content`: `px-4 py-4 sm:px-6 lg:px-8 lg:py-5 xl:px-10`, and `lg:h-screen lg:overflow-y-auto`). Full-bleed = the Arc root cancels that padding with negative margins and fills height.
- `src/app/arc/_components/message-list.tsx` — already renders operator bubbles, Arc messages with `MarkAvatar` (breathes via `avatar-breathe`), `PendingBlock` (steps + streaming caret + `arc-shimmer`), `StepTrace`, action cards, references, hover actions. We restyle, not rebuild.
- Tokens (from Plan-1 foundation): `--canvas #16161a`, `--panel #1c1c21`, `--inset #202027`, `--accent #c8a24a` (gold), `--ok #7fb89a`, `--line` borders, `--font-serif` (Fraunces), `--ff-mono`/`--font-mono` (JetBrains Mono).
- **Design-taste rule:** gold is rare punctuation (~10%); no gradient-fill text; no >1px colored side-stripes; mono for data; one orchestrated presence animation.
- Verify with `pnpm lint`, `pnpm build`, `pnpm test`.

## Files touched

- Modify: `src/app/arc/_components/arc-chat.tsx` — remove card wrapper, full-bleed breakout.
- Modify: `src/app/arc/_components/message-list.tsx` — presence avatar, work-timeline, streaming fix, message polish, empty state.
- Modify: `src/app/globals.css` — add a non-gradient "working" shimmer utility if needed; keep `avatar-breathe`.

---

## Task 1: Full-bleed — remove the floating card

**Files:** Modify `src/app/arc/_components/arc-chat.tsx` (the outer wrapper around line 236–240, and the root at line 234).

- [ ] **Step 1: Make the root break out of content padding and fill height**

Replace the root `<div className="flex h-full min-h-0 flex-col">` (line 234) with a breakout wrapper that cancels the ConsoleFrame content padding and fills the viewport height on `lg`:

```tsx
    <div className="flex min-h-0 flex-col -mx-4 -my-4 h-[calc(100%+2rem)] sm:-mx-6 lg:-mx-8 lg:-my-5 lg:h-[calc(100vh)] xl:-mx-10">
```

- [ ] **Step 2: Strip the card chrome from the grid wrapper**

Replace the grid wrapper (line ~236–240) — remove `rounded-xl border … shadow … bg-[var(--surface-panel)]` so it is not a card; keep the grid + overflow:

```tsx
      <div
        className={`grid min-h-0 flex-1 overflow-hidden bg-[var(--canvas)] lg:grid-cols-[16rem_minmax(0,1fr)] ${
          activeId ? "2xl:grid-cols-[16rem_minmax(0,1fr)_15.5rem]" : ""
        }`}
      >
```

- [ ] **Step 3: Confirm the ThreadSwitcher (mobile top bar) still sits above the grid** — no change needed; just verify it renders.

- [ ] **Step 4: Build + visually verify full-bleed**

Run: `pnpm build` → clean. Then `pnpm dev`, open `/arc`: the chat fills edge-to-edge with no rounded card border and no outer padding gap; the thread sidebar meets the app rail; the composer anchors at the bottom.

- [ ] **Step 5: Commit**

```bash
git add src/app/arc/_components/arc-chat.tsx
git commit -m "feat(arc): full-bleed chat surface (remove floating card)"
```

---

## Task 2: Presence avatar — one calm breathing ring

**Files:** Modify `src/app/arc/_components/message-list.tsx` — the `MarkAvatar` component (lines 71–83).

- [ ] **Step 1: Restyle the avatar to a dark tile with a gold arc and a single breathing ring**

Replace `MarkAvatar` with:

```tsx
function MarkAvatar({ pending }: { pending?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.6rem] bg-[radial-gradient(120%_120%_at_30%_20%,var(--surface-raised),var(--surface-panel))] font-serif text-sm font-semibold text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--border-strong)]",
        pending ? "motion-safe:[animation:arc-ring_2.6s_cubic-bezier(.4,0,.2,1)_infinite]" : "",
      )}
    >
      M
    </span>
  );
}
```

- [ ] **Step 2: Add the `arc-ring` keyframe** to `src/app/globals.css` (near the other Arc keyframes):

```css
@keyframes arc-ring {
  0%, 100% { box-shadow: inset 0 0 0 1px var(--border-strong), 0 0 0 0 var(--accent-soft); }
  50% { box-shadow: inset 0 0 0 1px var(--border-strong), 0 0 0 5px transparent; }
}
```

- [ ] **Step 3: Use `font-serif`** — confirm the avatar `M` renders in Fraunces (the `font-serif` utility maps to `--font-serif` from Plan-1). If the utility isn't available, use `style={{ fontFamily: "var(--font-serif)" }}`.

- [ ] **Step 4: Build + commit**

```bash
pnpm build
git add src/app/arc/_components/message-list.tsx src/app/globals.css
git commit -m "feat(arc): calm breathing presence avatar"
```

---

## Task 3: Work-timeline — Arc shows his work

**Files:** Modify `src/app/arc/_components/message-list.tsx` — `StepRow` (85–99), `PendingBlock` step section (107–113), and `StepTrace` (149–165).

- [ ] **Step 1: Replace `StepRow` with a timeline node row**

```tsx
function StepRow({ step, active }: { step: MarkStep; active?: boolean }) {
  const done = step.status === "done";
  return (
    <div className="relative grid grid-cols-[1rem_1fr] items-start gap-3 pb-3.5 last:pb-0 motion-safe:[animation:msg-rise_.25s_ease-out]">
      <span aria-hidden className="absolute left-[0.45rem] top-4 h-[calc(100%-1rem)] w-px bg-[var(--border-hairline)] last:hidden" />
      <span
        aria-hidden
        className={cx(
          "z-[1] mt-0.5 flex h-[15px] w-[15px] items-center justify-center rounded-full bg-[var(--canvas)] shadow-[inset_0_0_0_1px_var(--border-strong)]",
          done ? "text-[var(--ok)] shadow-[inset_0_0_0_1px_var(--ok-border)]" : "",
          active ? "shadow-[inset_0_0_0_1px_var(--accent)]" : "",
        )}
      >
        {done ? (
          <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
        ) : active ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] motion-safe:animate-pulse" />
        ) : null}
      </span>
      <span className={cx("pt-px text-sm leading-snug", active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>{step.label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Render the active step in `PendingBlock`** — replace the `hasSteps` block (107–113) so the last step is marked active:

```tsx
      {hasSteps ? (
        <div className="flex flex-col" aria-label="What Arc is doing">
          {steps.map((s, i) => (
            <StepRow key={`${i}-${s.label}`} step={s} active={s.status !== "done" && i === steps.length - 1} />
          ))}
        </div>
      ) : null}
```

- [ ] **Step 3: Restyle the completed `StepTrace`** to the same timeline (no `border-l`):

```tsx
function StepTrace({ steps }: { steps: MarkStep[] }) {
  return (
    <details className="mt-3 text-xs text-[var(--text-muted)]">
      <summary className="cursor-pointer select-none font-mono text-[11px] hover:text-[var(--text-secondary)]">What Arc did · {steps.length}</summary>
      <div className="mt-2 flex flex-col">
        {steps.map((s, i) => (
          <StepRow key={`${i}-${s.label}`} step={{ ...s, status: "done" }} />
        ))}
      </div>
    </details>
  );
}
```

- [ ] **Step 4: Build + commit**

```bash
pnpm build
git add src/app/arc/_components/message-list.tsx
git commit -m "feat(arc): work-timeline — Arc's steps render as a connected sequence"
```

---

## Task 4: Streaming — solid text + skeleton (remove the gradient-text tell)

**Files:** Modify `src/app/arc/_components/message-list.tsx` — `PendingBlock` no-body branch (124–134).

- [ ] **Step 1: Replace the `arc-shimmer` gradient-text block** (the `!hasSteps` branch, lines 124–134) with solid label + skeleton bars (no `background-clip:text`):

```tsx
      ) : !hasSteps ? (
        <div className="flex flex-col gap-2.5" aria-label="Arc is working">
          <span className="text-sm font-medium text-[var(--text-secondary)]">Arc is working…</span>
          <div className="flex flex-col gap-2 pt-0.5">
            <div className="arc-skel" style={{ width: "92%" }} />
            <div className="arc-skel" style={{ width: "78%" }} />
            <div className="arc-skel" style={{ width: "85%" }} />
          </div>
        </div>
      ) : null}
```

- [ ] **Step 2: Add a non-gradient skeleton utility** to `src/app/globals.css`:

```css
.arc-skel {
  height: 11px;
  border-radius: 5px;
  background: var(--surface-inset);
  position: relative;
  overflow: hidden;
}
.arc-skel::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
  animation: arc-skel-slide 1.5s ease-in-out infinite;
}
@keyframes arc-skel-slide { 100% { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .arc-skel::after { animation: none; } }
```

- [ ] **Step 3:** Confirm `arc-shimmer` / `arc-shimmer-bar` are no longer referenced in `message-list.tsx` (grep). Leave the CSS classes in `globals.css` (other code may use them); we just stop using the gradient-text variant here.

- [ ] **Step 4: Build + commit**

```bash
pnpm build
git add src/app/arc/_components/message-list.tsx src/app/globals.css
git commit -m "feat(arc): solid streaming text + skeleton (drop gradient-text tell)"
```

---

## Task 5: Message + reference polish — gold as punctuation

**Files:** Modify `src/app/arc/_components/message-list.tsx` — operator bubble (293–301), name line (313–321), `MentionChips`/`References` (167–202), empty state (400–415).

- [ ] **Step 1: Quiet the operator bubble** (lines 293–296) — keep it subtle, label optional, no gold fill:

```tsx
      <div className="group flex flex-col items-end">
        <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--surface-panel)] px-4 py-2.5 text-sm leading-6 text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-strong)]">
          {message.body}
        </div>
```

- [ ] **Step 2: Arc name line uses serif** (line 315) — replace `font-display` with serif and bump to the name treatment:

```tsx
            <span className="font-serif text-[13px] font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-serif)" }}>Arc</span>
```

- [ ] **Step 3: Soften reference/mention chips** — in both `MentionChips` (172–179) and `References` (191–198), replace the chip className with a neutral hairline chip (gold only on hover), e.g.:

```tsx
          className="inline-flex items-center rounded-md bg-[var(--surface-inset)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--accent)]"
```

(Apply the same className to both components' `<Link>`.)

- [ ] **Step 4: Build + commit**

```bash
pnpm build
git add src/app/arc/_components/message-list.tsx
git commit -m "feat(arc): message + reference polish (gold as punctuation)"
```

---

## Task 6: Empty state — grounded and teaching

**Files:** Modify `src/app/arc/_components/message-list.tsx` — the `messages.length === 0` block (400–415).

- [ ] **Step 1: Restyle the empty state** with serif headline and a calmer, grounded look (no change to logic):

```tsx
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4">
        <div className="max-w-[48ch] text-center">
          <h2 className="text-2xl font-medium tracking-[-0.01em] text-[var(--text-primary)]" style={{ fontFamily: "var(--font-serif)" }}>
            What should Arc work on?
          </h2>
          <p className="mx-auto mt-3 text-sm leading-7 text-[var(--text-secondary)]">
            Ask about a campaign, a lead, or a persona. Type{" "}
            <span className="font-mono text-[var(--accent)]">@</span> to reference a record, or{" "}
            <span className="font-mono text-[var(--accent)]">/</span> for a command. Arc drafts and recommends; outbound stays locked.
          </p>
        </div>
      </div>
    );
```

- [ ] **Step 2: Build + commit**

```bash
pnpm build
git add src/app/arc/_components/message-list.tsx
git commit -m "feat(arc): grounded, teaching empty state"
```

---

## Task 7: Full verification

- [ ] **Step 1:** `pnpm test` → all pass (the Arc tests `slash-commands.test.ts`, `relative-time.test.ts`, `use-thread-poll.test.ts` are untouched and stay green).
- [ ] **Step 2:** `pnpm lint` → clean.
- [ ] **Step 3:** `pnpm build` → clean.
- [ ] **Step 4: Visual smoke** — `pnpm dev`, open `/arc`:
  - Full-bleed, no floating card, composer anchored at the bottom.
  - Send a message (or view a thread): Arc's avatar breathes once-per-cycle; steps render as a connected timeline; streaming shows solid text + caret (no shimmering gradient text); references are quiet chips.
  - Operator bubble is subtle; serif "Arc" name; hover reveals Copy/Regenerate/feedback.
  - No console errors. Reduced-motion disables animations.

---

## Self-review notes (applied)

- **Spec coverage:** §5.1 full-bleed → Task 1. §5.2 conversation (operator bubble, work-timeline, references) → Tasks 3, 5. §5.3 alive (one presence, streaming, no gradient text) → Tasks 2, 4. §5.4 taste guardrails → Tasks 2–5. §8 empty state → Task 6. Composer simplification (drop mode), structured commands, and Agent Port are **Plans 2–4** — not here.
- **No backend touched** — send pipeline, mentions, steps/actions/media, polling unchanged (spec §2).
- **Type consistency:** `MarkStep` has `{label, status: "running"|"done"}`; Task 3 reads `step.status` and synthesizes `{...s, status: "done"}` for the trace — matches the type. `MarkAvatar`/`StepRow` prop additions (`active`) are local.
- **Open item:** Task 1's full-bleed breakout uses negative margins matched to `theme.shell.content` padding; verify on `lg` that height fills without double scrollbars (the content section is `lg:h-screen lg:overflow-y-auto`; the chat manages its own internal scroll).

# Arc Chat — AI-Native Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin and extend the Arc chat surface with modern AI-chat interaction patterns (prompt-tray composer, modernized responses, elevated launcher, ⌘K slash palette, streaming reveal) — all on the existing Signal design tokens, with every data/wiring contract preserved.

**Architecture:** Pure presentation + interaction upgrade. No server actions, persistence, polling contract, or message data shape change. New pure logic (palette fuzzy filter) is unit-tested; visual components are verified by build + lint + manual checklist. 21st.dev (magic MCP) is used only for structural reference, then ported to `var(--*)` Signal tokens.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind (CSS-variable tokens in `src/app/globals.css`), `react-markdown` + `remark-gfm`, vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-10-arc-chat-ai-redesign-design.md`
**DESIGN.md guardrails (§8):** no emoji, no glow/gradient decoration, no purple/neon, no nested cards, no layout-dimension animation, `prefers-reduced-motion` safe.

---

## File Structure

- `src/app/arc/_components/slash-commands.ts` — **modify**: add a pure `filterCommands(query)` fuzzy matcher + optional `icon`/`section` fields. Source of truth for both inline popover and palette.
- `src/app/arc/_components/slash-commands.test.ts` — **modify**: add `filterCommands` tests.
- `src/app/arc/_components/command-palette.tsx` — **create**: self-contained ⌘K modal palette. Props: `open`, `onClose`, `commands`, `onSelect(cmd)`. Knows nothing about composer internals.
- `src/app/arc/_components/arc-chat.tsx` — **modify**: own palette open/close state, ⌘K listener, render `<CommandPalette>`, route selection into the composer's apply-command path via a new ref.
- `src/app/arc/_components/composer.tsx` — **modify**: prompt-tray visual rebuild; expose `applySlash` to parent via `registerApplyCommand`; add a composer-level Stop control while a reply is pending; affordance buttons for `@` and `/`.
- `src/app/arc/_components/message-list.tsx` — **modify**: code-block header + copy, restyled thinking timeline, persistent-quiet action bar, streaming reveal mask + refined caret.
- `src/app/arc/_components/empty-state.tsx` — **modify**: elevated launcher treatment.
- `src/app/globals.css` — **modify**: add `@keyframes`/classes for palette enter and streaming reveal mask. Reuse existing `msg-rise`, `arc-ring`, `arc-shimmer`.

**Note on existing assets:** `arc-shimmer` (gradient-clip text), `arc-skel`, `arc-ring`, `msg-rise` already exist in `globals.css` (lines ~323–394). Reuse them; do not duplicate.

---

## Task 1: Palette fuzzy filter (pure logic, TDD)

**Files:**
- Modify: `src/app/arc/_components/slash-commands.ts`
- Test: `src/app/arc/_components/slash-commands.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `slash-commands.test.ts`:

```ts
describe("filterCommands", () => {
  it("returns all commands for an empty query", () => {
    expect(filterCommands("")).toHaveLength(SLASH_COMMANDS.length);
  });
  it("matches against cmd, label, and hint (case-insensitive)", () => {
    const out = filterCommands("pending");
    expect(out.some((c) => c.cmd === "/whats-pending")).toBe(true);
  });
  it("is subsequence-fuzzy, not just substring", () => {
    // "dc" -> /draft-campaign (d…c subsequence across the command)
    const out = filterCommands("dc");
    expect(out.some((c) => c.cmd === "/draft-campaign")).toBe(true);
  });
  it("returns empty for no match", () => {
    expect(filterCommands("zzzzz")).toHaveLength(0);
  });
});
```

Add `filterCommands` to the import line:
```ts
import { SLASH_COMMANDS, matchSlash, filterCommands } from "./slash-commands";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/arc/_components/slash-commands.test.ts`
Expected: FAIL — `filterCommands is not a function`.

- [ ] **Step 3: Implement `filterCommands`**

Append to `slash-commands.ts` (after `matchSlash`):

```ts
/** Case-insensitive subsequence test: do all chars of `q` appear in `text` in order? */
function isSubsequence(q: string, text: string): boolean {
  let i = 0;
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] === q[i]) i++;
  }
  return i === q.length;
}

/** Palette filter: fuzzy (subsequence) match over cmd + label + hint.
 *  Empty query returns every command. Used by the ⌘K command palette. */
export function filterCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => {
    const hay = `${c.cmd} ${c.label} ${c.hint}`.toLowerCase();
    return hay.includes(q) || isSubsequence(q, hay.replace(/[^a-z0-9]/g, ""));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/arc/_components/slash-commands.test.ts`
Expected: PASS (all `matchSlash` + `filterCommands` tests green).

- [ ] **Step 5: Commit**

```bash
git add src/app/arc/_components/slash-commands.ts src/app/arc/_components/slash-commands.test.ts
git commit -m "feat(arc): fuzzy filterCommands for slash palette"
```

---

## Task 2: Command palette component

**Files:**
- Create: `src/app/arc/_components/command-palette.tsx`

- [ ] **Step 1: Create the palette component**

Create `src/app/arc/_components/command-palette.tsx`:

```tsx
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cx } from "@/app/_components/theme";
import { filterCommands, type SlashCommand } from "./slash-commands";

/** ⌘K command palette. Self-contained: filters SLASH_COMMANDS and calls
 *  onSelect with the chosen command. Keyboard: ↑/↓ move, Enter apply, Esc close. */
export function CommandPalette({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (cmd: SlashCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => filterCommands(query), [query]);

  // Reset + focus each time it opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  // Keep the active index in range as results shrink.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  if (!open) return null;

  function choose(cmd: SlashCommand | undefined) {
    if (!cmd) return;
    onSelect(cmd);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[18vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        aria-label="Close command palette"
        className="lightbox-backdrop absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="lightbox-panel relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-raised)] shadow-[var(--elev-raised)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-4 py-3">
          <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 4h10M5 10h10M5 16h6" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Run a command…"
            aria-label="Search commands"
            aria-controls={listId}
            style={{ outline: "none" }}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }}
          />
          <span className="hidden shrink-0 rounded border border-[var(--border-hairline)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline">esc</span>
        </div>

        <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No matching commands</li>
          ) : (
            results.map((c, i) => (
              <li key={c.cmd} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(c)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition",
                    i === active ? "bg-[var(--surface-inset)]" : "hover:bg-[var(--surface-inset)]",
                  )}
                >
                  <span className="font-mono text-xs font-semibold text-[var(--accent-contrast)]">{c.cmd}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{c.label}</span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">{c.hint}</span>
                  </span>
                  {i === active ? (
                    <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">↵</span>
                  ) : null}
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

- [ ] **Step 2: Typecheck/lint the new file**

Run: `pnpm lint`
Expected: PASS (no errors in `command-palette.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/app/arc/_components/command-palette.tsx
git commit -m "feat(arc): keyboard-navigable command palette component"
```

---

## Task 3: Expose composer command-apply to parent

The palette lives in `MarkChat` but applying a command must reuse the composer's
existing `applySlash` (sets prompt text + structured `command` id + mode + focus).
Expose it via a registration callback, mirroring the existing `registerSubmit`.

**Files:**
- Modify: `src/app/arc/_components/composer.tsx`

- [ ] **Step 1: Add the `registerApplyCommand` prop**

In the `Composer` props (the object after `registerSubmit?: (fn: () => void) => void;`), add:

```tsx
  registerApplyCommand?: (fn: (cmd: SlashCommand) => void) => void;
```

And update the destructured params list to include `registerApplyCommand`.

- [ ] **Step 2: Register the apply fn**

Immediately after the existing `useEffect` that calls `registerSubmit?.(...)` (around line 102–107), add:

```tsx
  useEffect(() => {
    registerApplyCommand?.((c: SlashCommand) => applySlash(c));
    // applySlash is stable enough for this registration; re-run if the registrar changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerApplyCommand]);
```

(`applySlash` is already defined below; it is a closure over `setCommand`/`onDraftChange`/`textareaRef`, all stable refs/setters.)

- [ ] **Step 3: Run build to verify types**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/arc/_components/composer.tsx
git commit -m "feat(arc): expose composer applyCommand for palette wiring"
```

---

## Task 4: Wire ⌘K palette into MarkChat

**Files:**
- Modify: `src/app/arc/_components/arc-chat.tsx`

- [ ] **Step 1: Import the palette + slash type**

Add imports near the other `_components` imports:

```tsx
import { CommandPalette } from "./command-palette";
import type { SlashCommand } from "./slash-commands";
```

- [ ] **Step 2: Add palette state + apply ref + ⌘K listener**

Inside `MarkChat`, after the existing `const submitFnRef = useRef<(() => void) | null>(null);` line, add:

```tsx
  const applyCommandRef = useRef<((cmd: SlashCommand) => void) | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
```

After the existing Escape-closes-drawer `useEffect`, add a ⌘K listener:

```tsx
  // ⌘K / Ctrl+K opens the command palette from anywhere in the chat.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
```

- [ ] **Step 3: Pass `registerApplyCommand` to the Composer**

In the `<Composer ... />` JSX, add the prop alongside `registerSubmit`:

```tsx
              registerApplyCommand={(fn) => {
                applyCommandRef.current = fn;
              }}
```

- [ ] **Step 4: Render the palette**

Just before the closing of the outer `</div>` (after the mobile thread drawer block, before the component's final `</div>`), add:

```tsx
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(cmd) => applyCommandRef.current?.(cmd)}
      />
```

- [ ] **Step 5: Verify build + manual ⌘K**

Run: `pnpm lint`
Expected: PASS.
Manual: `pnpm dev`, open `/arc`, press ⌘K → palette opens; type, ↑/↓, Enter → command text lands in composer with its chip; Esc closes.

- [ ] **Step 6: Commit**

```bash
git add src/app/arc/_components/arc-chat.tsx
git commit -m "feat(arc): wire Cmd-K command palette into chat"
```

---

## Task 5: Streaming reveal + refined caret (globals.css)

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the streaming styles**

Append after the `arc-shimmer` block (around line 389):

```css
/* Streaming reveal: soft bottom fade on Arc's in-progress reply, so chunked
   poll updates read as continuous text emerging rather than hard jumps. */
.arc-streaming {
  -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 1.6em), transparent 100%);
  mask-image: linear-gradient(180deg, #000 calc(100% - 1.6em), transparent 100%);
}
@media (prefers-reduced-motion: reduce) {
  .arc-streaming { -webkit-mask-image: none; mask-image: none; }
}

/* Writing caret at the tail of a streaming reply. */
@keyframes arc-caret-blink { 0%, 45% { opacity: 1; } 55%, 100% { opacity: 0.15; } }
.arc-caret {
  display: inline-block;
  width: 2px;
  height: 1.05em;
  vertical-align: text-bottom;
  border-radius: 1px;
  background: var(--accent);
  margin-left: 1px;
  animation: arc-caret-blink 1.1s steps(1, end) infinite;
}
@media (prefers-reduced-motion: reduce) { .arc-caret { animation: none; opacity: 0.8; } }
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm lint`
Expected: PASS (CSS is not linted by eslint, but the build must not break — confirm `pnpm dev` starts cleanly in a later task).

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(arc): streaming reveal mask + writing caret styles"
```

---

## Task 6: Apply streaming reveal in PendingBlock

**Files:**
- Modify: `src/app/arc/_components/message-list.tsx`

- [ ] **Step 1: Use the new caret + mask in the streaming branch**

In `PendingBlock`, replace the "Staged reply" block (the `hasBody` branch, currently
rendering `<MarkBody body={body} />` plus an inline caret span) with:

```tsx
      {hasBody ? (
        // Staged reply: the worker streams partial body text; render it live with a
        // bottom-fade mask + writing caret so chunked updates read as streaming.
        <div aria-label="Arc is writing" className="arc-streaming">
          <MarkBody body={body} />
          <span aria-hidden className="arc-caret" />
        </div>
      ) : !hasSteps ? (
```

(Removes the old `mt-1 inline-block h-4 w-0.5 … animate-pulse` caret in favor of the
reusable `.arc-caret`; the `.arc-streaming` wrapper adds the fade.)

- [ ] **Step 2: Verify build**

Run: `pnpm lint`
Expected: PASS.
Manual: trigger a Arc reply and confirm the tail fades + caret blinks while pending,
and the finished message renders crisp (no mask) once `status` flips off `pending`.

- [ ] **Step 3: Commit**

```bash
git add src/app/arc/_components/message-list.tsx
git commit -m "feat(arc): streaming reveal on in-progress replies"
```

---

## Task 7: Code-block header + copy in markdown renderer

**Files:**
- Modify: `src/app/arc/_components/message-list.tsx`

- [ ] **Step 1: Add a CodeBlock component**

Above the `mdComponents` definition, add:

```tsx
function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const lang = /language-(\w+)/.exec(className ?? "")?.[1] ?? "";
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLElement>(null);
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--media-void)]">
      <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{lang || "code"}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(ref.current?.innerText ?? "");
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch { /* clipboard unavailable */ }
          }}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-5 text-[var(--text-secondary)]">
        <code ref={ref} className={className}>{children}</code>
      </pre>
    </div>
  );
}
```

Add `type ReactNode`/`React` usage: ensure the file imports React types — it already
uses JSX; add `import type { ReactNode } from "react";` if `React.ReactNode` is not in
scope, and change the prop type to `ReactNode`. (The file currently imports from
`"react"` at top — extend that import.)

- [ ] **Step 2: Route fenced code through CodeBlock**

In `mdComponents`, replace the existing `pre` and `code` entries with:

```tsx
  code: ({ className, children }) => {
    // Inline code has no language- class and no newline; render the small chip.
    if (!className && !String(children).includes("\n")) {
      return <code className="rounded bg-[var(--surface-inset)] px-1 py-0.5 font-mono text-[12px] text-[var(--text-primary)]">{children}</code>;
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
  pre: ({ children }) => <>{children}</>,
```

(The `pre` passthrough avoids a `<pre>` wrapping our `CodeBlock`'s own `<pre>`.)

- [ ] **Step 3: Verify build + render**

Run: `pnpm lint`
Expected: PASS.
Manual: a Arc reply containing a fenced ```ts block renders with a language header +
working Copy; inline `code` still renders as the small chip.

- [ ] **Step 4: Commit**

```bash
git add src/app/arc/_components/message-list.tsx
git commit -m "feat(arc): code-block header with language label + copy"
```

---

## Task 8: Thinking timeline + persistent action bar

**Files:**
- Modify: `src/app/arc/_components/message-list.tsx`

- [ ] **Step 1: Persistent-but-quiet action bar**

In `Message` (the Arc/system branch), the action row currently wraps in
`opacity-0 … group-hover:opacity-100`. Replace that wrapper's className so it is
always visible but low-contrast, brightening on hover:

```tsx
          <div className="mt-1.5 flex items-center gap-1 text-[var(--text-muted)] opacity-70 transition group-hover:opacity-100 focus-within:opacity-100">
```

(Leave the inner buttons unchanged — they already brighten on hover.)

- [ ] **Step 2: Restyle the completed step trace**

In `StepTrace`, replace the `<summary>` className to read as a calm "thinking"
disclosure (mono, subtle), and keep the timeline rows:

```tsx
      <summary className="flex cursor-pointer select-none items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]">
        <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7l6 6 6-6" /></svg>
        Reasoning · {steps.length} step{steps.length === 1 ? "" : "s"}
      </summary>
```

(The `StepRow` connector/nodes already render a clean vertical timeline; no change
needed there. This relabels "What Arc did" → "Reasoning" with a chevron affordance.)

- [ ] **Step 3: Verify build + render**

Run: `pnpm lint`
Expected: PASS.
Manual: completed replies show a faint always-on action bar; the reasoning disclosure
shows a chevron + "Reasoning · N steps" and expands to the timeline.

- [ ] **Step 4: Commit**

```bash
git add src/app/arc/_components/message-list.tsx
git commit -m "feat(arc): persistent action bar + reasoning timeline restyle"
```

---

## Task 9: Composer prompt-tray rebuild + composer-level Stop

The composer keeps its full interface and all behavior; this restyles the tray and
adds (a) discoverable `@`//`/` affordance buttons and (b) a Stop control that replaces
Send while a reply is pending.

**Files:**
- Modify: `src/app/arc/_components/composer.tsx`
- Modify: `src/app/arc/_components/arc-chat.tsx` (pass pending state + onStop to composer)

- [ ] **Step 1: Tell the composer when a reply is pending**

In `arc-chat.tsx`, compute a pending flag from messages and pass it (plus the existing
`handleStop`) to the composer. Add near the `meta` computation:

```tsx
  const replyPending = messages.some((m) => m.role === "arc" && m.status === "pending");
```

In the `<Composer ... />` JSX add:

```tsx
              replyPending={replyPending}
              onStopReply={handleStop}
```

- [ ] **Step 2: Accept the new props in Composer**

Add to the `Composer` props type:

```tsx
  replyPending?: boolean;
  onStopReply?: () => void;
```

Destructure `replyPending` and `onStopReply` in the params.

- [ ] **Step 3: Add `@` and `/` affordance buttons + Stop/Send swap**

Replace the control row (`<div className="flex items-end gap-2"> … </div>`, the attach
button + textarea + submit button) with this version. It keeps the attach button, file
input, and textarea exactly as they are, adds two affordance buttons, and swaps Send →
Stop when `replyPending`:

```tsx
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Attach image"
              title="Attach a reference image"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4.5" width="14" height="11" rx="2" />
                <circle cx="7.5" cy="9" r="1.4" />
                <path d="M4 14l3.5-3.5 2.5 2.5 2-2 4 4" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Mention a record"
              title="Reference a record"
              onClick={() => { onTextChange((draft ? draft.replace(/\s*$/, " ") : "") + "@"); textareaRef.current?.focus(); }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-base text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
            >
              @
            </button>
            <button
              type="button"
              aria-label="Run a command"
              title="Run a command"
              onClick={() => { onTextChange("/"); textareaRef.current?.focus(); }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-base text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
            >
              /
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} className="hidden" />
            <textarea
              ref={textareaRef}
              name="body-display"
              value={draft}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && query === null && slash === null) {
                  e.preventDefault();
                  if (!disabled) formRef.current?.requestSubmit();
                }
              }}
              rows={1}
              placeholder="Message Arc…"
              style={{ outline: "none" }}
              className="max-h-[200px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            {replyPending ? (
              <button
                type="button"
                onClick={() => onStopReply?.()}
                aria-label="Stop Arc"
                title="Stop"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--priority-bright)] active:scale-95"
              >
                <span aria-hidden className="h-3 w-3 rounded-[2px] bg-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={disabled}
                aria-label="Send message"
                className={cx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition duration-200 ease-out",
                  disabled
                    ? "cursor-not-allowed bg-[var(--surface-raised)] text-[var(--text-muted)]"
                    : "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-strong)] active:scale-95",
                )}
              >
                {isPending ? <Spinner /> : <SendIcon />}
              </button>
            )}
          </div>
```

- [ ] **Step 4: Tray surface polish**

On the tray container `<div className="flex flex-col gap-2 rounded-2xl border …">`,
keep the structure but bump presence to read as the centerpiece: change
`bg-[var(--surface-inset)]` → `bg-[var(--surface-panel)]` and `rounded-2xl` →
`rounded-[1.25rem]`, keeping the existing `focus-within:border-[var(--accent)]` and
`shadow-[var(--elev-panel)]`. (Single-line className edit; no structural change.)

- [ ] **Step 5: Verify build + behavior**

Run: `pnpm lint`
Expected: PASS.
Manual: `@`/`/` buttons open their popovers and focus the textarea; Send works; during
a pending Arc reply the Send button becomes a Stop square that cancels the reply;
attachments, mentions, command chip, error banner, hints row all unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/app/arc/_components/composer.tsx src/app/arc/_components/arc-chat.tsx
git commit -m "feat(arc): prompt-tray composer with affordances + inline Stop"
```

---

## Task 10: Empty-state launcher refresh

**Files:**
- Modify: `src/app/arc/_components/empty-state.tsx`

- [ ] **Step 1: Add a one-line framing under the hero**

In `ChatEmptyHero`, after the `<h2>`, add a subtitle (keeps greeting + heading):

```tsx
      <p className="max-w-[46ch] text-sm leading-6 text-[var(--text-secondary)]">
        Ask about a campaign, lead, or persona. Arc drafts and recommends — outbound stays locked until you approve.
      </p>
```

- [ ] **Step 2: Refresh the shortcut cards**

In `ChatEmptyShortcuts`, update the card `<button>` className to a calmer panel
treatment with a framed icon (no glow, no levitation):

```tsx
          className="group flex items-start gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 py-3.5 text-left transition hover:border-[var(--accent-border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
```

And wrap the icon `<svg>` in a framed square. Replace the bare `<svg …>{s.icon}</svg>`
with:

```tsx
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-inset)] text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--border-strong)]">
            <svg viewBox="0 0 20 20" aria-hidden className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {s.icon}
            </svg>
          </span>
```

(Keep the existing label/hint/badge span exactly as-is.)

- [ ] **Step 3: Verify build + render**

Run: `pnpm lint`
Expected: PASS.
Manual: `/arc` (new chat) shows greeting + subtitle + 4 framed-icon cards; the
"Review pending" badge still reflects `pendingApprovals`; clicking a card fills the
composer.

- [ ] **Step 4: Commit**

```bash
git add src/app/arc/_components/empty-state.tsx
git commit -m "feat(arc): elevated empty-state launcher"
```

---

## Task 11: Full verification + guardrail review

**Files:** none (verification only)

- [ ] **Step 1: Run the test suite**

Run: `pnpm test`
Expected: PASS (slash-commands incl. `filterCommands`, relative-time, use-thread-poll,
and all other suites green).

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS, no warnings introduced in `src/app/arc/`.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: build completes with no type errors.

- [ ] **Step 4: Manual smoke (dev)**

Run: `pnpm dev`, then exercise on `/arc`:
- New-chat launcher: greeting, subtitle, 4 cards, pending badge.
- Send a first message → optimistic bubble → navigates to `?c=` thread (no hero flash).
- Pending reply: streaming reveal mask + caret; Stop from composer cancels.
- Completed reply: code-block header + copy, "Reasoning · N steps" disclosure,
  always-on faint action bar (copy/regenerate/feedback).
- ⌘K palette: open, fuzzy filter, ↑/↓, Enter applies command + chip; Esc closes.
- `@` and `/` affordance buttons open popovers.
- Mobile width: thread drawer toggle, tray responsive, hints row collapses.
- Reduced motion (OS setting): caret static, no mask, no shimmer.

- [ ] **Step 5: DESIGN.md §8 guardrail diff**

Run: `git diff main --stat` and review the diff for: no emoji, no gradient/glow
decoration, no purple/neon, no nested cards, no `hover:-translate-y`, no animated
layout dimensions. Fix any violation inline.

- [ ] **Step 6: Final commit (if any guardrail fixes)**

```bash
git add -A
git commit -m "chore(arc): redesign guardrail polish"
```

---

## Self-Review Notes (author)

- **Spec coverage:** Unit 1 (composer)→Task 9; Unit 2 (responses)→Tasks 6–8; Unit 3
  (launcher)→Task 10; Unit 4 (palette)→Tasks 1–4; Unit 5 (streaming)→Tasks 5–6; Unit 6
  (plumbing)→Tasks 5 + parts of 9/10. All covered.
- **Type consistency:** `filterCommands` (Task 1) consumed by `CommandPalette` (Task 2);
  `registerApplyCommand` defined (Task 3) and called (Task 4); `replyPending`/`onStopReply`
  defined and passed (Task 9) consistently. `applySlash`/`onTextChange` are existing
  composer functions reused, not renamed.
- **No placeholders:** every code step shows full code; commands have expected output.
- **Risk note:** Task 9 touches the load-bearing composer; the prop interface is only
  extended (additive), and the "one stable tree slot" invariant in `MarkChat` is
  untouched (composer is not remounted).
```

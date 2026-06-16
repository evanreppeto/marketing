# Arc Premium — States & Composer Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Arc chat feel premium and alive — an adaptive "thinking" state, an input-first empty screen, a composer with slash-commands + a mode picker + keyboard hints, and a richer message toolbar (regenerate + feedback) — all degrading gracefully without Arc-worker changes.

**Architecture:** App-side only. New affordances ride the existing `arc_messages.metadata`/`agent_tasks.metadata` jsonb (no migration). The composer sends a `mode`; the worker honors it later. Adaptive waiting renders the existing `steps` with a skeleton fallback.

**Tech Stack:** Next.js 16 (server actions), React 19, TypeScript, Supabase (service-role), vitest, Tailwind v4 (`globals.css` CSS vars), Signal design system (`DESIGN.md`, no emojis).

**Spec:** `docs/superpowers/specs/2026-06-09-arc-chat-premium-experience-design.md`
**Companion plan (next):** Plan 2 — Action cards.

---

## File map

- Modify `src/domain/arc-chat.ts` — `ArcMode` type + `parseArcMode`; export both.
- Modify `src/domain/index.ts` — re-export `ArcMode`, `parseArcMode` (verify barrel).
- Create `src/domain/__tests__/arc-mode.test.ts` — `parseArcMode` unit tests.
- Modify `src/lib/arc-chat/persistence.ts` — `feedback` on `MarkMessage` + parse; `setMarkMessageFeedback`.
- Modify `src/lib/arc-chat/persistence.test.ts` — `setMarkMessageFeedback` test.
- Modify `src/lib/arc-chat/enqueue.ts` — `mode` on input + into `agent_tasks.metadata`.
- Modify `src/lib/arc-chat/notify.ts` — `mode` on payload.
- Modify `src/app/arc/actions.ts` — thread `mode`; `setMarkMessageFeedbackAction`; `regenerateMarkReplyAction`.
- Modify `src/app/globals.css` — `progress-sweep` keyframe (+ reduced-motion).
- Modify `src/app/arc/_components/message-list.tsx` — adaptive `PendingBlock`; toolbar regenerate + feedback.
- Create `src/app/arc/_components/slash-commands.ts` — slash registry + resolver (+ test).
- Create `src/app/arc/_components/slash-commands.test.ts`.
- Modify `src/app/arc/_components/composer.tsx` — `/` popover, keyboard hints, mode picker, send `mode`.
- Modify `src/app/arc/_components/empty-state.tsx` — input-first layout (hosts composer slot).
- Modify `src/app/arc/_components/arc-chat.tsx` — conditional composer placement; pass regenerate/feedback.
- Create `docs/arc-worker-contract-premium.md` — steps + mode contract for Arc's worker.

---

## Task 1: Domain — `ArcMode` + `parseArcMode` (TDD)

**Files:**
- Modify: `src/domain/arc-chat.ts`
- Modify: `src/domain/index.ts`
- Test: `src/domain/__tests__/arc-mode.test.ts` (create)

- [ ] **Step 1: Write the failing test** — `src/domain/__tests__/arc-mode.test.ts`

```typescript
import { describe, expect, it } from "vitest";

import { parseArcMode } from "../arc-chat";

describe("parseArcMode", () => {
  it("accepts the three valid modes", () => {
    expect(parseArcMode("ask")).toBe("ask");
    expect(parseArcMode("act")).toBe("act");
    expect(parseArcMode("draft")).toBe("draft");
  });
  it("defaults unknown / empty / non-string to 'ask'", () => {
    expect(parseArcMode("nonsense")).toBe("ask");
    expect(parseArcMode("")).toBe("ask");
    expect(parseArcMode(undefined)).toBe("ask");
    expect(parseArcMode(42)).toBe("ask");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/domain/__tests__/arc-mode.test.ts`
Expected: FAIL — `parseArcMode` not exported.

- [ ] **Step 3: Implement** — add to the END of `src/domain/arc-chat.ts`:

```typescript
export type ArcMode = "ask" | "act" | "draft";

const ARC_MODES: readonly ArcMode[] = ["ask", "act", "draft"];

/** Parse the composer's stance; anything unrecognized falls back to read-only "ask". */
export function parseArcMode(value: unknown): ArcMode {
  return typeof value === "string" && (ARC_MODES as readonly string[]).includes(value)
    ? (value as ArcMode)
    : "ask";
}
```

- [ ] **Step 4: Re-export from the barrel** — in `src/domain/index.ts`, find the line that re-exports from `./arc-chat` (e.g. `export * from "./arc-chat";` or a named list). If it is `export * from "./arc-chat";`, nothing to change. If it is a named re-export list, add `ArcMode` (type) and `parseArcMode` to it. Verify by grepping: `grep -n "arc-chat" src/domain/index.ts`.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run src/domain/__tests__/arc-mode.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain/arc-chat.ts src/domain/index.ts src/domain/__tests__/arc-mode.test.ts
git commit -m "feat(arc-chat): ArcMode + parseArcMode (ask/act/draft, default ask)"
```

---

## Task 2: Persistence — message `feedback` + `setMarkMessageFeedback` (TDD)

**Files:**
- Modify: `src/lib/arc-chat/persistence.ts`
- Test: `src/lib/arc-chat/persistence.test.ts`

- [ ] **Step 1: Add the failing test** — append to `src/lib/arc-chat/persistence.test.ts` (add the imports `setMarkMessageFeedback` to the existing `./persistence` import at the top of that file):

```typescript
describe("setMarkMessageFeedback", () => {
  it("writes feedback merged into existing metadata, scoped by id", async () => {
    const supabase = createSupabaseQueryMock({
      arc_messages: { data: { id: "m1", metadata: { steps: [] } }, error: null },
    });

    await setMarkMessageFeedback("m1", "up", supabase);

    const update = calls(supabase, "update")[0];
    expect(update.metadata).toMatchObject({ steps: [], feedback: "up" });
    expect(supabase.calls).toContainEqual(["eq", "id", "m1"]);
  });

  it("clears feedback when value is null", async () => {
    const supabase = createSupabaseQueryMock({
      arc_messages: { data: { id: "m1", metadata: { feedback: "up" } }, error: null },
    });

    await setMarkMessageFeedback("m1", null, supabase);

    const update = calls(supabase, "update")[0];
    expect(update.metadata).toMatchObject({ feedback: null });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/lib/arc-chat/persistence.test.ts`
Expected: FAIL — `setMarkMessageFeedback` not exported.

- [ ] **Step 3: Add `feedback` to the type + mapper.** In `src/lib/arc-chat/persistence.ts`:

Add to `MarkMessage` (after `steps: MarkStep[];`):
```typescript
  feedback: "up" | "down" | null;
```

In `toMessage`, add after the `steps:` line:
```typescript
    feedback:
      (row.metadata as { feedback?: unknown } | null)?.feedback === "up"
        ? "up"
        : (row.metadata as { feedback?: unknown } | null)?.feedback === "down"
          ? "down"
          : null,
```

- [ ] **Step 4: Add the IO helper.** Add after `appendMarkStep` (end of the steps section):

```typescript
export async function setMarkMessageFeedback(
  messageId: string,
  value: "up" | "down" | null,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { data, error } = await client
    .from("arc_messages")
    .select("id, metadata")
    .eq("id", messageId)
    .maybeSingle<{ id: string; metadata: Record<string, unknown> | null }>();
  assertOk("arc_messages feedback lookup", error);
  if (!data) return;
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const { error: upErr } = await client
    .from("arc_messages")
    .update({ metadata: { ...meta, feedback: value } })
    .eq("id", messageId);
  assertOk("arc_messages feedback update", upErr);
}
```

- [ ] **Step 5: Fix `MarkMessage` literals.** Grep for places building a `MarkMessage` object literal that now need `feedback`:
Run: `grep -rn "status: \"sent\"" src/app/arc/_components/composer.tsx` (the `tempMessage` helper). Add `feedback: null,` to that literal (after `steps: [],`). Also check `grep -rn "steps: \[\]," src` for any other literal and add `feedback: null,` where a `MarkMessage` is constructed by hand.

- [ ] **Step 6: Run to verify pass**

Run: `pnpm vitest run src/lib/arc-chat/persistence.test.ts && pnpm lint`
Expected: PASS (existing + 2 new); lint clean (no missing-property errors on `MarkMessage` literals).

- [ ] **Step 7: Commit**

```bash
git add src/lib/arc-chat/persistence.ts src/lib/arc-chat/persistence.test.ts src/app/arc/_components/composer.tsx
git commit -m "feat(arc-chat): message feedback field + setMarkMessageFeedback"
```

---

## Task 3: globals.css — `progress-sweep` keyframe

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the keyframe + class.** Immediately AFTER the `.arc-shimmer { ... }` rule (added in the foundation pass, in the "Arc chat motion" group), add:

```css
@keyframes progress-sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(320%); }
}
.arc-progress {
  height: 3px;
  border-radius: 3px;
  background: var(--surface-inset);
  overflow: hidden;
}
.arc-progress > span {
  display: block;
  height: 100%;
  width: 32%;
  border-radius: 3px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: progress-sweep 1.4s ease-in-out infinite;
}
```

- [ ] **Step 2: Respect reduced motion.** In the existing `@media (prefers-reduced-motion: reduce)` block, add `.arc-progress > span` to the `animation: none;` selector list (alongside `.arc-shimmer`), and give the bar a static fill so it still reads as "in progress":

```css
  .arc-progress > span {
    animation: none;
    width: 100%;
    opacity: 0.4;
  }
```
(Insert this rule inside the media block, before the `.signal-radar::after` rule. Append `.arc-progress > span` to the shared `animation: none` selector list OR use this standalone rule — either is fine as long as it ends up `animation: none` under reduced motion.)

- [ ] **Step 3: Verify**

Run: `pnpm lint`
Expected: PASS (CSS not linted by ESLint; confirms nothing else broke). Re-read your edit: balanced braces, `.signal-radar::after` still appears exactly once.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(arc-chat): progress-sweep keyframe for the waiting state (reduced-motion safe)"
```

---

## Task 4: Adaptive waiting state (`PendingBlock`)

**Files:**
- Modify: `src/app/arc/_components/message-list.tsx`

Re-read the file first. Replace the `PendingBlock` function (currently steps-or-shimmer) with an adaptive version: breathing avatar stays (it's on `MarkAvatar`); when there are no steps, show skeleton lines + the progress sweep; when steps exist, show the timeline. Timer + Stop stay.

- [ ] **Step 1: Replace `PendingBlock`** with:

```tsx
function PendingBlock({ steps, onStop }: { steps: MarkStep[]; onStop: () => void }) {
  const elapsed = useElapsed(true);
  const hasSteps = steps.length > 0;
  return (
    <div className="flex flex-col gap-2">
      {hasSteps ? (
        <div className="relative flex flex-col gap-1.5 border-l border-[var(--border-hairline)] pl-3" aria-label="What Arc is doing">
          {steps.map((s, i) => (
            <StepRow key={`${i}-${s.label}`} step={s} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2" aria-label="Arc is working">
          <span className="arc-shimmer text-sm font-medium">Arc is thinking…</span>
          <div className="flex flex-col gap-2 pt-0.5">
            <div className="arc-shimmer-bar" style={{ width: "92%" }} />
            <div className="arc-shimmer-bar" style={{ width: "78%" }} />
            <div className="arc-shimmer-bar" style={{ width: "85%" }} />
          </div>
          <div className="arc-progress mt-0.5"><span /></div>
        </div>
      )}
      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span className="tabular-nums">{elapsed}</span>
        <button
          type="button"
          onClick={onStop}
          className="rounded-md border border-[var(--border-hairline)] px-2 py-0.5 font-semibold transition hover:border-[var(--priority-bright)] hover:text-[var(--priority-bright)]"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the skeleton-line class to globals.css.** In `src/app/globals.css`, after the `.arc-progress` rules, add:

```css
.arc-shimmer-bar {
  height: 11px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--surface-inset) 0%, var(--surface-raised) 50%, var(--surface-inset) 100%);
  background-size: 200% 100%;
  animation: text-shimmer 1.6s linear infinite;
}
```
And add `.arc-shimmer-bar` to the reduced-motion `animation: none` selector list (it stays a flat bar — still reads as a placeholder).

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm vitest run src/app/arc`
Expected: PASS. Manually (`pnpm dev`, send a message with no steps coming back): the pending bubble now shows shimmer text + three skeleton lines + a sweeping progress bar, not a lone line.

- [ ] **Step 4: Commit**

```bash
git add src/app/arc/_components/message-list.tsx src/app/globals.css
git commit -m "feat(arc-chat): adaptive waiting state — skeleton + progress, morphs to steps"
```

---

## Task 5: Thread `mode` through send → enqueue → notify

**Files:**
- Modify: `src/lib/arc-chat/enqueue.ts`
- Modify: `src/lib/arc-chat/notify.ts`
- Modify: `src/app/arc/actions.ts`

- [ ] **Step 1: `enqueue.ts` — accept + persist mode.** Add `mode` to `EnqueueChatTaskInput`:
```typescript
  /** Operator stance for this message; the worker decides what Arc may do. */
  mode?: "ask" | "act" | "draft";
```
In the `agent_tasks` insert `metadata` object, add after `model_route: input.route ?? "fast",`:
```typescript
        mode: input.mode ?? "ask",
```

- [ ] **Step 2: `notify.ts` — carry mode in the payload.** Add to `ArcNotifyPayload`:
```typescript
  /** Operator stance (ask/act/draft); advisory for Arc's worker. */
  mode: "ask" | "act" | "draft";
```
(The payload is already spread into the POST body via `{ type: "arc_chat_message", ...payload }`, so no body change is needed.)

- [ ] **Step 3: `actions.ts` — read + thread mode.** In `sendMarkMessageAction` (re-read it first):
- Import `parseArcMode` by adding it to the existing `@/domain` import.
- After the `mentions` parse line, add:
```typescript
  const mode = parseArcMode(formData.get("mode"));
```
- Pass `mode` into the `enqueueMarkChatTask({ ... })` call (add `mode,`).
- Pass `mode` into the `notifyMarkWebhook({ ... })` call (add `mode,`).

- [ ] **Step 4: Verify**

Run: `pnpm lint && pnpm vitest run`
Expected: PASS (no type errors; `notifyMarkWebhook` callers now supply `mode`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/arc-chat/enqueue.ts src/lib/arc-chat/notify.ts src/app/arc/actions.ts
git commit -m "feat(arc-chat): thread operator mode (ask/act/draft) through send/enqueue/notify"
```

---

## Task 6: Server actions — feedback + regenerate

**Files:**
- Modify: `src/app/arc/actions.ts`

- [ ] **Step 1: Extend imports.** Add `setMarkMessageFeedback` and `findPendingMessageByTask` are not needed; add `setMarkMessageFeedback` and `listMessages` (already imported) — specifically add `setMarkMessageFeedback` to the `@/lib/arc-chat/persistence` import.

- [ ] **Step 2: Add `setMarkMessageFeedbackAction`.** Append to `actions.ts`:

```typescript
export async function setMarkMessageFeedbackAction(
  messageId: string,
  value: "up" | "down" | null,
): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = messageId.trim();
  if (!id) return;
  await setMarkMessageFeedback(id, value).catch(() => undefined);
  revalidatePath("/arc");
}
```

- [ ] **Step 3: Add `regenerateMarkReplyAction`.** This re-runs the operator turn that produced a given Arc reply: it finds the operator message immediately before that reply and re-enqueues a fresh task + pending bubble (mirrors the tail of `sendMarkMessageAction`). Append:

```typescript
/** Re-run the operator turn that produced `markMessageId`: enqueue a fresh task
 *  and pending bubble for the preceding operator message. Best-effort. */
export async function regenerateMarkReplyAction(
  conversationId: string,
  markMessageId: string,
): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const convId = conversationId.trim();
  if (!convId) return;

  const client = getSupabaseAdminClient();
  let messages;
  try {
    messages = await listMessages(convId, client);
  } catch {
    return;
  }
  const idx = messages.findIndex((m) => m.id === markMessageId);
  const slice = idx === -1 ? messages : messages.slice(0, idx);
  const lastOperator = [...slice].reverse().find((m) => m.role === "operator");
  if (!lastOperator) return;

  const operator = getOperatorActor();
  try {
    const agentTaskId = await enqueueMarkChatTask(
      {
        conversationId: convId,
        messageId: lastOperator.id,
        message: lastOperator.body,
        mentions: lastOperator.mentions,
        operator,
        route: "fast",
        mode: "ask",
      },
      client,
    );
    await insertPendingMarkMessage({ conversationId: convId, agentTaskId }, client);
    const delivered = await notifyMarkWebhook({
      messageId: lastOperator.id,
      conversationId: convId,
      agentTaskId,
      message: lastOperator.body,
      mentions: lastOperator.mentions,
      operator,
      route: "fast",
      mode: "ask",
    });
    if (delivered) await claimChatTask(agentTaskId, client).catch(() => false);
  } catch {
    /* best-effort: leave the thread as-is if Arc can't be reached */
  }
  revalidatePath("/arc");
}
```

(`enqueueMarkChatTask`, `insertPendingMarkMessage`, `notifyMarkWebhook`, `claimChatTask`, `getOperatorActor`, `getSupabaseAdminClient`, `listMessages`, `revalidatePath` are all already imported in `actions.ts` from the foundation pass — verify before adding new imports.)

- [ ] **Step 4: Verify**

Run: `pnpm lint && pnpm vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/arc/actions.ts
git commit -m "feat(arc-chat): setMarkMessageFeedbackAction + regenerateMarkReplyAction"
```

---

## Task 7: Slash-command registry (TDD)

**Files:**
- Create: `src/app/arc/_components/slash-commands.ts`
- Test: `src/app/arc/_components/slash-commands.test.ts`

- [ ] **Step 1: Write the failing test** — `slash-commands.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { SLASH_COMMANDS, matchSlash } from "./slash-commands";

describe("matchSlash", () => {
  it("returns null when text isn't a leading slash query", () => {
    expect(matchSlash("hello")).toBeNull();
    expect(matchSlash("what /find")).toBeNull();
  });
  it("returns all commands for a bare slash", () => {
    expect(matchSlash("/")).toHaveLength(SLASH_COMMANDS.length);
  });
  it("filters by the typed query (cmd or label)", () => {
    const out = matchSlash("/find");
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((c) => c.cmd.includes("find") || c.label.toLowerCase().includes("find"))).toBe(true);
  });
  it("draft-campaign presets draft mode", () => {
    const draft = SLASH_COMMANDS.find((c) => c.cmd === "/draft-campaign");
    expect(draft?.mode).toBe("draft");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/app/arc/_components/slash-commands.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `slash-commands.ts`:

```typescript
import type { ArcMode } from "@/domain";

export type SlashCommand = {
  cmd: string;            // e.g. "/find-leads"
  label: string;          // menu title
  hint: string;           // menu subtitle
  prompt: string;         // inserted into the draft on select
  mode?: ArcMode;        // optional stance to preset
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "/find-leads", label: "Find leads", hint: "Search & propose new leads", prompt: "Find new leads for @" },
  { cmd: "/draft-campaign", label: "Draft a campaign", hint: "Draft for a persona — for your approval", prompt: "Draft a campaign for @", mode: "draft" },
  { cmd: "/whats-pending", label: "What's pending", hint: "Everything awaiting approval", prompt: "What's awaiting my approval right now, and the risk on each?" },
  { cmd: "/summarize", label: "Summarize", hint: "Summarize a campaign or thread", prompt: "Summarize my latest campaign — status, pending approvals, and what's next." },
];

/** When `text` is a leading `/query` (no spaces yet), return matching commands;
 *  otherwise null (popover closed). Matches against cmd and label. */
export function matchSlash(text: string): SlashCommand[] | null {
  const m = /^\/([\w-]*)$/.exec(text);
  if (!m) return null;
  const q = m[1].toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.cmd.slice(1).includes(q) || c.label.toLowerCase().includes(q));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/app/arc/_components/slash-commands.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/arc/_components/slash-commands.ts src/app/arc/_components/slash-commands.test.ts
git commit -m "feat(arc-chat): slash-command registry + matchSlash resolver"
```

---

## Task 8: Composer — slash popover, keyboard hints, mode picker, send mode

**Files:**
- Modify: `src/app/arc/_components/composer.tsx`

Re-read the composer first. This adds: a `/`-triggered popover (reusing the popover slot above the input), a mode-picker chip + hidden `mode` field, and a keyboard-hint line. The existing `@`-mention popover stays.

- [ ] **Step 1: Imports + state.** Add to the top imports:
```typescript
import type { ArcMode } from "@/domain";
import { SLASH_COMMANDS, matchSlash, type SlashCommand } from "./slash-commands";
```
Inside `Composer`, after the `const [query, setQuery] = useState<string | null>(null);` line, add:
```typescript
  const [slash, setSlash] = useState<SlashCommand[] | null>(null); // non-null when the /-popover is open
  const [mode, setMode] = useState<ArcMode>("ask");
  const [modeOpen, setModeOpen] = useState(false);
```

- [ ] **Step 2: Detect `/` in `onTextChange`.** Replace the body of `onTextChange` with:
```typescript
  function onTextChange(value: string) {
    onDraftChange(value);
    const at = /@([\w-]*)$/.exec(value);
    setQuery(at ? at[1] : null);
    setSlash(matchSlash(value));
  }
```

- [ ] **Step 3: Apply a slash command.** Add this handler next to `addMention`:
```typescript
  function applySlash(c: SlashCommand) {
    onDraftChange(c.prompt);
    if (c.mode) setMode(c.mode);
    setSlash(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(c.prompt.length, c.prompt.length);
    });
  }
```

- [ ] **Step 4: Hidden `mode` field.** After the existing `<input type="hidden" name="mentions" .../>`, add:
```tsx
        <input type="hidden" name="mode" value={mode} />
```

- [ ] **Step 5: Slash popover.** Directly AFTER the existing `@`-mention popover block (`{query !== null && suggestions.length > 0 ? (...) : null}`), add a sibling:
```tsx
        {slash && slash.length > 0 ? (
          <div className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]">
            {slash.map((c) => (
              <button
                key={c.cmd}
                type="button"
                onClick={() => applySlash(c)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[var(--surface-inset)]"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[var(--accent-contrast)]">{c.cmd}</span>
                  <span className="text-[var(--text-secondary)]">{c.label}</span>
                </span>
                <span className="truncate text-[11px] text-[var(--text-muted)]">{c.hint}</span>
              </button>
            ))}
          </div>
        ) : null}
```

- [ ] **Step 6: Mode picker chip.** Inside the input row `<div className="flex items-end gap-2">`, BEFORE the reserved attach button, add a relative-positioned mode control:
```tsx
            <div className="relative">
              <button
                type="button"
                onClick={() => setModeOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={modeOpen}
                className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                {mode === "ask" ? "Ask" : mode === "act" ? "Take action" : "Draft"}
                <span className="text-[10px] text-[var(--text-muted)]">▾</span>
              </button>
              {modeOpen ? (
                <div role="menu" className="msg-rise absolute bottom-10 left-0 z-20 w-56 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]">
                  {([
                    { v: "ask", t: "Ask", d: "Read-only — answers & analysis" },
                    { v: "act", t: "Take action", d: "May add or update records" },
                    { v: "draft", t: "Draft", d: "Create drafts for your approval" },
                  ] as const).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      role="menuitem"
                      onClick={() => { setMode(o.v); setModeOpen(false); }}
                      className={cx(
                        "flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left transition hover:bg-[var(--surface-inset)]",
                        mode === o.v ? "bg-[var(--accent-soft)]" : "",
                      )}
                    >
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{o.t}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{o.d}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
```

- [ ] **Step 7: Close the mode menu on outside-click / Escape.** Add an effect near the other effects:
```typescript
  useEffect(() => {
    if (!modeOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setModeOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modeOpen]);
```
(Outside-click is covered by the textarea regaining focus; Escape is the primary close. Keep it minimal.)

- [ ] **Step 8: Keyboard-hint line + close slash on Enter.** In the `<textarea>` `onKeyDown`, the Enter branch currently checks `query === null`; also require the slash popover closed — change the condition to `if (e.key === "Enter" && !e.shiftKey && query === null && slash === null)`. Then REPLACE the helper-text block at the bottom (the `{state && !state.ok ? (...) : (...)}`) with:
```tsx
        {state && !state.ok ? (
          <p className="mt-2 text-center text-xs font-semibold text-[var(--priority-bright)]">{state.message}</p>
        ) : (
          <p className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-[11px] text-[var(--text-muted)]">
            <span><span className="font-mono">↵</span> send</span>
            <span><span className="font-mono">⇧↵</span> newline</span>
            <span><span className="font-mono">/</span> commands</span>
            <span><span className="font-mono">@</span> records</span>
            <span>outbound stays locked</span>
          </p>
        )}
```

- [ ] **Step 9: Reset mode/slash on successful send.** In the send-complete effect (the `if (state.ok)` block), inside the `void Promise.resolve().then(() => { ... })`, add `setSlash(null);` (leave `mode` as the operator's chosen stance — sticky across sends is the right default).

- [ ] **Step 10: Verify**

Run: `pnpm lint && pnpm vitest run src/app/arc`
Expected: PASS. Manually: typing `/` opens the command menu; selecting `/draft-campaign` fills the prompt and flips the chip to "Draft"; the chip menu switches modes; hint line shows; a hidden `mode` field is submitted.

- [ ] **Step 11: Commit**

```bash
git add src/app/arc/_components/composer.tsx
git commit -m "feat(arc-chat): composer slash commands, mode picker, keyboard hints"
```

---

## Task 9: Message toolbar — Regenerate + 👍/👎

**Files:**
- Modify: `src/app/arc/_components/message-list.tsx`
- Modify: `src/app/arc/_components/arc-chat.tsx`

- [ ] **Step 1: `arc-chat.tsx` — add a regenerate handler + import.** Add `regenerateMarkReplyAction` to the `../actions` import. Add a handler near `handleStop`:
```typescript
  async function handleRegenerate(markMessageId: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-pending-${markMessageId}`,
        conversationId: activeId,
        role: "arc",
        body: "",
        status: "pending",
        agentTaskId: null,
        mentions: [],
        media: [],
        steps: [],
        feedback: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    await regenerateMarkReplyAction(activeId, markMessageId);
  }
```
Pass it to `<MessageList>` (add `onRegenerate={handleRegenerate}`).

- [ ] **Step 2: `message-list.tsx` — thread `onRegenerate`.** Change `MessageList` and `Message` signatures to accept `onRegenerate: (markMessageId: string) => void` and pass it down (`<Message ... onRegenerate={onRegenerate} />`).

- [ ] **Step 3: `message-list.tsx` — add a FeedbackButtons component.** After `CopyButton`, add:
```tsx
function FeedbackButtons({ messageId, current }: { messageId: string; current: "up" | "down" | null }) {
  const [value, setValue] = useState(current);
  function set(next: "up" | "down") {
    const v = value === next ? null : next;
    setValue(v);
    void setMarkMessageFeedbackAction(messageId, v);
  }
  const base = "rounded-md px-1.5 py-1 text-xs transition hover:bg-[var(--surface-inset)]";
  return (
    <span className="flex items-center gap-0.5">
      <button type="button" aria-label="Good reply" onClick={() => set("up")}
        className={cx(base, value === "up" ? "text-[var(--ok)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")}>
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 9l3-5a2 2 0 0 1 2 2v3h3.5a1.5 1.5 0 0 1 1.5 1.8l-1 5A1.5 1.5 0 0 1 14.5 17H7zm0 0H4v8h3z"/></svg>
      </button>
      <button type="button" aria-label="Bad reply" onClick={() => set("down")}
        className={cx(base, value === "down" ? "text-[var(--priority-bright)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")}>
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 11l-3 5a2 2 0 0 1-2-2v-3H4.5a1.5 1.5 0 0 1-1.5-1.8l1-5A1.5 1.5 0 0 1 5.5 3H13zm0 0h3V3h-3z"/></svg>
      </button>
    </span>
  );
}
```
Add `setMarkMessageFeedbackAction` to the `../actions` import at the top of `message-list.tsx` (add an import line: `import { setMarkMessageFeedbackAction } from "../actions";`).

- [ ] **Step 4: Render the toolbar.** In `Message` (the Arc/system branch), REPLACE the existing hover-toolbar block with one that adds Regenerate + feedback for non-failed replies:
```tsx
        {!pending ? (
          <div className="mt-1.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            {failed ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-inset)]"
              >
                Retry
              </button>
            ) : (
              <>
                <CopyButton text={message.body} />
                <button
                  type="button"
                  onClick={() => onRegenerate(message.id)}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
                >
                  Regenerate
                </button>
                <FeedbackButtons messageId={message.id} current={message.feedback} />
              </>
            )}
          </div>
        ) : null}
```

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm vitest run src/app/arc`
Expected: PASS. Manually: hovering a completed Arc reply shows Copy · Regenerate · 👍/👎; Regenerate adds a pending bubble and re-runs; thumbs toggle and persist (survive refresh).

- [ ] **Step 6: Commit**

```bash
git add src/app/arc/_components/message-list.tsx src/app/arc/_components/arc-chat.tsx
git commit -m "feat(arc-chat): message toolbar — regenerate + thumbs feedback"
```

---

## Task 10: Input-first empty state + conditional composer placement

**Files:**
- Modify: `src/app/arc/_components/empty-state.tsx`
- Modify: `src/app/arc/_components/arc-chat.tsx`

The empty state becomes input-first: when a thread has no messages, the composer renders **centered inside** the empty state (with the capability line + chips); otherwise it docks at the bottom as today. Implementation: the shell passes the composer element into the empty state as a slot.

- [ ] **Step 1: `empty-state.tsx` — accept a `composer` slot + capability line + chips.** Replace the whole file with:

```tsx
"use client";

import type { ReactNode } from "react";

const CHIPS = [
  { label: "Find new leads", prompt: "Find new leads for @" },
  { label: "What needs my approval?", prompt: "What's awaiting my approval right now, and the risk on each?" },
  { label: "Draft a campaign", prompt: "Draft a campaign for @" },
  { label: "Hottest leads", prompt: "Which leads are hottest right now? Rank them by score and recent activity." },
];

export function ChatEmptyState({ onPick, composer }: { onPick: (prompt: string) => void; composer?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-10">
      <span
        aria-hidden
        className="msg-rise flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] font-display text-lg font-black text-[var(--on-accent)] shadow-[var(--accent-glow)]"
        style={{ animationDelay: "0ms" }}
      >
        M
      </span>
      <div className="msg-rise flex flex-col items-center gap-2 text-center" style={{ animationDelay: "70ms" }}>
        <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-black leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)]">
          What can Arc help with?
        </h2>
        <p className="max-w-[52ch] text-xs leading-5 text-[var(--text-muted)]">
          Arc can <span className="text-[var(--text-secondary)]">find leads</span> ·{" "}
          <span className="text-[var(--text-secondary)]">draft campaigns</span> ·{" "}
          <span className="text-[var(--text-secondary)]">reference your records &amp; memories</span> — outbound stays locked.
        </p>
      </div>

      {composer ? (
        <div className="msg-rise w-full max-w-2xl" style={{ animationDelay: "120ms" }}>
          {composer}
        </div>
      ) : null}

      <div className="msg-rise flex flex-wrap justify-center gap-2" style={{ animationDelay: "170ms" }}>
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onPick(c.prompt)}
            className="rounded-full border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `arc-chat.tsx` — render the composer centered when empty, docked otherwise.** In the `<section>`, replace the `{hasMessages ? (...) : (...)}` + the docked `<Composer .../>` with this structure: build the composer element once, hand it to the empty state when there are no messages, and dock it when there are.

Replace the inside of `<section ...>` with:
```tsx
          {(() => {
            const composer = (
              <Composer
                conversationId={activeId}
                mentionGroups={mentionGroups}
                draft={draft}
                onDraftChange={setDraft}
                textareaRef={composerRef}
                registerSubmit={(fn) => {
                  submitFnRef.current = fn;
                }}
                onOptimistic={(optimistic) => setMessages((prev) => [...prev, optimistic])}
                onSent={(newConversationId) => {
                  if (!activeId && newConversationId) {
                    router.push(`/arc?c=${newConversationId}`);
                  } else {
                    router.refresh();
                  }
                }}
              />
            );
            return hasMessages ? (
              <>
                <MessageList
                  messages={messages}
                  onRetry={handleRetry}
                  onStop={handleStop}
                  onRegenerate={handleRegenerate}
                />
                {composer}
              </>
            ) : (
              <ChatEmptyState onPick={pickSuggestion} composer={composer} />
            );
          })()}
```

(This keeps a single `Composer` instance per render branch; the same draft/state wiring works in both placements.)

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm vitest run src/app/arc`
Expected: PASS. Manually: a new/empty thread shows the centered Arc emblem, capability line, the composer in the middle, and action chips beneath; sending the first message switches to the docked layout with the conversation above.

- [ ] **Step 4: Commit**

```bash
git add src/app/arc/_components/empty-state.tsx src/app/arc/_components/arc-chat.tsx
git commit -m "feat(arc-chat): input-first empty state — centered composer, capability line, chips"
```

---

## Task 11: Worker contract doc (steps + mode)

**Files:**
- Create: `docs/arc-worker-contract-premium.md`

- [ ] **Step 1: Write the contract.**

```markdown
# Arc Worker Contract — Premium states (steps + mode)

App-side renders these the moment Arc's worker provides them; nothing breaks without them.

## 1. Live activity steps (lights up the waiting state)
Before and after each meaningful action, POST to the existing endpoint:

`POST /api/v1/arc/messages/{agentTaskId}/steps`
Bearer: `ARC_AGENT_API_TOKEN`
Body: `{ "label": "Searching leads", "status": "running" }` then `{ "label": "Searching leads", "status": "done" }`

The chat poll renders these as a live checklist; with no steps, the operator still sees a skeleton + progress bar. Best-effort — a failed step POST never blocks the reply.

## 2. Operator mode (ask / act / draft)
Each queued task carries the operator's stance at `task.metadata.mode` (also in the wake webhook payload as `mode`):
- `ask` — read-only: answer & analyze; do not mutate records.
- `act` — may add/update records (e.g. add leads to the CRM).
- `draft` — create drafts for approval (campaigns/assets); do not act beyond drafting.

Outbound always stays locked regardless of mode. Default is `ask` when absent.
```

- [ ] **Step 2: Commit**

```bash
git add docs/arc-worker-contract-premium.md
git commit -m "docs(arc-chat): worker contract for live steps + operator mode"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full sweep.** Run: `pnpm vitest run && pnpm lint`. Expected: all green (incl. new `arc-mode`, `slash-commands`, `setMarkMessageFeedback` tests).
- [ ] **Step 2: Build.** Run: `pnpm build`. Expected: compiles, exit 0.
- [ ] **Step 3: Manual checklist** (`pnpm dev`, Supabase configured): adaptive waiting (skeleton+progress with no steps, timeline with steps); empty state input-first + first-send dock; `/` menu inserts prompts; `/draft-campaign` presets Draft; mode chip switches stance and submits a `mode` (confirm on the queued `agent_tasks.metadata.mode`); Regenerate adds a pending bubble + re-runs; thumbs toggle + persist; reduced-motion disables sweeps/shimmer but content stays readable.
- [ ] **Step 4: Stop for review.**

---

## Self-Review

- **Spec coverage:** Waiting C → Task 3,4. Empty C → Task 10. Composer slash+hints+mode → Task 7,8. Mode backend → Task 5. Toolbar regenerate+feedback → Task 2,6,9. Worker contract (steps+mode) → Task 11. Action cards are **Plan 2** (intentionally out of scope here). ✓
- **Placeholder scan:** none — every code step has complete code; manual-only items are isolated to the Task 12 checklist.
- **Type consistency:** `ArcMode`/`parseArcMode`; `MarkMessage.feedback: "up"|"down"|null`; `setMarkMessageFeedback(id,value,client?)` ↔ `setMarkMessageFeedbackAction(id,value)`; `regenerateMarkReplyAction(conversationId, markMessageId)` ↔ `onRegenerate(markMessageId)`; `enqueueMarkChatTask`/`notifyMarkWebhook` both gain `mode`; `SlashCommand`/`matchSlash`/`SLASH_COMMANDS`; `ChatEmptyState({onPick, composer})`; `MessageList`/`Message` gain `onRegenerate`. All consistent.
- **Ordering:** Task 2 (feedback field) precedes Task 9 (feedback UI); Task 5 (mode backend) precedes Task 8 (mode UI sends it); Task 7 (registry) precedes Task 8 (composer uses it). Already ordered.
```

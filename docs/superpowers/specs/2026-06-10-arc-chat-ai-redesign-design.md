# Arc Chat — AI-Native Visual Redesign

**Date:** 2026-06-10
**Status:** Approved direction, pending spec review
**Surface:** `src/app/arc/` (operator ↔ Arc conversational workbench)

## Goal

A bold visual overhaul of the Arc chat surface that incorporates modern AI-chat
interaction patterns — pulled structurally from 21st.dev (magic MCP) and then
**fully re-skinned onto the Signal design system** (`DESIGN.md`: obsidian + antique
gold, serif for Arc's voice, no emoji / no glow / no gradient / no purple "AI"
aesthetic). All existing wiring is preserved; this is a presentation + interaction
upgrade, not a backend change.

## Non-Goals

- No changes to server actions, persistence (`src/lib/arc-chat/`), polling
  contract, the agent worker, or the message data shape.
- No changes to the thread sidebar, thread switcher, work canvas, or page-level
  data loading except light token-consistency polish if something visibly clashes.
- No new dependencies unless trivial and token-compatible. 21st.dev output is used
  as **reference structure only** — generated shadcn/Tailwind is ported to Signal
  CSS variables; we do not ship its raw aesthetic.

## How 21st.dev (magic MCP) is used

`21st_magic_component_inspiration` / `21st_magic_component_builder` produce modern
AI-chat patterns (prompt-input trays, message rows, reasoning panels, command
palettes, suggestion rails). Their default styling **violates** several DESIGN.md
rules. Process for every borrowed component:

1. Pull the structural pattern from magic MCP.
2. Strip generic styling (gradients, glow shadows, ring colors, rounded-3xl excess).
3. Re-map to Signal tokens (`var(--surface-*)`, `var(--accent*)`, `var(--text-*)`,
   `var(--border-*)`, existing `--elev-*` shadows).
4. Preserve serif for Arc's voice, mono for identifiers/keys, display for labels.
5. Verify against the Anti-Patterns list (§8 of DESIGN.md) before integrating.

## Scope — Six Units

Each unit is independently understandable, testable, and re-skins or extends an
existing component without touching its data contract.

### 1. Composer (prompt tray) — `composer.tsx`

The centerpiece. Rebuild the input as one cohesive rounded "prompt tray."

- **Keep all existing behavior:** autosize textarea, `@`-mention popover, `/`-command
  inline popover, attachment upload + thumbnails, structured `command` hidden input,
  optimistic send, Enter-to-send / Shift+Enter newline, Retry via `registerSubmit`,
  error banner, "outbound stays locked" governance note, the `mode=act` hidden input.
- **Visual upgrade:** a single elevated tray surface with clearer internal zones —
  attachment/chip row, textarea row, and a control row (attach, mention/command
  affordance buttons, send/stop). Gold focus ring via `focus-within:border-[var(--accent)]`.
  Send button morphs to a **Stop** control while a reply is pending (currently Stop
  lives only in the message list — surface it on the composer too for parity).
- **Affordance buttons:** small left-side buttons that insert `@` / `/` and open the
  respective popover/palette, so the affordances are discoverable without prior
  knowledge (hints row stays as secondary reinforcement).
- **Interface unchanged:** same props (`conversationId`, `mentionGroups`, `draft`,
  `onDraftChange`, `textareaRef`, `onOptimistic`, `onSent`, `registerSubmit`).

### 2. Arc's responses — `message-list.tsx`

Keep the flat full-width layout (avatar + name/time line + markdown body). Modernize:

- **Reasoning trace:** restyle `StepTrace` ("What Arc did") and the live
  `PendingBlock` step list into a cleaner vertical "thinking timeline" — connector
  line, status nodes (done/active), quieter type. Collapsed by default once complete.
- **Code blocks:** upgrade the markdown `pre`/`code` renderer with a header bar
  showing the language (when fenced) and a copy button. Token-styled, no glow.
- **Action bar:** the copy / regenerate / feedback row currently appears only on
  hover. Make it persistently visible but quiet (low-contrast), brightening on hover
  — modern AI-message affordance, better discoverability, still calm.
- **Operator bubble:** minor polish only; keep right-aligned quiet bubble + hover time.

### 3. Empty-state launcher — `empty-state.tsx`

Elevate the greeting + 4 workflow shortcut cards. Keep the time-of-day greeting,
the 4 prompts (`Draft a campaign`, `Find new leads`, `Review pending` w/ live
`pendingApprovals` badge, `Summarize a campaign`) and the `onPick` contract. Refresh
the card treatment (rhythm, icon framing, hover step) and add a one-line framing of
what Arc does, within Signal tokens. No new data.

### 4. Slash-command palette — new `command-palette.tsx` + `slash-commands.ts`

Upgrade the inline `/` popover into a proper keyboard-navigable command palette.

- **Trigger:** `⌘K` / `Ctrl+K` anywhere in the chat, **or** typing `/` at the start
  of an empty composer (the existing inline popover remains as the lightweight inline
  path; the palette is the richer modal). Esc / click-outside closes.
- **Behavior:** fuzzy filter over `SLASH_COMMANDS` (`cmd` + `label` + `hint`), full
  keyboard nav (↑/↓ to move, Enter to apply, mono key hints), grouped/sectioned list,
  empty-result state. Applying a command reuses the existing `applySlash` path:
  presets the prompt text, sets the structured `command` id, optional `mode`, focuses
  the textarea. No new server contract.
- **Data:** `SLASH_COMMANDS` stays the source of truth (extend the type with an
  optional `icon`/`section` if useful). Palette and inline popover share it.
- **Isolation:** palette is a self-contained component taking `commands` + an
  `onSelect(cmd)` callback; it knows nothing about the composer internals.

### 5. Streaming-tokens effect — `message-list.tsx` (+ `globals.css`)

A CSS-only reveal on Arc's incoming partial `body` (the worker already streams
partial text into the pending message; the caret already exists).

- **Effect:** newly appended body text fades/reveals in smoothly so chunked poll
  updates read as continuous streaming, not jumps. Refined writing caret (gold,
  steady blink) at the tail while `status === "pending"`.
- **Constraint (honest):** text arrives in poll-sized chunks, not per-token. The
  effect smooths whatever chunk size arrives — it does not require a per-token
  transport. CSS keyframes only (a new `@keyframes` in `globals.css` alongside the
  existing `msg-rise` / `arc-skel` / `arc-ring`), gated by `prefers-reduced-motion`.

### 6. Motion / token plumbing — `globals.css`, `theme.ts`

Add only what units 4–5 need: a token-reveal keyframe, palette enter/exit transition
(transform/opacity only, no layout animation), and any shared class helpers. Reuse
existing `--elev-*` shadows and accent tokens. Honor §6 motion rules: one breathing
indicator max, no levitation, no glow, reduced-motion safe.

## Data Flow (unchanged)

`page.tsx` (server) → `MarkChat` (client state: messages, draft, polling) →
`MessageList` / `Composer` / empty-state. The palette is mounted by `MarkChat` or the
composer and calls the same `applySlash` logic. Streaming is purely a render-time
treatment of the already-polled pending message body. No new fetches, no contract
changes.

## Testing

- **Unit (vitest):** extend `slash-commands.test.ts` for any fuzzy-match changes;
  add a test for palette filtering logic if extracted to a pure function. Keep
  `relative-time` / `use-thread-poll` tests green.
- **Manual / visual:** empty-state launcher, first-message send (optimistic →
  thread), streaming reveal during a pending reply, palette open via `⌘K` and via
  `/`, keyboard nav + apply, mention popover unaffected, attachments, Stop from
  composer, reduced-motion (effects disabled), mobile drawer + responsive tray.
- **Guardrail check:** diff reviewed against DESIGN.md §8 (no emoji/glow/gradient/
  purple/nested cards) before completion.

## Risks & Mitigations

- **21st.dev aesthetic bleed** → mandatory re-skin step (above); guardrail review.
- **Composer regression** (it holds load-bearing first-send slot logic) → preserve
  the exact prop interface and the "one stable tree slot" invariant from `MarkChat`;
  do not remount across empty→thread flip.
- **Palette ⌘K collisions** → scope the listener to the chat surface; Esc closes;
  don't hijack when an input/popover is already capturing.
- **Streaming over-animation** → subtle, reduced-motion gated, one indicator rule.

## Rollout

Single branch (current `feat/arc-kanban-board` or a fresh `feat/arc-ai-redesign`),
incremental per-unit commits, build + lint + test green before finish.

# Arc chat hardening design QA

## Source visual truth

- Audit captures: `/Users/evanreppeto/.codex/visualizations/2026/07/17/019f7045-211e-7b11-a88d-921d8cbe7972/arc-audit/`
- Primary references:
  - `03-new-conversation.png`
  - `04-thinking.png`
  - `05-mobile.png`

## Rendered implementation

- Production preview route: `http://localhost:3018/arc`
- Revised captures: `/Users/evanreppeto/.codex/visualizations/2026/07/17/019f7045-211e-7b11-a88d-921d8cbe7972/arc-fixes/`
- Primary implementation evidence:
  - `01-resumed-conversation.png`
  - `02-new-conversation.png`
  - `03-new-conversation-thinking.png`
  - `04-context-popover.png`
  - `05-mobile.png`
  - `06-mobile-context.png`
- Comparison boards:
  - `qa-new-conversation-comparison.png`
  - `qa-thinking-comparison.png`
  - `qa-mobile-comparison.png`

## Viewports and states

- Desktop: 1280 x 720, existing conversation resumed at latest turn, new conversation, active thinking, and context popover.
- Mobile: 390 x 844, latest completed draft with approval actions and context popover.
- Primary interactions tested: open history, create a new conversation, submit a message, enter the active thinking state, stop control visibility, open the context explanation, and reload at the mobile breakpoint.
- Console errors and warnings: none.

## Full-view comparison

- New conversation: the stale storm-campaign subtitle is replaced by `Full workspace memory is on`; the launcher retains the established Arc hierarchy and now transitions into the submitted turn instead of remaining on the empty state.
- Thinking: the animated sparkle, elapsed time, Stop action, current activity, and read-only contract remain visible. The duplicate pending `Arc now` metadata and second `Thinking` label were removed.
- Mobile: the conversation resumes at its latest response, the composer has clear breathing room, and the approval actions fit inside the 390px viewport.

## Focused comparison

- Composer controls: Add, model, context, and send targets measure at least 44px high on mobile. The Auto model button exposes its current Spark or Forge route without changing the Arc Auto name.
- Context indicator: the ring opens a readable explanation on desktop and mobile; the final mobile popover bounds are left 10px and right 224px within the 390px viewport.
- Draft actions: Revise, Decline, and Approve each measure 104 x 44px and remain fully visible with no horizontal document overflow.

## Required fidelity surfaces

- Fonts and typography: the existing serif conversation hierarchy and sans-serif control typography are preserved. Model descriptions were raised to 10px with stronger secondary contrast.
- Spacing and layout: conversation selection now lands at the latest turn; mobile content receives extra bottom breathing room; the mobile header is slightly tighter; approval actions stack into an even three-column row.
- Colors and tokens: all changes reuse the existing Arc panel, canvas, accent, line, muted, and semantic status tokens.
- Image quality and assets: the existing storm reference image and Lucide icon family are unchanged; no placeholder or generated visual assets were introduced.
- Copy and content: new conversations no longer inherit storm-specific metadata; the context explanation states that full workspace memory is automatic.
- Accessibility: mobile controls use 44px touch targets, the context control has an explicit accessible name and expanded state, Escape closes it, reduced-motion behavior remains intact, and no horizontal overflow was observed at 390px.

## Comparison history

### Pass 1

- P0: demo new-conversation submissions remained on the launcher. Fixed by rendering the new turn and active run as soon as the first message is submitted.
- P1: new conversations inherited storm-specific header metadata. Fixed with state-aware header copy.
- P1: existing demo conversations opened at the oldest turn. Fixed with conversation-selection scroll restoration while preserving the top of a fresh launcher.
- P1: the thinking state repeated `Arc now`, `Thinking`, and a second `Thinking` label. Fixed by keeping the animated sparkle/status as the single primary running label.
- P1: mobile composer controls were 32-36px. Fixed at 44px.
- P1: the context ring had no mobile explanation. Fixed with a tap/keyboard popover.

### Pass 2

- P1: the mobile Approve action extended beyond the draft card. Fixed with a full-width three-column action row and 44px buttons.
- P2: the mobile context popover initially extended 30px beyond the right viewport edge. Fixed by anchoring it to the control's right edge.

### Pass 3

- P3: the corrected context popover touched the left viewport edge. Reduced its mobile width; the final bounds remain 10px inside the viewport.
- No remaining actionable P0, P1, or P2 findings.

## Validation

- Scoped ESLint passed.
- Typecheck passed.
- Arc test suite passed: 23 files, 152 tests.
- Production build passed with Next.js 16.2.6.
- `git diff --check` passed.

final result: passed

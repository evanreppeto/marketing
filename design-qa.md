# Arc new conversation design QA

## Evidence

- Source truth: `/var/folders/2g/05frnm2118b30sj5k5_zmcqm0000gn/T/codex-clipboard-c4db228a-4c28-47d9-b973-d69218ec89e7.png`
- Implementation capture: `/tmp/arc-new-conversation-after.png`
- Normalized comparison: `/tmp/arc-new-conversation-comparison-normalized.jpg`
- Viewport: 1280 × 720
- State: Arc workspace drawer → New conversation → blank conversation launcher

The full-view comparison is readable at this viewport and includes the fixed header, welcome content, waiting-on-you items, four launch shortcuts, and composer. Browser geometry additionally confirmed `scrollTop: 0`, the greeting 38px below the header, all four shortcut cards visible, and the composer focused.

## Interaction and runtime checks

- Opened the workspace drawer and activated New conversation.
- Confirmed the blank screen resets to the top rather than retaining the previous thread's bottom position.
- Confirmed the composer receives focus immediately.
- Confirmed all four shortcut cards fit above the composer at the short desktop viewport.
- Checked the browser console: no warnings or errors.

## Comparison history

- P1 — The greeting and introductory copy were clipped beneath the fixed header because a blank live conversation was scrolled to the end. Fixed by treating blank conversations as a start-scroll state.
- P2 — The old thread remained visible while the new route loaded, making the button feel laggy. Fixed with an immediate optimistic blank-conversation shell while Next.js completes navigation.
- P2 — Two shortcut cards fell below the useful area at shorter desktop heights. Fixed with a compact, height-aware launcher layout.

## Fidelity surfaces

- Fonts and typography: preserved the existing Arc serif display and Geist interface typography.
- Spacing and layout: corrected initial scroll position, vertical rhythm, and short-height density.
- Colors and tokens: retained the existing Arc surface, border, text, and gold accent tokens.
- Image assets: no new imagery was needed; existing Lucide interface icons remain in use.
- Copy: preserved the existing welcome, status, and shortcut copy.

## Final result

passed

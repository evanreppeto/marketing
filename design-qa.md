# Arc thinking and response metadata design QA

## Evidence

- Source visual truth — live run: `/var/folders/2g/05frnm2118b30sj5k5_zmcqm0000gn/T/codex-clipboard-68e72fa4-b3d9-40f5-acac-a2e0477d105e.png`
- Source visual truth — assistant identity mark: `/var/folders/2g/05frnm2118b30sj5k5_zmcqm0000gn/T/codex-clipboard-f2624cc9-d1d0-4ad2-889b-20bf6565b4d6.png`
- Browser-rendered live implementation: `/tmp/arc-thinking-simplified.jpg`
- Browser-rendered settled response: `/tmp/arc-response-footer.jpg`
- Full live-state comparison: `/tmp/arc-thinking-comparison.jpg`
- Focused assistant-metadata comparison: `/tmp/arc-assistant-meta-comparison.jpg`
- Viewport: 1280 × 720
- State: demo Storm Rapid Response conversation, user message sent, active reasoning and tool activity, then settled response

## Findings

No actionable P0, P1, or P2 issue remains in the tested state.

The implementation intentionally removes two parts of the source problem state: the pending “Read only · 4 sources” contract strip and the assistant avatar/name header. The live view now presents one status row, streamed reasoning, and chronological activity without repeating internal permissions. Settled replies begin directly with the response and place their timestamp quietly at the lower edge.

## Full-view comparison evidence

The combined comparison shows the original pending run above and the revised browser state below. The original spends a full bordered row on an unexplained permission label while reporting only one placeholder activity. The revised state uses that space for actual reasoning and four distinct activity rows, while retaining the thinking indicator, elapsed duration, Stop action, and progress states.

## Focused comparison evidence

The focused comparison places the supplied sparkle/avatar crop beside the revised settled reply. The identity badge and “Arc” label are absent; the response hierarchy now starts with useful content. The timestamp remains available below the response as subdued monospace metadata.

## Required fidelity surfaces

- Fonts and typography: existing Arc serif, interface sans, and monospace metadata styles remain unchanged. The timestamp uses the established muted monospace treatment at 9.5px.
- Spacing and layout rhythm: removing the live contract strip eliminates an unnecessary 43px row and border. Removing the assistant header eliminates the 24px identity block without changing response width.
- Colors and tokens: existing canvas, line, muted text, gold activity, success, and error tokens are preserved.
- Image quality and assets: no raster assets are needed. The user-requested sparkle identity icon is removed; existing Lucide activity and state icons remain.
- Copy and content: “Read only” and redundant “Arc” identity copy are removed from chat messages. Reasoning, work activity, completed receipts, and source citations remain available.

## Interactions and runtime checks

- Sent a message from the demo conversation and inspected the active thinking state.
- Confirmed Thinking, elapsed duration, Stop, streamed commentary, and live activity remain visible.
- Confirmed no pending “Read only” row is rendered.
- Waited for completion and confirmed no Arc/avatar header is rendered.
- Confirmed the response timestamp is rendered after the response content.
- No error overlay, browser runtime failure, or server-side error appeared during the interaction.

## Comparison history

- Earlier P1: The pending contract strip exposed an implementation term (“Read only”) that did not help the user understand progress. Fix: remove the pending contract surface while preserving the completed run receipt and underlying safety contract.
- Earlier P2: Every assistant response repeated a sparkle badge, “Arc,” and timestamp above the useful content. Fix: remove the identity header and render only the timestamp below completed response content.
- Post-fix evidence: the live comparison shows a shorter, activity-first thinking state; the focused comparison shows content-first settled responses with quiet bottom metadata.

final result: passed

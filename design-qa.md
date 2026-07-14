# Arc live work log QA

## Reference and intended state

- User-selected reference: `/var/folders/2g/05frnm2118b30sj5k5_zmcqm0000gn/T/codex-clipboard-6c5d6bac-42c9-4474-b195-716b09601a22.png`
- Target: a chronological, readable work log with elapsed time, normal commentary text, and compact activity rows that name the source or tool actually being used.
- The reference and implementation source were reviewed together. A new browser-rendered capture could not be produced because control of the existing local preview tab was blocked during this iteration; the earlier captures in `output/` predate this change and are not treated as current evidence.

## Implemented fidelity

- Header: the live state now says `Working for 12s` or `Working for 1m 9s` instead of using intent labels such as `Analyzing` or `Creating`.
- Commentary: the pending assistant body is no longer hidden. Runner-streamed text appears as normal Markdown in the conversation while work continues.
- Activity: runner-reported steps and tool calls render in their reported order with their exact labels, details, outputs, and status.
- Empty state: before Arc reports text or activity, the UI shows only `Starting the run…`; it does not invent an understand/search/verify checklist.
- Demo behavior: search, audience-analysis, creation, and general requests use different request-specific examples so the preview demonstrates the intended data model without implying every real run follows one process.
- Completed state: finished work still collapses into a durable receipt. The former `Reasoning summary` label is now `Work summary` to avoid implying private chain-of-thought is exposed.
- Safeguards: Stop and the compact run plan remain available without competing with the work log.

## Motion and accessibility

- The original Arc Luma spinner remains the restrained running indicator.
- Newly reported activity fades upward into place; the active event spins and completed events settle to checks.
- Future demo activity stays hidden until it begins, matching the reference's progressive transcript rather than revealing a generic plan.
- The visible timer does not announce every second to screen readers. State changes use a short polite announcement, and reduced-motion preferences disable nonessential entry motion.

## Validation

- `pnpm exec vitest run src/lib/arc-chat`: 17 files and 113 tests passed.
- `pnpm typecheck`: passed.
- Scoped ESLint for `arc-view.tsx`: passed without warnings after cleanup.
- `pnpm build`: passed with Next.js 16.2.6; `/arc` was generated as a dynamic route.
- `git diff --check`: passed.
- The running development server compiled the edited Arc files and returned `HEAD /arc 200`.

## Remaining QA gate

- P2: capture and inspect the active-run state in the local preview at desktop and mobile widths once browser control is available. Confirm commentary wrapping, long tool-label wrapping, composer clearance, and the elapsed-time header against the selected reference.

final result: blocked on browser-rendered visual verification

# Arc campaign and skills workspace design QA

- Source visual truth: `/var/folders/2g/05frnm2118b30sj5k5_zmcqm0000gn/T/codex-clipboard-d6e53f3c-2c2f-4060-9fe8-836dbe03be2a.png`
- Implementation screenshots:
  - `/Users/evanreppeto/.codex/visualizations/2026/07/17/019f7045-211e-7b11-a88d-921d8cbe7972/arc-premium-qa/20-skills-quiet-list.png`
  - `/Users/evanreppeto/.codex/visualizations/2026/07/17/019f7045-211e-7b11-a88d-921d8cbe7972/arc-premium-qa/21-conversations-by-campaign.png`
  - `/Users/evanreppeto/.codex/visualizations/2026/07/17/019f7045-211e-7b11-a88d-921d8cbe7972/arc-premium-qa/22-github-skill-import.png`
  - `/Users/evanreppeto/.codex/visualizations/2026/07/17/019f7045-211e-7b11-a88d-921d8cbe7972/arc-premium-qa/23-add-skill-command.png`
  - `/Users/evanreppeto/.codex/visualizations/2026/07/17/019f7045-211e-7b11-a88d-921d8cbe7972/arc-premium-qa/24-conversations-recent-final.png`
  - `/Users/evanreppeto/.codex/visualizations/2026/07/17/019f7045-211e-7b11-a88d-921d8cbe7972/arc-premium-qa/25-chat-campaign-linker.png`
  - `/Users/evanreppeto/.codex/visualizations/2026/07/17/019f7045-211e-7b11-a88d-921d8cbe7972/arc-premium-qa/26-campaign-group-symbols.png`
- Source crop: 810 x 1237
- Implementation viewport: 1269 x 1255
- State: seeded Arc conversation; recent and campaign-grouped conversation drawer, installed Skills view, GitHub import view, and selected `/add-skill` composer state

## Full-view and focused comparison evidence

The source crop and `24-conversations-recent-final.png` were opened together in the same comparison input. The implementation preserves the source hierarchy: uppercase time labels, generous vertical grouping, quiet unboxed rows, a stronger active row with a slim gold rail, pinned metadata, and a distinct working indicator. The implementation intentionally retains Arc's existing drawer header, search, review summary, and grouping controls above the source region.

The same quiet-row language was checked in `20-skills-quiet-list.png`. Built-in skills are no longer a wall of bordered cards; only system actions, the active/focused item, and workspace-installed skills receive stronger surfaces. `21-conversations-by-campaign.png` keeps the same row hierarchy while replacing time buckets with campaign names. `22-github-skill-import.png` was inspected as the focused install state: import, review, installed source, library search, and safety boundary remain visible without clipping.

## Required fidelity surfaces

- Fonts and typography: Arc's serif section titles, sans-serif controls, and mono command tags remain consistent. Time/campaign section labels use the source's compact uppercase hierarchy, and real skill descriptions truncate without overlapping commands or controls.
- Spacing and layout rhythm: The drawer preserves the source's vertical breathing room and quiet list rhythm. Active rows are compact but clearly surfaced; non-active rows do not add unnecessary boxes. Header and install controls stay fixed while long lists scroll independently.
- Colors and visual tokens: The source's near-black canvas, muted secondary copy, and gold active-conversation accent are retained. Skills use Arc's established blue interaction token for icons, commands, focus, and installed state.
- Image quality and assets: The target contains no raster assets. All visible controls use the existing product icon library; GitHub-imported skills have a distinct repository/fork mark.
- Copy and content: Conversations can be organized by recent activity or campaign. Skills clearly distinguish built-in, Arc Library, and GitHub sources. GitHub copy states that imported instructions are untrusted and run inside a read-only tool boundary.
- Accessibility and behavior: Slash results, skill actions, installed skills, and conversation rows are reachable with Arrow Up/Down, Home/End, and Enter. Focused slash skills receive the same blue highlight as hover. Inputs and icon-only controls retain accessible labels.

## Primary interactions tested

- Switched Conversations between Recent and Campaigns and verified the six demo threads regrouped under named campaigns plus No campaign.
- Assigned, changed, and removed a conversation's campaign from its options menu; verified Arrow Down and Enter select a campaign and immediately move the chat into the matching group.
- Right-clicked a conversation row and verified it opens the same complete options menu without navigating away from the current chat.
- Verified campaign groups use a bare neutral glyph with no badge, border, background, or blue treatment; recent-date headings and conversation rows remain unchanged.
- Used Arrow Down from Create a skill and verified focus moved to Add from GitHub.
- Imported a real public GitHub `SKILL.md`, reviewed its parsed name/description/command/source, installed it, and verified it appeared immediately in the installed list and `/` menu.
- Typed `/creative`, used Arrow Down and Enter, and verified the imported skill became the blue composer chip.
- Typed `/add`, used Arrow Down and Enter, and verified the `/add-skill` workflow selected with the GitHub URL placeholder.
- Verified campaign mentions persist the conversation's campaign link and are forwarded to the runner as working context.
- Browser console errors checked: none.

## Comparison history

- Earlier P2: Skills used the same boxed card treatment for every item, which did not match the source's calm hierarchy and made long lists feel heavy.
- Fix: Removed default borders and panel fills from ordinary skill/library rows; retained stronger surfaces only for actions, focus, installed workspace skills, and active state.
- Post-fix evidence: `20-skills-quiet-list.png` shows a scan-friendly list with blue command tags and only the GitHub-installed item receiving a soft surface.
- Earlier P2: Conversations could only be scanned by time, so campaign-specific work had no visible organization or durable working context.
- Fix: Added Recent/Campaigns organization, campaign-name grouping, and campaign persistence when a campaign is mentioned.
- Post-fix evidence: `21-conversations-by-campaign.png` shows three named campaign groups and a No campaign fallback without changing the source row language.

## Findings

- No actionable P0, P1, or P2 visual, interaction, accessibility, or responsive issue remains in the tested desktop viewport.
- P3: GitHub imports intentionally consume only `SKILL.md`; repository scripts and assets are not executed or installed. This keeps workspace imports reviewable and prevents a public repository from expanding Arc's tool permissions.
- P3: Backend-less local preview installs last for the current session only and say so. Connected workspaces persist imported and Arc Library skills in workspace settings.

final result: passed

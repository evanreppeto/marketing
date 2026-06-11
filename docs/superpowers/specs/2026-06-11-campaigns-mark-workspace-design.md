# Campaigns × Mark — Workspace Redesign

**Date:** 2026-06-11
**Status:** Design approved, pending spec review
**Author:** Evan + Claude (brainstorm)

## Goal

Redesign the Campaigns experience so a **non-technical operator** can run BSR's
marketing with Mark as a teammate. Two things must be true at all times:

1. **Clear, distinct, defined, easy to understand.** Plain language, obvious
   affordances, one vocabulary across the whole app. No jargon ("dispatch,"
   "decision log," "read-model," "deliverables").
2. **User and Mark are intertwined.** Mark can build a campaign, the user can
   build one manually, either can hand it to the other at any point, and *most
   of the work happens in the Mark chat* — including revisions, which spin up a
   new chat thread under that campaign.

This holds the existing non-negotiables: **agent does the work, human approves
decisions, database remembers everything. No outbound without explicit human
approval.** This redesign is approval-safe — it changes presentation and flow,
not the gate.

## The core idea: one piece of work, three views

The board, the campaign, and the Mark chat are **not separate features** — they
are three lenses on the same underlying work. They already share one data layer
(`agent_tasks`), so the job is to make the relationship visible, not to build new
plumbing.

```
A board card  ⇄  a Mark thread  ⇄  a campaign
 (one piece      (the chat where    (the home it
  of work)        it gets done)      belongs to)
```

Click any one → it jumps to the others.

- **Board** = bird's-eye view across *all* campaigns ("what's happening
  everywhere").
- **Campaign** = the deep view of *one* campaign (all its drafts, media,
  audience, approvals, what's live).
- **Mark chat** = where work actually happens, always present inside a campaign.

## One shared vocabulary (the "who's driving" model)

A single set of plain-English states is used **everywhere** — list rows, board
columns, and the campaign progress tracker. Learn it once, it's true across the
app.

| State | Plain label | Color | Meaning | Maps to today |
|-------|-------------|-------|---------|---------------|
| Building | **Mark building** | blue | Mark has active/queued work, nothing waiting on the human | `Drafting` |
| Needs you | **Needs you** | amber | Something requires the operator's approval or decision | `In review` |
| Ready | **Ready to launch** | amber/green | Approved; the operator can take it live | `Ready` |
| Live | **Live** | green | Running outbound | `Live` |
| Done | **Done** | gray | Ended or archived | (archived) |

The existing `lifecycle` field in `getCampaignWorkspaceList` (`"In review" |
"Ready" | "Live" | "Drafting"`) is the source; we relabel it for humans and add
an explicit "Done/archived" bucket. **No schema change required** for the state
model — it's a presentation mapping.

"Who's driving" (Mark vs. you) is reinforced by an explicit **handoff control**,
separate from progress state (see Handoff below).

---

## Screen 1 — Campaigns list (the portfolio)

Replaces the current `src/app/campaigns/page.tsx` + `campaign-library.tsx`
grouping. Keeps the editorial-list strength, simplifies the language.

**Header:** title "Campaigns", one-line plain description ("Everything Mark is
building, waiting on you, or running. Nothing goes out until you say yes."), and
a prominent **`+ New campaign`** button.

**Grouped by what *you* need to do** (not technical lifecycle):

1. **Waiting for your approval** (amber, floats to top, glows) — `Needs you`
2. **Ready to launch** — `Ready`
3. **Live right now** (green) — `Live`
4. **Mark is working on these** (blue) — `Building`
5. **Finished** (collapsed) — `Done`

**Each row** shows: campaign icon, name, one-line "For {persona} · Goal:
{objective}", a **"who's driving" tag** (`Needs you` / `Mark building` / `Live` /
`Done`), and **one action button that matches the state** (Review / Open /
Launch). Reuses the existing `CampaignRow` shape and `whyLine`/`channelSummary`
helpers; relabels groups and adds the tag.

**Portfolio analytics strip (new):** a plain-English summary at the top of the
list, anchored on **business outcomes** (this is a restoration company — booked
work is the point, not impressions):
- Four headline numbers: **Jobs booked** (hero, the money metric), **People
  reached**, **Replies & leads**, **Waiting on you** (doubles as a nudge).
- Two "what's working" bars: **which campaigns book work** and **which audiences
  respond** — feeds the operator's gut *and* Mark's learning loop (he cites these
  when suggesting the next campaign).
- Time toggle: **Month / 90 days / All time**. No charts to decode.
- Data already exists via `attribution-read-model` / `getCampaignEconomics`
  (currently per-campaign in the economics panel + Results); we **roll it up to
  the portfolio level**. The existing `MomentumStrip` is replaced/absorbed by
  this. The deep per-campaign numbers stay in each campaign's **Results** section.

**Expandable quick peek (new):** a chevron control on each row. Tap to expand the
peek **inline** (not hover — discoverable, touch-friendly, keeps the list calm by
default). The peek shows:
- Thumbnails of the pieces (lead creative).
- Plain-English **what / who / why**: "3 pieces ready · 2 IG ads + 1 email" /
  "Reaches 1,240 property managers" / "Why Mark built it: May storms spiked
  water-damage demand."
- Two buttons: **Open campaign** · **See full preview**.

Peek data comes from the existing list item fields (`previewText`,
`thumbnailUrl`, `whyBuilt`, `assetTypes`, `assetCount`, `persona`); we extend the
list item to also return up to ~3 thumbnail URLs.

## New campaign + handoff

**`+ New campaign`** opens **one gentle choice** (no form dumped up front):

- 🗣️ **Tell Mark what you need** — describe it in plain words; Mark creates a
  shell campaign and drafts the first pieces. Opens a new Mark thread under the
  new campaign.
- ✏️ **Set it up myself** — the existing `campaign-create-form.tsx` fields
  (title, persona, focus, audience, objective, channel, offer, photos). On save,
  offer **"Hand to Mark to build"**.

**Handoff (give-to-Mark / take-it-back) is available anytime** via an explicit
control in the campaign header, surfaced through the same "who's driving"
language. Handing to Mark queues an `agent_task` for the campaign (the mechanism
`sendMarkDirective` already uses); taking it back pauses Mark's queued work and
marks the campaign operator-owned.

---

## Screen 2 — Inside a campaign (the detail page)

Replaces the 7-tab `campaign-workspace.tsx`. **Split workspace:** the campaign's
content fills the main column; **Mark lives in a side pane** to build & revise.

**Top of page (always visible):**
- Breadcrumb back to Campaigns, campaign name.
- **Progress tracker (new):** a simple stepper — *Idea → Mark built it → Your
  review → Ready → Live → Results* — so anyone sees where the campaign is with
  no vocabulary to learn. Derived from `lifecycle` + approval/launch state.
- Header status: what's awaiting you + **"Outbound locked"** until approved.
- **Handoff control:** "Hand to Mark" / "Take it back".

**Main column — plain-language sections** (replaces the technical tabs):

| New section | Was | Component basis |
|-------------|-----|-----------------|
| **Overview** | (Campaign overview panel) | `campaign-package-panel.tsx` |
| **The work** | Deliverables / Creative | `creative-tab.tsx` |
| **Photos & video** | Media | `campaign-media-board.tsx` |
| **Who it's for** | Audience & sources | `audience-leads-tab.tsx` |
| **Approvals & history** | Decision log **+** Audit (merged) | `approvals-tab.tsx` + `audit-log.tsx` |
| **Results** | Measurement / Performance | `performance-tab.tsx` + economics panel |
| **Preview** (new) | — | new view; reuses `channel-preview.tsx` |

"Reasoning / Talk to Mark" is **no longer a tab** — Mark is the always-present
side pane.

**Side pane — Mark (the heart of the redesign):**
- Hosts a **Mark thread** for this campaign with a **thread switcher** (▾).
- Each chunk of work gets its own thread: "Build the package," "Revise the
  email," etc. **A revision request or `+ New thread` spins up a fresh chat
  *under this campaign*.**
- Approve a draft **inline in the conversation** (reuses the existing
  `action-card.tsx` / `work-canvas.tsx` approve-in-place + `decideCampaignDraftAction`).
- **"Mark suggests" (new):** Mark proposes the next step in plain words ("People
  who open but don't book often need a nudge — want me to draft a follow-up
  text?"). He drafts; the human still approves.

### Key architectural decision: consolidate onto the threads system

Today there are **two** Mark mechanisms touching campaigns:
1. `campaigns/_components/mark-conversation.tsx` — a single per-campaign directive
   conversation (queues `agent_tasks`, shown in the "reasoning" tab).
2. `mark-chat` conversations (`src/lib/mark-chat/`) — the rich `/mark` threads
   system that **already carries an optional `campaignId`** (see `MarkPage`:
   `activeCampaignId`, `conversation.campaignId`) and has the work canvas,
   mentions, projects, archive.

**Decision:** the campaign's Mark side pane is built on the **`mark-chat`
conversations system**, filtered to `campaignId`. This is what makes "multiple
threads per campaign" and "revisions create a new chat under the campaign" real
and consistent with the standalone `/mark` surface — one chat system, two entry
points (global `/mark` and docked-in-campaign). The older single
`mark-conversation` directive view is retired (its `agent_task` queuing behavior
is preserved underneath; messages still flow through `agent_tasks` /
`agent_outputs`).

---

## Preview (two kinds)

1. **Quick peek** — on the list, expandable inline (Screen 1).
2. **True-to-life preview** — a **Preview** section inside the campaign that
   renders each piece in a realistic frame: Instagram post, email inbox,
   landing-page browser. The operator sees *exactly* what their customer will
   see — the most reassuring thing before Approve. Builds on the existing
   `channel-preview.tsx` / `channel-artifact.tsx` components.

## Go-live confirmation (new)

The one irreversible-feeling action (going outbound) gets a **friendly,
can't-miss confirm** that spells out exactly what happens, in human words:
"Start showing this to customers? This will run **2 Instagram ads** and send **1
email** to **1,240 property managers**. You can pause it anytime." This is the
human-gate principle stated for humans; it wraps the existing launch action
(`src/lib/campaigns/launch.ts`).

## Board intertwining

- **Campaign → board:** when Mark is building or something's waiting on you, a
  card already exists as an `agent_task`; surface it on the board with a link
  back to its campaign. Add a **"Send to Mark's board"** action on a campaign /
  draft to park a request for later.
- **Board → campaign:** tapping a card opens its campaign with the right Mark
  thread in focus. A "To do" card with no campaign yet becomes a new campaign
  when Mark starts.
- **Shared columns:** the board's columns relabel to the shared vocabulary —
  **To do (Queued) · Mark working (Running) · Needs you (Blocked) · Done
  (Completed)** — matching the list tags and progress tracker. (Board lives at
  `src/app/board/`, reads `getAgentOperationsDashboard()`.)

## Cross-cutting

- **Mobile:** the split workspace is desktop-only. On a phone, the campaign
  content is full-width and Mark becomes a **"Talk to Mark" bottom sheet**.
- **First-run / empty state:** instead of a blank page, a warm "Let's make your
  first campaign" with Mark.
- **"What changed since you were last here":** a small "2 new drafts from Mark"
  marker on rows / sections so returning users aren't re-reading everything.
- **Design system:** the campaigns surface follows `DESIGN.md` (Command
  Charcoal / Canvas White / Restoration Red; no emojis in shipped UI — the
  emoji icons in mockups are placeholders; calm hierarchy). Note the existing
  exception: `/mark` itself is a deliberate "alive" visual zone; the docked Mark
  pane in a campaign should feel consistent with `/mark` while the surrounding
  campaign chrome stays calm.

## What we reuse vs. build

**Reuse (most of it exists):** `agent_tasks` backbone, `mark-chat` conversations
+ `campaignId` linkage, `getCampaignWorkspaceList` / `getCampaignWorkspaceDetail`
read-models, all seven tab components (re-homed under new section names),
`channel-preview`/`channel-artifact`/`action-card` for inline approve + preview,
`launch.ts`, `decideCampaignDraftAction`, `sendMarkDirective`, board read-model,
`page-header.tsx` primitives.

**Build new:** shared "who's driving" state mapping + tag component; portfolio
grouping/relabel; expandable quick-peek row; New-campaign choice screen; handoff
control + action; portfolio analytics strip (roll-up of existing
attribution/economics data); progress-tracker stepper; docked Mark pane built on threads +
thread switcher; "Mark suggests" surface; go-live confirm dialog; Preview
section; board↔campaign link affordances + column relabel; mobile bottom sheet;
first-run + "what changed" markers.

## Phasing (each phase ships independently)

- **Phase 1 — Vocabulary + list.** Shared state model/tag, portfolio relabel &
  grouping, expandable quick peek, New-campaign choice. *(Highest visible win,
  lowest risk.)*
- **Phase 2 — Detail restructure.** Split workspace, plain-language sections
  (merge Decision log + Audit), progress tracker, **consolidate Mark pane onto
  the threads system** with the thread switcher.
- **Phase 3 — Trust, proactivity & analytics.** True-to-life Preview section,
  go-live confirm, "Mark suggests," and the portfolio analytics strip.
- **Phase 4 — Board intertwining + handoff.** Card↔thread↔campaign links,
  send-to-board, column relabel, handoff control.
- **Cross-cutting** (mobile, first-run, "what changed") folded into the relevant
  phase.

## Out of scope

- Higgsfield / AI ad production (stays flagged off until Evan confirms).
- Any automatic outbound behavior.
- Changes to the lead-ingestion contract, personas, scoring, routing.
- New persistence beyond small read-model additions (thumbnail URLs on list
  items; surfacing existing `agent_tasks` on the board with campaign links).

## Resolved decisions

1. **Ready vs. Needs-you grouping** — "Ready to launch" is **its own small group
   directly under "Waiting for your approval"** on the list. Both are
   operator-actionable, but the action differs (Review vs. Launch), so they stay
   visually distinct.
2. **Thread auto-naming** — when a revision (or `+ New thread`) spawns a thread,
   **Mark auto-names it from the request** ("Revise the email"), editable by the
   operator. No timestamp placeholders.
3. **Retiring the old reasoning tab** — during Phase 2, confirm nothing else
   links to `?tab=reasoning` (deep links / saved URLs); add a redirect from
   `?tab=reasoning` to the docked Mark pane if any are found.

# Activity Page - Workspace Log Design

**Date:** 2026-06-12
**Status:** Approved direction, pending implementation plan
**Topic:** A top-level Activity page that makes workspace actions, Hermes work, approvals, risks, and marketing progress easy for normal users to understand.

## Product Thesis

Activity is the app's readable workspace log.

It should not feel like a developer audit table. It should feel like a calm, modern operating view where a business owner, marketer, or operator can quickly understand what happened, who did it, what needs attention, and whether the marketing system is moving forward.

The page must serve three jobs, in this order:

1. **Operational clarity:** What happened, what changed, and what needs attention?
2. **Trust and accountability:** Which human, Hermes agent, integration, or system process did it?
3. **Marketing insight:** Which activity moved audiences, campaigns, leads, assets, and approvals forward?

## Current Context

The app already has several durable activity sources:

- Agent run logs.
- Approval decisions.
- Agent-generated drafts.
- Campaign lifecycle events.
- CRM/domain events.

There is already a read-model entry point in `src/lib/activity/read-model.ts` named `getRecentActivity`, but the product needs a first-class page that turns those records into plain-English insight.

## Page Name

Use **Activity** in the primary navigation.

Avoid **Audit Logs** as the nav label. It sounds admin-only and less approachable. The page can still expose audit-grade information, but the product surface should stay friendly and obvious.

Suggested page header:

- Eyebrow: `Workspace log`
- Title: `Activity`
- Description: `A clear record of human actions, Hermes work, approvals, risks, and marketing progress.`

## Goals

- Make the page understandable in under 10 seconds.
- Use natural language instead of raw IDs, table names, enum values, or JSON.
- Show humans and Hermes side by side as accountable actors.
- Surface important marketing movement, not just system noise.
- Make "needs attention" obvious without turning the page into an alerts dashboard.
- Keep the design sleek, quiet, and consistent with the Signal design system.
- Link every event to the most useful related record when possible.

## Non-Goals For V1

- A full compliance export center.
- A raw database log viewer.
- Mutating records directly from the feed.
- A live WebSocket feed.
- A complex drawer with before/after diffs.
- Advanced saved views or alert rules.
- Rebuilding the agent operations page inside Activity.

Those are useful later, but v1 should nail readability and trust first.

## Primary User Questions

The page should answer:

- What happened recently?
- Who did it?
- Was it a human, Hermes, a sub-agent, an integration, or the system?
- What object did it affect?
- Does it need review?
- Was anything blocked or risky?
- What campaign, lead, segment, asset, approval, or CRM record is connected?
- What should I open next if I care about this event?

## Actor Model

Every visible row should resolve to one of these actor types:

- **Human:** a workspace user, such as an owner, marketer, or operator.
- **Hermes:** the primary marketing agent.
- **Sub-agent:** specialist agent work delegated by Hermes.
- **Integration:** external system activity, such as CRM, email, ads, forms, reviews, calls, or analytics.
- **System:** app-owned state changes, scheduled jobs, imports, or guardrails.

Actor labels must be human-readable:

- Good: `Hermes`
- Good: `Evan`
- Good: `Google Ads integration`
- Bad: `agent_run_logs.actor_id`
- Bad: `system.process.queued_task`

## Event Categories

V1 should support these categories as filter chips:

- `All`
- `Needs review`
- `Humans`
- `Hermes`
- `Approvals`
- `Campaigns`
- `CRM`
- `Assets`
- `Integrations`
- `Risk`

Internally, the source kinds can remain more technical, but the UI labels should stay plain.

Existing source kinds can map roughly as:

- Approval decisions -> `Approvals`, sometimes `Needs review`.
- Agent run logs -> `Hermes`.
- Drafts -> `Assets`, `Hermes`, sometimes `Needs review`.
- Campaign events -> `Campaigns`.
- CRM events -> `CRM`.
- Future integration events -> `Integrations`.
- Compliance blocks or warnings -> `Risk`.

## Event Importance Labels

Rows can carry one small insight label when useful:

- `Needs review`
- `Marketing progress`
- `Risk blocked`
- `Data changed`
- `Agent work`
- `Customer signal`
- `Campaign result`

These labels should help scanning. They should not crowd every row.

## Plain-English Row Language

Rows should read like simple sentences:

- `Hermes drafted 3 email variants for Spring Winback.`
- `Evan approved Google ad copy for Emergency Leads.`
- `Compliance blocked one SMS draft for risky language.`
- `A new lead entered the Homeowner Emergency segment.`
- `Campaign "Referral Push" moved to Ready for Review.`
- `The Google Ads integration imported 12 new campaign events.`
- `Hermes recommended a dormant-customer campaign.`

Do not expose raw implementation language:

- Avoid `approval_item.updated`.
- Avoid `agent_task completed`.
- Avoid UUID-first rows.
- Avoid JSON payloads in the main feed.

## Layout

### 1. Header

Use the existing page header primitives and Signal visual language.

Content:

- Eyebrow: `Workspace log`
- Title: `Activity`
- Description: `A clear record of human actions, Hermes work, approvals, risks, and marketing progress.`

The header should be compact. This is an operating surface, not a landing page.

### 2. Insight Strip

Directly below the header, show four compact summary modules:

1. **Needs review** - pending approvals, blocked drafts, or decision points.
2. **Hermes actions** - agent tasks, drafts, recommendations, and completed work.
3. **Campaign progress** - campaign movement, assets created, launches, or results.
4. **Blocked or risky** - compliance blocks, failed syncs, rejected assets, or risky language.

Each module should show:

- A short label.
- A count.
- A one-line plain-English summary.

Example:

- `Needs review`
- `4`
- `3 drafts and 1 campaign brief are waiting on a decision.`

The insight strip must be useful even when the user does not read the full feed.

### 3. Filter Bar

Use simple query-param filters, not client-heavy state.

Controls:

- Category chips: `All`, `Needs review`, `Humans`, `Hermes`, `Approvals`, `Campaigns`, `CRM`, `Assets`, `Integrations`, `Risk`.
- Date chips: `Today`, `7 days`, `30 days`, `All time`.
- Search input: searches title, detail, actor, linked object label, and category label.

Keep filters visually light. Active filters should be obvious but not loud.

### 4. Timeline Feed

The feed is grouped by day:

- `Today`
- `Yesterday`
- `June 10, 2026`

Each row shows:

- Actor label.
- Action sentence.
- Related object label.
- Category or insight label when useful.
- Time.
- Small status tone.
- Optional link target.

Recommended row structure:

```text
Hermes
Drafted 3 email variants for Spring Winback
Campaign asset - needs review
2:45 PM
```

Rows should be dense enough for scanning but spacious enough to read comfortably.

### 5. Related Record Link

Rows should link to the most useful destination:

- Approval item -> `/approvals`
- Campaign -> `/campaigns/[campaignId]`
- Agent task -> `/agent-operations/tasks/[taskId]`
- Agent -> `/agent-operations/[agentKey]`
- CRM company/contact/property/lead/job/outcome -> matching CRM detail route
- Asset -> campaign detail or gallery/asset detail when available

If no destination exists, the row remains non-clickable.

## Data Design

Extend the existing activity read model rather than inventing a separate system.

Target public type:

```ts
type ActivityQuery = {
  categories?: ActivityCategory[];
  actorTypes?: ActivityActorType[];
  since?: string;
  until?: string;
  search?: string;
  limit?: number;
};
```

Target row shape:

```ts
type ActivityEntry = {
  id: string;
  occurredAt: string;
  actorName: string;
  actorType: "human" | "hermes" | "sub_agent" | "integration" | "system";
  title: string;
  detail?: string;
  category: "approval" | "campaign" | "crm" | "asset" | "agent" | "integration" | "risk" | "system";
  insightLabel?: "Needs review" | "Marketing progress" | "Risk blocked" | "Data changed" | "Agent work" | "Customer signal" | "Campaign result";
  tone: "green" | "red" | "amber" | "blue" | "gray";
  href?: string;
  relatedLabel?: string;
};
```

The exact implementation can reuse existing names where appropriate, but the UI contract should be this readable.

## Source Mapping

### Agent Run Logs

Show Hermes and sub-agent activity:

- Task claimed.
- Task completed.
- Task failed.
- Draft generated.
- Recommendation created.
- Compliance check completed.

Important display rules:

- Never show full prompts in the feed.
- Show reasoning only as a short summary if already stored for operator consumption.
- Link to the agent task detail when available.

### Approval Decisions

Show human review events:

- Draft submitted for review.
- Asset approved.
- Asset rejected.
- Revision requested.
- Approval archived.

Important display rules:

- Make decision state very clear.
- Actor should be the reviewer when available.
- Hermes can recommend approval, but cannot be shown as the approver.

### Drafts And Assets

Show asset creation and review readiness:

- Email draft created.
- Ad copy variant generated.
- Landing-page copy prepared.
- One-pager drafted.
- Asset moved to pending approval.

Important display rules:

- Use asset type and campaign name when possible.
- Label externally visible assets as `Needs review` until approved.

### Campaign Events

Show campaign movement:

- Campaign created.
- Brief approved.
- Assets generated.
- Campaign moved to active.
- Campaign paused.
- Campaign completed.
- Result summary recorded.

Important display rules:

- Highlight meaningful status changes.
- Avoid logging every tiny edit unless it matters for trust or marketing progress.

### CRM Events

Show record changes that affect marketing:

- Lead created.
- Contact entered segment.
- Persona changed.
- Company linked to campaign.
- Outcome recorded.
- Source attribution updated.

Important display rules:

- Do not flood the feed with low-value field changes.
- Prioritize changes that affect targeting, approvals, segmentation, journeys, or reporting.

### Integrations

Future-ready source for:

- Forms.
- Calls.
- Email.
- SMS.
- Reviews.
- Ads.
- Analytics.
- Google Business Profile.
- Ecommerce.
- CRM imports.

Important display rules:

- Show import counts and meaningful failures.
- Link to the affected campaign, channel, or integration settings page.

## Insight Summary Logic

The insight strip can be computed from the filtered or default activity window.

V1 definitions:

- **Needs review:** entries with `insightLabel = "Needs review"` or category `approval` with pending/revision status.
- **Hermes actions:** actor type `hermes` or `sub_agent`.
- **Campaign progress:** category `campaign` or campaign-linked asset events.
- **Blocked or risky:** category `risk`, red tone, failed agent tasks, compliance blocks, or rejected approvals.

Counts should not pretend to be complete if Supabase is unavailable. In that state, show the unavailable state instead of fake numbers.

## Empty And Unavailable States

### Empty

When filters return nothing:

Title: `No activity found`

Body: `Try widening the date range or clearing a filter.`

### Supabase Unavailable

When the app cannot read workspace activity:

Title: `Activity will appear once the workspace is connected`

Body: `The log uses workspace records, agent runs, approvals, campaigns, and CRM events.`

Do not render placeholder rows that look real.

## Visual Direction

Follow `DESIGN.md`:

- Warm obsidian surfaces.
- Antique gold only for emphasis.
- Dense but readable operating modules.
- No neon AI styling.
- No emojis.
- No nested panels.
- No raw developer jargon in primary UI.

The page should feel like a premium operations console:

- Compact header.
- Four useful summary modules.
- Lightweight filters.
- One clean chronological feed.
- Clear status tone dots or pills.

## Accessibility And Readability

- All rows need meaningful text, not icon-only meaning.
- Timestamps should be readable, such as `2:45 PM`.
- Day groups should use real date labels.
- Search input must have a visible label or accessible name.
- Clickable rows need clear hover/focus states.
- Color cannot be the only signal for risk or status.

## Implementation Architecture

Keep the existing project layering:

- `src/lib/activity/read-model.ts` owns source merging, mapping, filtering, and summary counts.
- `src/lib/activity/read-model.test.ts` owns deterministic tests for mapping and filtering.
- `src/app/activity/page.tsx` owns the server-rendered page.
- `src/app/activity/_components/*` can hold small presentational pieces if useful.
- `src/app/_components/console-frame.tsx` adds the top-level nav item.
- `src/app/_components/nav-icons.tsx` adds one matching line icon if needed.

Because this is a read-only page, v1 should not add server actions.

## Testing

Unit tests:

- `applyActivityFilters` filters by category.
- `applyActivityFilters` filters by actor type.
- `applyActivityFilters` respects date bounds.
- `applyActivityFilters` handles search across title, detail, actor, related label, and category.
- Source mappers produce plain-English titles.
- Source mappers avoid exposing raw IDs and enum strings.
- Summary count logic returns correct buckets.

Verification:

- `pnpm test src/lib/activity/read-model.test.ts`
- `pnpm build`
- Scoped lint on changed files if practical.
- Browser smoke on `/activity` once implemented.

## V1 Acceptance Criteria

- A user can open Activity from the main nav.
- The page clearly shows recent workspace actions in plain English.
- The page distinguishes humans, Hermes, integrations, and system events.
- The page shows high-level counts for review needs, Hermes actions, campaign progress, and blocked/risky events.
- Users can filter by category, date, and search text.
- Events link to related records when available.
- The page handles empty and unavailable states cleanly.
- No raw IDs, JSON, table names, or enum strings appear in the main feed.

## Future Work

- Event detail drawer with source records, before/after changes, and Hermes reasoning summaries.
- Exportable audit log for admins.
- Saved views such as `Only risk`, `Only Hermes`, or `Approvals this week`.
- "Ask Hermes what happened this week" summary action.
- Alert rules for failed integrations, repeated compliance blocks, or stalled campaigns.
- Real-time updates.
- Org-scoped activity once every source table carries workspace or organization identity.

## Design Decision

Build **Activity** as a modern workspace intelligence log.

It should be simple enough for any user to understand, serious enough for accountability, and useful enough that a marketer can scan it daily to see what the team, Hermes, and the marketing system are doing.

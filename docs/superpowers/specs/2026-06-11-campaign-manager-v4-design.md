# Campaign Manager v4 Design

**Date:** 2026-06-11
**Status:** Selected direction for review
**Surface:** `/campaigns` and `/campaigns/[campaignId]`

## Product Decision

Campaigns should become a simple campaign management product surface. The main page is for managing many campaigns at once. The individual campaign page is for finishing one campaign.

The page should not feel like a technical agent console, a generic dashboard, or a pile of pretty cards. It should feel like a clear worklist for non-technical users:

- What campaigns exist?
- What content is inside each campaign?
- What needs review?
- What is ready to send or export?
- Where can the campaign go?
- What should I do next?

Mark should be useful and visible, but not dominant. Mark appears through contextual actions such as "Ask Mark to revise," "Add missing content," "Summarize this campaign," or "Build another piece."

## Design Principles

1. **Campaign-first:** The campaign is the primary object. Tasks, approvals, Mark threads, assets, CRM records, and results attach to campaigns.
2. **Plain language:** Use words regular users understand: `review`, `ready`, `send`, `export`, `live`, `draft`, `content`, `audience`, and `results`.
3. **No technical labels in the UI:** Avoid words such as `dispatch`, `lifecycle`, `agent task`, `source payload`, `deployment target`, and `audit payload` in user-facing copy.
4. **Manage many, finish one:** The list page helps users scan and manage many campaigns. The detail page helps them complete one campaign.
5. **Next action clarity:** Every campaign row and detail page should make the next step obvious.
6. **Approval-safe:** Nothing can be sent, exported as final, scheduled, or launched without human approval when approval is required.

## Main Campaigns Page

The main page becomes a campaign manager table with saved views, search, expandable previews, and quick actions.

### Header

The header should be calm and functional:

- Title: `Campaigns`
- Description: `Manage all campaigns, content, approvals, and send/export steps from one place.`
- Primary action: `Ask Mark`
- Secondary action: `Create campaign`

The page should not lead with a large hero area. This is a working surface.

### Search And Saved Views

Add a prominent search field:

`Search campaigns, content, audience, company, platform, or status...`

Saved views should be plain and task-oriented:

- `Needs attention`
- `All campaigns`
- `Ready to send`
- `Mark is working`
- `Live`
- `Archived`

These replace vague or overly technical filters. Additional filter controls can exist, but the first row should be understandable immediately.

### Campaign Table

The table is the main management surface. Recommended columns:

| Column | Purpose |
| --- | --- |
| Expand | Opens the quick preview dropdown. |
| Campaign | Campaign name and short human-readable purpose. |
| Status | Simple state such as `Review needed`, `Ready`, `Live`, `Mark drafting`, `Blocked`. |
| Content | Number of pieces and whether any need review. |
| Where | Simple destinations such as `Email`, `Social`, `Website`, `Export`, `CRM`. |
| Next step | The one thing the user should do next. |
| Open | Opens the individual campaign page. |

Example row:

| Campaign | Status | Content | Where | Next step |
| --- | --- | --- | --- | --- |
| Plumber referral campaign | Review needed | 3 pieces, 2 need review | Email, Export | Review email + script |

The `Next step` column is product-critical. It makes the table more useful than a normal database grid.

### Expandable Preview

Each campaign row should have an expandable preview. The preview is for quick inspection, not full editing.

Preview sections:

- **Campaign preview:** Short plain-language summary.
- **What is inside:** Content pieces such as email, one-pager, call script, image, landing page, audience.
- **Can it go out?:** Plain readiness by destination.
- **Quick actions:** `Review content`, `Ask Mark to revise`, `Send / Export` when allowed, `Open full page`.

Example preview copy:

> A partner-facing campaign for plumbers. Mark made three pieces. The one-pager is ready, but the email and call script need a person to review before anything is sent.

Preview status examples:

- `Email: Not yet`
- `Export packet: Ready`
- `CRM follow-up: Ready`
- `Best next step: Review`

The preview should avoid dense paragraphs. It should use compact sections and small content tiles.

### Bulk Actions

Bulk actions should be conservative and approval-safe. Useful bulk actions:

- `Archive`
- `Assign owner`
- `Ask Mark to summarize selected`
- `Export selected`
- `Mark as reviewed` only for safe internal states

Bulk send should not exist unless every selected item is approved and the destination is explicit.

## Individual Campaign Page

The individual page is where a user finishes one campaign. It should feel like a simple checklist around content and readiness.

### Header

The header should show:

- Campaign name
- Short description
- Status pill
- Primary action: `Send / Export` when anything is ready, otherwise `Review content`
- Secondary action: `Ask Mark to revise`
- Back link to `Campaigns`

### Checklist

At the top of the page, show the campaign process in four plain steps:

1. **Review content**
   Shows what needs approval.
2. **Approve pieces**
   Makes the human gate explicit.
3. **Send or export**
   Shows where ready content can go.
4. **Watch results**
   Shows what happens after launch or export.

This checklist tells users where they are without requiring them to understand internal states.

### Content Table

The main area should list every content piece in the campaign.

Recommended columns:

| Column | Purpose |
| --- | --- |
| Content | Human-readable asset name and short description. |
| Status | `Review`, `Ready`, `Live`, `Draft`, `Blocked`. |
| Where | Email, social, website, export, CRM, etc. |
| What to do | Approve, revise, send, export, check results. |
| View | Opens the selected content preview. |

Example rows:

| Content | Status | Where | What to do |
| --- | --- | --- | --- |
| Email draft | Review | Email | Approve or ask Mark to revise. |
| One-pager | Ready | Export | Can be downloaded now. |
| Call script | Review | CRM task | Approve before assigning. |

### Content Preview

Selecting a content piece should show a preview below or beside the table.

For copy assets:

- Subject/headline
- Body preview
- Approval status
- `Approve`
- `Ask Mark to revise`
- `Edit` if manual editing is available

For visual assets:

- Thumbnail or preview
- Caption/description
- Platform fit
- Approval status
- `Approve`
- `Ask Mark to revise`

### Right Rail

The right rail should explain the campaign in simple terms:

1. **Campaign summary**
   - Audience
   - Purpose
   - Owner
   - Mark status

2. **Send / export**
   - `Send email: blocked/ready`
   - `Export one-pager: ready`
   - `Create CRM tasks: after approval`

3. **Mark**
   - `Revise selected`
   - `Add missing piece`
   - `Summarize campaign`
   - `Create new version`

4. **Results**
   - Replies, sends, exports, tasks, leads, or outcomes when available.
   - Hide or collapse empty metrics rather than showing fake zeros.

### History

Keep history available, but do not make it a primary tab. It can be a collapsible section:

- Created by Mark
- Edited by user
- Approved
- Sent/exported
- Revision requested
- Result received

The history exists for trust and troubleshooting, not as the main experience.

## Mark Integration

Mark should appear in context:

- On the main page: `Ask Mark` in the header and row preview actions.
- On the detail page: actions tied to selected content or campaign state.

Good Mark actions:

- `Revise selected`
- `Add missing piece`
- `Summarize this campaign`
- `Explain why this was made`
- `Create another version`
- `Attach this campaign to a Mark thread`

Avoid making Mark the whole page. Users came to manage campaigns.

## Send And Export Model

The UI should use plain destinations:

- `Email`
- `Social`
- `Website`
- `Export`
- `CRM`
- `Manual follow-up`

Each destination has a simple readiness state:

- `Ready`
- `Needs review`
- `Blocked`
- `Not connected`
- `Sent`
- `Live`

If a platform integration is not connected, say so plainly:

`Email is not connected yet. Connect Resend before sending.`

Do not expose integration details unless the user opens settings.

## Public Product Fit

This direction follows familiar patterns from campaign tools:

- Campaigns collect multiple assets in one place.
- Teams manage campaign status from a list/table.
- Campaign detail pages show assets, approvals, destinations, and results.
- Performance lives with the campaign after it goes live.

The differentiator is simplicity plus Mark:

- A normal user can understand the campaign status without learning marketing operations terms.
- Mark helps fill gaps and revise content, but the campaign remains the center.
- The interface gives a next step instead of only showing data.

## Implementation Scope

Phase 1 should focus on the product shape without adding new integrations:

- Rewrite `/campaigns` into the campaign manager table.
- Add expandable row previews.
- Keep existing campaign data and actions where possible.
- Rewrite `/campaigns/[campaignId]` into the checklist/content-table layout.
- Reuse existing approval, launch, Mark, CRM, and campaign read-model data.
- Use simple labels even if backend state names are technical.

Phase 2 can add stronger send/export workflows:

- Platform-specific send/export buttons.
- More explicit integration states.
- Better results rollups.
- Bulk actions.

Phase 3 can add advanced management:

- Saved custom views.
- Campaign templates.
- Campaign cloning.
- Calendar/schedule view.
- More advanced Mark automation.

## Out Of Scope For First Implementation

- Building new external platform integrations.
- Bulk sending.
- Replacing the Mark chat experience.
- Advanced analytics dashboards.
- Drag-and-drop campaign planning.
- Complex permission systems.

## Verification

Manual UI checks:

- A non-technical user can identify which campaigns need attention.
- A user can expand a campaign row and understand what is inside.
- A user can find the next step without opening the detail page.
- A user can open a campaign and see every content piece.
- A user can tell what is ready, blocked, or waiting for review.
- Mark actions are contextual and do not dominate the page.

Technical checks:

- TypeScript passes.
- Campaign read-model tests still pass or are updated.
- Approval actions remain gated.
- Send/export/launch actions remain blocked unless approved.
- Empty or unavailable data states use simple copy.

## Spec Self-Review

- No placeholder sections remain.
- The design is focused on `/campaigns` and `/campaigns/[campaignId]`.
- The main-page and detail-page responsibilities are distinct.
- The copy guidance is plain-language and non-technical.
- First implementation can use existing data and defer new integrations.

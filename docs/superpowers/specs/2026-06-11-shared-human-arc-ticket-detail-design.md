# Shared Human + Arc Ticket Detail - Design

**Date:** 2026-06-11
**Status:** Approved design direction, pending user review

## Problem

The Kanban board is meant to be shared operating space for humans and Arc, but the current click-through ticket page feels like a sparse read-only record. It shows a title, tabs, counts, and metadata, yet it does not work like an operational issue detail:

- Humans cannot clearly edit the ticket from the detail view.
- The latest useful output is hidden behind a tab instead of being surfaced as the reason to open the ticket.
- The right rail is metadata-only, not a control surface.
- Activity is split across inputs, outputs, and logs instead of reading like a shared timeline.
- The page feels less purposeful than the board card and less direct than Linear-style issue detail.

The next version should keep the app's purpose: a shared work board where humans and Arc coordinate restoration-specific marketing work, with outbound actions locked behind human approval.

## Product Direction

Build a **Linear-style ticket detail for the Growth Engine**, not a Linear clone.

The experience should borrow Linear's clarity:

- Fast issue-detail rhythm.
- Editable title and properties.
- Right-side property rail.
- Activity-first history.
- Obvious status and next action.

But the content model stays specific to this app:

- Arc can be the active driver.
- A human remains accountable for the task.
- Campaign, CRM, persona, and approval context stay visible.
- Latest agent output is pinned near the top.
- Governance is explicit: Arc can prepare work, but cannot publish, launch, or bypass approval.

## Ownership Model

Use **co-ownership** instead of forcing a ticket to be either human-owned or Arc-owned.

- **Owner:** the human accountable for the ticket. This person can edit, reassign, stop, revise, and approve work.
- **Driver:** the current actor doing the next work. This can be Arc or a human.
- **Approver:** the human or approval role required before outbound or final assets can be used.

This keeps the board honest. A task can say "Arc is driving this" while still making it clear which human owns the outcome.

## Core Ticket Layout

### Top Bar

The ticket page keeps a quick way back to the board and uses a compact Linear-like breadcrumb:

- `Task board / <short ticket id>`
- `Open board`
- `Save changes` when editable fields are dirty

No heavy page header. The ticket itself is the workspace.

### Main Header

The first viewport should answer what the ticket is and what can happen next.

- Status pill.
- Driver pill.
- Human-editable marker when applicable.
- Editable title.
- Editable brief/description.
- Top next-action buttons.

Next-action buttons are contextual:

- `Review latest output` when an output exists.
- `Ask Arc to continue` when Arc is available.
- `Request revision` when an output or approval item exists.
- `Assign to human` or `Assign to Arc`.
- `Create approval` when the work has reviewable output but no approval item.
- `Move status` for manual state transitions.

The goal is that opening a ticket immediately tells the operator what to do next.

### Editable Work Brief

The Overview tab includes an editable work brief rather than a generic reassurance sentence.

It should show:

- Human instructions.
- Arc's output target.
- Acceptance criteria.
- Any guardrails that apply.

Acceptance criteria are lightweight checklist items. Humans can edit them. Arc may report progress against them, but completion of approval-sensitive work still requires human approval.

### Latest Output

The newest useful output should be pinned on the Overview tab.

It should include:

- Output title.
- Output type.
- Compliance status.
- Approval status.
- Short readable preview.
- Link to full output details.
- Review/revise action when appropriate.

The Outputs tab remains available for the full list, but the current deliverable should not be buried.

### Activity Timeline

Replace the "overview count cards" feel with a shared activity timeline.

Timeline entries should include:

- Human edits.
- Human comments/instructions.
- Arc claimed/started/blocked/completed events.
- Arc outputs.
- Status changes.
- Approval events.
- System or audit events.

The activity tab can add filters later, but the first version can show a unified timeline with clear source labels: `Human`, `Arc`, `System`, `Approval`.

### Right Property Rail

The rail becomes the primary edit surface for ticket properties.

Editable properties:

- Status.
- Owner.
- Driver.
- Approver.
- Priority.
- Due date.
- Scheduled date/time.
- Task type.
- Linked campaign.
- Linked CRM source record.
- Persona or audience context when available.

Read-only or guarded properties:

- Created date.
- Updated date.
- Agent/API identifiers.
- Outbound lock state.
- Approval gate state.

The rail should make it obvious which values are editable and which are system-controlled.

## Board Behavior

The Kanban board remains the shared cockpit.

Card click:

- Opens the ticket detail page as the default v1 behavior.
- Preserve the option to add a board-side drawer later for faster browsing, but do not make the drawer the first implementation requirement.

Drag and status:

- Humans can drag cards across allowed lifecycle states.
- Guardrails still prevent unsafe transitions.
- Arc can update task state through the agent API where allowed.
- Human edits should be written as state changes and activity events.

Card content should continue to show:

- Objective.
- Owner/driver avatar.
- Status.
- Priority.
- Linked campaign/record.
- Due or scheduled state.
- Outbound lock marker when applicable.

## Data And Persistence

Reuse the existing `agent_tasks` spine where possible. Additive schema changes are acceptable if needed.

Additive persistence choices for the first implementation:

- `owner_kind` and `owner_label` for human accountability. Use labels first because the app does not need a full user-management redesign for this slice.
- `driver_kind` with values such as `human` and `agent`.
- `driver_agent_id` when Arc is the driver.
- `driver_label` for human drivers.
- `approver_label` for the required human approver or approval role.
- `description` or work-brief field if current `objective` is too short.
- `acceptance_criteria` in structured metadata if no table is warranted yet.
- `agent_task_events` as a small activity table for human comments, human edits, instructions to Arc, and system-visible task changes that are not already represented by outputs/logs/approval rows.

Avoid overbuilding collaboration infrastructure before it earns its place. Metadata-backed fields are acceptable for the first implementation when they are validated and mapped through the read model.

Activity can compose existing records first:

- `agent_task_inputs`
- `agent_outputs`
- `agent_run_logs`
- `approval_items`
- task `created_at` / `updated_at`
- any existing status or decision rows

Human comments and instructions should not be stuffed into opaque task metadata. They should use `agent_task_events` so the timeline can distinguish `comment`, `instruction`, `property_changed`, and `status_changed` events.

## Permissions And Guardrails

Humans:

- Can edit ordinary work-management fields.
- Can add comments and instructions.
- Can change owner, driver, priority, due date, and status where allowed.
- Can request revision or create/open approval items.

Arc:

- Can claim tasks, report progress, add logs, attach outputs, and request human input.
- Can move work through allowed non-public workflow states.
- Cannot publish, launch, send, export, or arc approval-sensitive work as externally usable.

Outbound:

- Always remains locked unless a human approval flow explicitly unlocks the next backend step.
- The ticket detail should display this lock state in the rail and near output review actions.

## UX Details

- Use the existing Signal design system: obsidian surfaces, antique gold accents, shared buttons, status pills, tabs, and panel tokens.
- Keep the page dense and operational, not decorative.
- Do not use nested cards.
- Do not use red for normal urgency or "needs you"; reserve red for destructive/high-risk states.
- Use Arc's avatar for agent-driven activity and a human avatar/initials for human edits.
- Keep keyboard-friendly controls where practical: editable title, editable description, property selects, and comment composer.
- Save property edits immediately on selection/blur, Linear-style, and show a small `Saving` / `Saved` indicator. Free-form comments/instructions are explicit submit actions.

## Components To Create Or Change

Primary files:

- `src/app/agent-operations/tasks/[taskId]/page.tsx`
- `src/app/agent-operations/tasks/[taskId]/task-record-panels.tsx`
- `src/app/agent-operations/task-kanban-board.tsx`
- `src/lib/agent-operations/read-model.ts`

Likely new pieces:

- `TicketEditableHeader`
- `TicketNextActionBar`
- `TicketPropertyRail`
- `TicketActivityTimeline`
- `TicketLatestOutput`
- `TicketAcceptanceCriteria`
- server actions for updating ticket fields

Reuse:

- `StatusPill`
- `buttonClasses` / shared button primitives
- `TabNav` if the route needs canonical tabs
- `EntityAvatar`
- existing task input/output/log panels

## Implementation Sequence

1. Extend the read model to expose the fields needed by the ticket detail.
2. Add update actions for safe human-editable fields.
3. Redesign the ticket detail page around editable header, next actions, latest output, activity, and property rail.
4. Preserve the existing inputs, outputs, and logs panels as deeper tabs.
5. Add acceptance criteria and comments/instructions persistence if not already available.
6. Update board cards only where needed to reflect owner/driver and linked context.
7. Verify that Arc API behavior and approval guardrails still pass.

## Verification

Required:

- `pnpm exec tsc --noEmit --pretty false`
- targeted tests for read-model mapping and update actions
- existing Arc task route tests
- browser check of `/board`
- browser check of `/agent-operations/tasks/[taskId]` with a real or seeded task

Manual checks:

- Human can edit title/brief/status/priority/owner/driver/due date.
- Human changes appear in activity.
- Arc output appears pinned on the overview.
- Full outputs/logs remain accessible.
- Outbound lock is visible and unchanged.
- Unsafe publish/launch/send behavior is not introduced.

## Out Of Scope

- Full Linear clone.
- Multi-user realtime cursors or live typing.
- Board-side drawer as v1 requirement.
- Publishing, sending, launching, or exporting from the ticket page.
- New campaign architecture unrelated to task detail.
- Full user-management redesign.

## Locked Implementation Decisions

- Property edits save immediately on select/blur; comments and instructions submit explicitly.
- Human comments, instructions, and human-visible property changes use a small `agent_task_events` table.
- Owner and driver are first-class additive task fields for this slice, with label-based human identity until a fuller user model exists.

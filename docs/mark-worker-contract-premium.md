# Mark Worker Contract — Premium states (steps + mode)

The app renders these the moment Mark's worker provides them; nothing breaks without
them (with no steps the operator still sees a skeleton + progress bar; mode is advisory).

## 1. Live activity steps (lights up the waiting state)

Before and after each meaningful action, POST to the existing endpoint:

```
POST /api/v1/hermes/messages/{agentTaskId}/steps
Authorization: Bearer <HERMES_AGENT_API_TOKEN>
Content-Type: application/json

{ "label": "Searching leads", "status": "running" }
```
…then when that action finishes, post the same label as done:
```
{ "label": "Searching leads", "status": "done" }
```

The chat poll renders these as a live checklist (running = pulsing, done = check). With
no steps, the operator still sees a skeleton + sweeping progress bar — so emitting steps
is a strict upgrade. Best-effort: a failed step POST never blocks the reply.

## 2. Operator mode (ask / act / draft)

Each queued task carries the operator's stance at `task.metadata.mode` (also present in
the wake webhook payload as `mode`). Values:

- `ask` — read-only: answer & analyze; do **not** mutate records.
- `act` — may add/update records (e.g. add leads to the CRM).
- `draft` — create drafts for approval (campaigns/assets); do not act beyond drafting.

Outbound always stays locked regardless of mode. Default is `ask` when the field is absent.

## Reply contract (unchanged)

Mark still posts the final reply to `POST /api/v1/hermes/messages` with
`{ agentTaskId, body, status: "complete" | "failed", metadata }`. The `metadata.media`
array continues to render attachments, and `metadata.actions[]` (below) renders cards.

## 3. Action cards (`metadata.actions[]`)

Include an `actions` array on the reply `metadata` to render structured cards instead of
loose prose. Each entry:

```json
{
  "kind": "result" | "draft",
  "title": "3 leads added to CRM",
  "href": "/crm/leads",
  "rows": [
    { "name": "Dana Kasprak", "meta": "Emergency Homeowner", "badge": "92", "href": "/crm/leads/abc" }
  ],
  "preview": "When the unexpected hits…",
  "flags": [ { "tone": "ok|warn|risk", "label": "On-brand" } ],
  "approval": { "kind": "campaign", "campaignId": "<id>", "assetId": "<id>" }
}
```

- `kind` + `title` are required; everything else is optional.
- `rows` render as clickable record lines (result cards); `preview`/`flags` are for draft cards.
- When a `draft` card carries `approval`, the operator gets inline **Approve / Decline**
  (wired to the campaign decision flow) plus a **Request revision** link to the campaign.
- Malformed entries are dropped silently. Outbound stays locked regardless.

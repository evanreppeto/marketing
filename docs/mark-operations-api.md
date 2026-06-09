# Mark Operations API (`/api/v1/hermes/*`)

Secure, structured app access for the Hermes/Mark agent so it operates from
stable APIs instead of browser scraping. Every route is bearer-gated with
`HERMES_AGENT_API_TOKEN` and (except `/health`) requires Supabase admin env
vars. House response style:

```jsonc
// success
{ "ok": true, "status": "ok", "<namedKey>": ... }
// error
{ "ok": false, "status": "unauthorized|not_configured|rejected|not_found|failed", "message": "..." }
```

## Safety model (non-negotiable)

Mark can **read, advise, log, and drive its own task lifecycle** — it can never
approve, launch, send, publish, or dispatch. Enforcement:

- No agent route imports `@/lib/approvals/decisions`, `@/lib/campaigns/decisions`,
  `@/lib/campaigns/revisions`, or `@/lib/campaigns/launch`. Verified by
  `src/app/api/v1/hermes/__tests__/safety.test.ts`.
- Every normalized task carries `outbound_locked: true`.
- `POST .../recommendation` writes to `approval_recommendations` only; it never
  mutates `approval_items.status` or the `approval_decisions` ledger.
- Outbound locks (`campaigns.launch_locked`, `campaign_assets.dispatch_locked`)
  are never touched by this API.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | `{ service: "bsr-marketing-hermes", supabaseConfigured }`. Bearer-only. |
| GET | `/tasks` | `?status=&assignee=&limit=`. `status` accepts spec words (`pending`,`in_progress`) and native (`queued`,`running`,`blocked`,`needs_approval`,`completed`,`failed`,`canceled`). |
| GET | `/tasks/:id` | Normalized task + full read-model detail. |
| POST | `/tasks/:id/claim` | `queued → running`. 409 if not claimable. |
| POST | `/tasks/:id/log` | `{ message?, reasoning_summary?, run_status?, model_provider?, model_name?, metadata? }`. Appends `agent_run_logs`; does not change status. |
| POST | `/tasks/:id/complete` | `{ summary?, outputs?, metadata? }` → `completed`. 409 if terminal. |
| POST | `/tasks/:id/block` | `{ reason, needs?, metadata? }` → `blocked`. |
| GET | `/approvals` | `?status=` (comma-separated) `&limit=`. |
| GET | `/approvals/:id` | Single approval card (any status). |
| POST | `/approvals/:id/recommendation` | `{ recommendation, rationale?, risk_flags?, suggested_edits?, agent?, metadata? }`. Advisory only. |
| GET | `/campaigns` | `?status=&needs_review=true&limit=`. |
| GET | `/campaigns/:id` | Full campaign workspace. |
| GET | `/crm/leads` · `/crm/leads/:id` · `/crm/companies` · `/crm/contacts` | Read-only. `?status=&persona=&limit=` (+`source` for leads, `company_id` for contacts). |

### Normalized task object

```jsonc
{
  "id", "title", "description",
  "status": "pending|in_progress|blocked|needs_approval|completed|failed|canceled",
  "raw_status",            // native agent_task_status enum value
  "assignee",              // "mark" | agent name | "unassigned"
  "blocked_reason",        // metadata.blocked_reason → latest run-log error → null
  "created_at", "updated_at",
  "related_type",          // campaign | approval | <source_type> | other
  "related_id",
  "priority",
  "next_allowed_actions",  // e.g. ["log","complete","block"] — never approve/launch/send
  "outbound_locked": true
}
```

## TODO — MCP server (deferred)

A thin MCP wrapper over these routes is not yet built. When added, create
`src/lib/hermes-mcp/tools.ts` (or a standalone package) reading
`BSR_MARKETING_BASE_URL` + `HERMES_AGENT_API_TOKEN`, sending the bearer header
on every call. Tools (one HTTP call each):

`health`, `list_tasks` → `GET /tasks`, `get_task` → `GET /tasks/:id`,
`claim_task`, `log_task`, `complete_task`, `block_task`, `list_approvals`,
`get_approval`, `add_approval_recommendation` → `POST /approvals/:id/recommendation`,
`list_campaigns` / `get_campaign`, `search_crm` → `GET /crm/*`.

No tool maps to approve/launch/dispatch — the omission is the safety guarantee
at the MCP layer too.

## TODO — `campaigns/:id/mark-note` (deferred)

`campaign_event_type` has no `note` value and `approval_recommendations` is
FK-bound to approval items, so a campaign-level note needs a dedicated
`mark_notes` table in a future migration before the endpoint is added.

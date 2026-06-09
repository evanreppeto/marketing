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
| GET | `/approvals/:id` | Single approval card (any status) **+ Mark's recommendations**. |
| POST | `/approvals/:id/recommendation` | `{ recommendation, rationale?, risk_flags?, suggested_edits?, agent?, metadata? }`. Advisory only. Secrets redacted. |
| GET | `/approvals/:id/recommendations` | Read back recommendations (newest first). |
| POST | `/drafts` | `{ item_type, draft, title?, summary?, risk_level?, prompt_inputs?, campaign_id?, company_id?, contact_id?, lead_id?, task_id?, metadata? }`. Creates a **pending_approval, locked** item in the human queue. Never approves/launches. Secrets redacted. |
| GET | `/campaigns` | `?status=&needs_review=true&limit=`. |
| GET | `/campaigns/:id` | Full campaign workspace. |
| GET | `/crm/leads` · `/crm/leads/:id` | Read-only. `?status=&persona=&source=&q=&min_score=&max_score=&limit=`. |
| GET | `/crm/companies` | `?status=&persona=&partner_tier=&q=&limit=` (`q` = name search). |
| GET | `/crm/contacts` | `?status=&persona=&company_id=&q=&limit=` (`q` = name/email search). |
| GET | `/crm/properties` | `?persona=&city=&state=&postal_code=&property_type=&company_id=&q=&limit=` — geo (ZIP) discovery. |
| GET | `/crm/jobs` · `/crm/outcomes` | `?status=&persona=&company_id=&limit=`. |

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

## MCP server

Built: **`mark-runner/mcp_server.py`** — a Python MCP server (stdio) wrapping
these routes as tools, reading `BSR_MARKETING_BASE_URL` (falls back to
`APP_BASE_URL`) + `HERMES_AGENT_API_TOKEN` and sending the bearer header on every
call via stdlib `urllib`. Run: `pip install -r mark-runner/requirements.txt` then
`python mark-runner/mcp_server.py`. Tools: `health`, `list_tasks`, `get_task`,
`claim_task`, `log_task`, `complete_task`, `block_task`, `list_approvals`,
`get_approval`, `list_approval_recommendations`, `add_approval_recommendation`,
`list_campaigns`, `get_campaign`, `create_draft`, `search_crm`. No tool maps to
approve/launch/send/dispatch — the omission is the safety guarantee at the MCP
layer too.

## TODO — `campaigns/:id/mark-note` (deferred)

`campaign_event_type` has no `note` value and `approval_recommendations` is
FK-bound to approval items, so a campaign-level note needs a dedicated
`mark_notes` table in a future migration before the endpoint is added.

# mark-runner

Glue for connecting **Mark** (Hermes, `mark` profile) to the BSR growth engine's
event-driven chat. Mark already is the agent runtime — its own model, memory,
tools, and identity — so this folder is **not** a second agent. It's the contract
plus a reference poller; Mark runs the turns.

- **`MARK.md`** — the integration contract. Endpoints, auth, payload shapes, status
  lifecycle, guardrails. Read this first; hand it to whoever wires Mark.
- **`poller.py`** — stdlib-only reference worker: pull the inbox → *(Mark answers)* →
  post the reply. The model call is a clearly-marked hole (`generate_reply`).
- **`mcp_server.py`** — an MCP server exposing the **Mark Operations API**
  (`/api/v1/hermes/*`) as agent tools, so Mark calls native tools instead of raw
  HTTP. Read-only/advisory/draft tools only — nothing that approves, launches, or
  sends. See `../docs/mark-operations-api.md` for the endpoints behind each tool.
- **`.env.example`** — config for the poller and MCP server.
- **`requirements.txt`** — the MCP server's one dependency (`mcp`). The poller and
  webhook stay stdlib-only.

## Run the poller

```bash
cp .env.example .env        # fill APP_BASE_URL + HERMES_AGENT_API_TOKEN
# implement generate_reply() in poller.py (Mark's Hermes turn)
set -a; . ./.env; set +a
python3 poller.py           # one drain pass, then exits
```

Wire it to a **Hermes cron** firing every ~10s so each run does one drain and
exits — idle is free (an empty inbox invokes no model). The inbox GET claims each
task and retries stale ones, so a plain GET→reply loop is safe with no locking.

## Run the MCP server

```bash
cp .env.example .env        # fill BSR_MARKETING_BASE_URL + HERMES_AGENT_API_TOKEN
pip install -r requirements.txt
set -a; . ./.env; set +a
python3 mcp_server.py        # stdio transport
```

Register it with Mark's MCP client (stdio). Tools: `health`, `list_tasks`,
`get_task`, `claim_task`, `log_task`, `complete_task`, `block_task`,
`list_approvals`, `get_approval`, `list_approval_recommendations`,
`add_approval_recommendation`, `list_campaigns`, `get_campaign`, `create_draft`,
`search_crm`. None can approve/launch/send — that omission is the safety
guarantee at the MCP layer.

## Phasing

- **Now (polling):** leave the app's `MARK_RUNNER_URL` unset; the poller drains the
  queue. No public URL, no tunnel, no signature setup.
- **Later (webhook push):** expose a Hermes webhook subscription behind a tunnel,
  set `MARK_RUNNER_URL`, and align the `X-Webhook-Signature` format (see MARK.md).
  Keep the poller running underneath as the safety net.

## Guardrail

Outbound is locked — Mark drafts and advises but never sends. Anything outbound
goes through the operator approval flow in the app. See MARK.md.

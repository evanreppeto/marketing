# arc-runner

Glue for connecting **Arc** (Claude agent profile) to the BSR growth engine's
event-driven chat. Arc already is the agent runtime — its own model, memory,
tools, and identity — so this folder is **not** a second agent. It's the contract
plus a reference poller; Arc runs the turns.

- **`ARC.md`** — the integration contract. Endpoints, auth, payload shapes, status
  lifecycle, guardrails. Read this first; hand it to whoever wires Arc.
- **`poller.py`** — stdlib-only reference worker: pull the inbox → *(Arc answers)* →
  post the reply. The model call is a clearly-marked hole (`generate_reply`).
- **`mcp_server.py`** — an MCP server exposing the **Arc Operations API**
  (`/api/v1/arc/*`) as agent tools, so Arc calls native tools instead of raw
  HTTP. Read-only/advisory/draft tools only — nothing that approves, launches, or
  sends. See `../docs/arc-operations-api.md` for the endpoints behind each tool.
- **`.env.example`** — config for the poller and MCP server.
- **`requirements.txt`** — pip dependencies: `mcp` (MCP server) and `realtime`
  (realtime subscriber). The poller and webhook stay stdlib-only.

## Run the poller

```bash
cp .env.example .env        # fill APP_BASE_URL + ARC_AGENT_API_TOKEN
# implement generate_reply() in poller.py (Arc's Claude turn)
set -a; . ./.env; set +a
python3 poller.py           # one drain pass, then exits
```

Wire it to an **Arc cron** firing every ~10s so each run does one drain and
exits — idle is free (an empty inbox invokes no model). The inbox GET claims each
task and retries stale ones, so a plain GET→reply loop is safe with no locking.

## Run the realtime subscriber (lowest latency)

```bash
cp .env.example .env        # fill SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ APP_BASE_URL, ARC_AGENT_API_TOKEN)
pip install -r requirements.txt
set -a; . ./.env; set +a
python3 realtime_subscriber.py
```

The subscriber holds an outbound WebSocket to Supabase and answers each operator
message the instant it's queued — no public URL, no tunnel, no signatures. It
imports Arc's turn (`generate_reply`) and reply delivery (`deliver`) from
`ARC_WORKER_MODULE` (default `poller`); set that env var if Arc's worker lives
in another module. Keep the poller running too (cron) as the safety net — the CAS
claim and idempotent replies guarantee the two paths never double-answer.

### Auto-start on the Mac mini (launchd)

```bash
# From the arc-runner dir, substitute the real paths into the plist:
PYBIN="$(command -v python3)"
sed -e "s#__ARC_RUNNER_DIR__#$(pwd)#g" -e "s#__PYTHON__#${PYBIN}#g" \
  com.bsr.arc-realtime.plist > ~/Library/LaunchAgents/com.bsr.arc-realtime.plist
launchctl load ~/Library/LaunchAgents/com.bsr.arc-realtime.plist
launchctl start com.bsr.arc-realtime
# logs: tail -f arc-realtime.log arc-realtime.err.log
```

## Run the MCP server

```bash
cp .env.example .env        # fill BSR_MARKETING_BASE_URL + ARC_AGENT_API_TOKEN
pip install -r requirements.txt
set -a; . ./.env; set +a
python3 mcp_server.py        # stdio transport
```

Register it with Arc's MCP client (stdio). Tools: `health`, `list_tasks`,
`get_task`, `claim_task`, `log_task`, `complete_task`, `block_task`,
`list_approvals`, `get_approval`, `list_approval_recommendations`,
`add_approval_recommendation`, `list_campaigns`, `get_campaign`, `create_draft`,
`search_crm`. None can approve/launch/send — that omission is the safety
guarantee at the MCP layer.

## Phasing

- **Now (lowest latency):** run `realtime_subscriber.py` — outbound socket to
  Supabase, sub-second replies, nothing inbound to expose. Keep the poller as the
  safety net. (Supersedes the webhook-push phase, which needed a public tunnel.)
- **Now (polling):** leave the app's `ARC_RUNNER_URL` unset; the poller drains the
  queue. No public URL, no tunnel, no signature setup.
- **Later (webhook push):** expose an Arc webhook subscription behind a tunnel,
  set `ARC_RUNNER_URL`, and align the `X-Webhook-Signature` format (see ARC.md).
  Keep the poller running underneath as the safety net.

## Guardrail

Outbound is locked — Arc drafts and advises but never sends. Anything outbound
goes through the operator approval flow in the app. See ARC.md.

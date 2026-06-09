# mark-runner

Glue for connecting **Mark** (Hermes, `mark` profile) to the BSR growth engine's
event-driven chat. Mark already is the agent runtime — its own model, memory,
tools, and identity — so this folder is **not** a second agent. It's the contract
plus a reference poller; Mark runs the turns.

- **`MARK.md`** — the integration contract. Endpoints, auth, payload shapes, status
  lifecycle, guardrails. Read this first; hand it to whoever wires Mark.
- **`poller.py`** — stdlib-only reference worker: pull the inbox → *(Mark answers)* →
  post the reply. The model call is a clearly-marked hole (`generate_reply`).
- **`.env.example`** — config for the poller.

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

## Phasing

- **Now (polling):** leave the app's `MARK_RUNNER_URL` unset; the poller drains the
  queue. No public URL, no tunnel, no signature setup.
- **Later (webhook push):** expose a Hermes webhook subscription behind a tunnel,
  set `MARK_RUNNER_URL`, and align the `X-Webhook-Signature` format (see MARK.md).
  Keep the poller running underneath as the safety net.

## Guardrail

Outbound is locked — Mark drafts and advises but never sends. Anything outbound
goes through the operator approval flow in the app. See MARK.md.

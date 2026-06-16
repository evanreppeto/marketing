# Arc Chat Realtime Push — Design

Date: 2026-06-15
Status: Proposed
Owner: Evan

## Problem

The Arc agent (Arc) on the Mac mini is connected and answering operator chat
messages — but only through the slow safety-net poller. The fast "instant wake"
path is broken: `ARC_RUNNER_URL` pointed at an ephemeral `trycloudflare` quick
tunnel that has expired (DNS no longer resolves). These quick tunnels die on
every restart, so any push path that requires the app to reach *into* the Mac
mini is inherently fragile behind a home network.

Goal: **lowest-latency** chat replies (sub-second), with no recurring "the tunnel
died" failure mode.

### Current verified state (2026-06-15)

- `agent_connections`: `last_status: "ok"`, `last_seen_at` ticks ~every 60s — the
  poller is alive and authenticating against the prod (Vercel) app.
- `agents`: a `arc` agent row exists, `status: active`, outbound actions blocked
  (`send_email`, `publish_social`, `launch_ads`, …). Safety boundary intact.
- `agent_api_tokens`: none issued — auth relies solely on the static
  `ARC_AGENT_API_TOKEN` env var (set on Vercel; empty in local `.env.local`).
- Instant-wake push: **broken** (tunnel host does not resolve).
- Only seed/demo rows in `arc_messages` / `agent_tasks` — no recent real
  round-trips.

## Approach

**Supabase Realtime push.** The Mac mini opens an *outbound* WebSocket to Supabase
and subscribes to `INSERT`s on `public.agent_tasks` filtered to
`task_type = arc_chat_message`. The app already inserts that row the instant an
operator sends a message (`enqueueMarkChatTask`). Supabase pushes the event down
the open socket in sub-second time; the Mac mini claims the task, runs Arc, and
POSTs the reply back to the Vercel app (a direction that already works).

Why this over a durable inbound tunnel (Tailscale/Cloudflare + the existing
`webhook.py`): both achieve sub-second latency, but Realtime needs **no public URL,
no tunnel, no HMAC signatures, and nothing to keep alive**. The outbound socket
traverses home NAT and auto-reconnects after reboots/blips — it deletes the
failure mode that keeps recurring.

## Components

1. **App (Vercel) — no delivery-logic change.** `enqueueMarkChatTask`
   (`src/lib/arc-chat/enqueue.ts`) already inserts the `agent_tasks` row with
   `task_type: "arc_chat_message"`, `status: "queued"`, and message context in
   `objective` + `metadata`.

2. **Migration** — add `agent_tasks` to the `supabase_realtime` publication so
   inserts are broadcast. Pre-check (step one of implementation): confirm RLS is
   enabled on `agent_tasks` and whether the table is already in the publication.
   If already present, the migration is a safe no-op.

3. **`arc-runner/realtime_subscriber.py`** (new) — the low-latency receiver:
   - Connect to Supabase Realtime (outbound WSS) authenticated with the
     service-role key; subscribe to `INSERT` on `agent_tasks`,
     filter `task_type=eq.arc_chat_message`.
   - On event, **claim** via compare-and-set directly against the DB:
     `UPDATE agent_tasks SET status='running', started_at=now()
      WHERE id=:id AND status='queued'`. Zero rows affected → another path
     (poller/retry) already took it; skip. This is the same CAS as
     `claimChatTask`, so subscriber and poller can never double-answer.
   - Build the message dict from the row (`objective`, `metadata.conversation_id`,
     `metadata.mentions`, `metadata.requested_by`, …) — the same shape the webhook
     payload used.
   - Call `generate_reply(message)` then `deliver(agentTaskId, text, status)`,
     imported from a **configurable module** (env `ARC_WORKER_MODULE`, default
     `poller`) — matching how `webhook.py` imports today. Whatever Arc's real
     worker module is on the Mac mini, it's a one-env-var change, no code edit.
   - On any failure, `deliver(..., "failed")` with a short body so the thread
     never hangs on "thinking".
   - Auto-reconnect on socket drop; log a heartbeat.

4. **`arc-runner/com.bsr.arc-realtime.plist`** (new) — a `launchd` job so the
   subscriber auto-starts on boot and restarts on crash (`KeepAlive`).

5. **Docs/config** — update `arc-runner/.env.example` (new `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ARC_WORKER_MODULE`), `arc-runner/README.md`
   (run the subscriber; phasing note), and `arc-runner/requirements.txt`
   (add `realtime`). Poller and webhook stay stdlib-only; the subscriber is the
   one component that takes the dependency.

6. **Diagnostic** — productionize the throwaway `scripts/diagnose-arc-connection.mjs`
   (read-only live connection report) and add a `pnpm` alias
   (`diagnose:arc`) so connection state is checkable on demand.

## Data flow

```
operator send
  → app inserts agent_tasks (queued)          [already built]
  → Supabase Realtime broadcasts INSERT
  → Mac mini subscriber claims (CAS queued→running)
  → generate_reply(message)                    [Arc's turn]
  → POST /api/v1/arc/messages               [already built; settles task]
  → reply appears in the thread
```

Poller continues to run underneath as the safety net for any missed event.

## Error handling & idempotency

- **Exactly-once:** CAS claim (`status='queued'` guard) means only the first of
  subscriber/poller/retry wins a given task.
- **Reply idempotency:** `POST /api/v1/arc/messages` 404s if the pending
  message was already settled, so a late duplicate is harmless.
- **Subscriber down:** poller catches queued tasks on its next pass; stale
  `running` tasks are reclaimed by `reclaimStaleChatTasks` (existing).
- **Socket drop:** subscriber auto-reconnects; missed-while-down events are
  caught by the poller.
- **Turn failure:** delivered as `status: "failed"` so the bubble resolves.

## Security

- Service-role key lives only on the Mac mini (the trusted agent host, which
  already holds privileged API access). It bypasses RLS, so the subscriber
  reliably receives events and can perform the CAS claim.
- Adding `agent_tasks` to the realtime publication is safe **only if RLS is
  enabled** on the table (anon/authed subscribers then get nothing without a
  policy). Verify RLS first; if it is somehow off, enable it / add no anon policy.
- Future least-privilege option (out of scope now): swap the service-role key for
  an anon key + a narrow `SELECT` RLS policy on `task_type='arc_chat_message'`
  and a dedicated claim RPC.
- **Outbound stays locked.** This changes only how fast *chat replies* arrive.
  No change to approvals, drafts, or any outbound action — the agent still cannot
  send/publish/launch.

## Testing

- **Unit (subscriber helpers):** row→message mapping; CAS-claim returns false on
  an already-claimed task (idempotency).
- **Live end-to-end:** insert a real `queued` `arc_chat_message` task; confirm
  the subscriber claims + delivers a reply in < ~2s; confirm a second claim
  attempt / duplicate reply 404s rather than double-answering.
- **Reconnect:** kill the socket; confirm auto-reconnect and that a task enqueued
  during the outage is still answered (by poller, then subscriber resumes).

## Out of scope

- Replacing the static env token with app-issued `sk_live_` tokens (works today;
  optional hardening later).
- Hosting the runner off the Mac mini.
- Streaming step telemetry (`/messages/{id}/steps`) — separate enhancement.

## Work split

- **I build:** migration, `realtime_subscriber.py`, `launchd` plist, `.env.example`
  + README + `requirements.txt` updates, productionized diagnostic + `pnpm` alias,
  unit tests.
- **You do:** put `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (and, if needed,
  `ARC_WORKER_MODULE`) in the Mac mini's `arc-runner/.env`; run the subscriber
  / load the launchd job; confirm Vercel has `ARC_AGENT_API_TOKEN`.

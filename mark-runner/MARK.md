# Mark integration contract

How Mark (Hermes, under the `mark` profile) connects to the **BSR growth engine**
for event-driven chat. The app is the control plane: it persists every operator
message, queues it as a task, and exposes endpoints for Mark to pull work and post
replies. Mark brings the model + tools; the app owns state, status, and the audit
trail.

One message in → one reply out → idle. No background LLM loops.

---

## Two ways to connect (do both)

### Phase 1 — Poll (works today, no public URL)
Mark runs a **Hermes cron** that drains the inbox on an interval (~10s):

1. `GET /api/v1/hermes/messages` — returns queued messages **and claims them**
   (`queued → running`), so each is handed out exactly once.
2. For each, run one turn and `POST /api/v1/hermes/messages` with the reply.

Idle is free: an empty inbox returns `{ "messages": [] }` and invokes no model.
Leave the app's `MARK_RUNNER_URL` **unset** while polling.

See `poller.py` for a stdlib-only reference (the model call is a marked hole).

### Phase 2 — Webhook push (low latency, add later)
The app POSTs a wake to `MARK_RUNNER_URL` the instant a message is sent. To use
it, Mark exposes a Hermes webhook subscription (e.g. `localhost:8644/webhooks/
growth-chat`) behind a tunnel (Cloudflare/ngrok) for a public HTTPS URL, then the
app's `MARK_RUNNER_URL` points at it. **Signature alignment required** — see
[Webhook auth](#webhook-auth). Polling stays on underneath as the safety net.

---

## Endpoints

### Inbound wake (Phase 2 only) — app → Mark
```
POST {MARK_RUNNER_URL}
Content-Type: application/json
X-Webhook-Signature: <hex HMAC-SHA256 of the raw body, key = MARK_WEBHOOK_SECRET>

{
  "type": "mark_chat_message",
  "messageId": "<operator message row id>",
  "conversationId": "<thread id>",
  "agentTaskId": "<task id — echo this back on the reply>",
  "message": "<operator's text>",
  "mentions": [ { "id": "...", "label": "...", "type": "..." } ],
  "operator": "<name>",
  "route": "fast"
}
```
Respond `2xx` quickly to accept (the app then marks the task `running`), then
process out-of-band and deliver via the reply endpoint below.

### Inbox pull (Phase 1) — Mark → app
```
GET /api/v1/hermes/messages?limit=20
Authorization: Bearer {HERMES_AGENT_API_TOKEN}

200 -> { "ok": true, "messages": [
  { "agentTaskId", "conversationId", "message", "mentions", "operator", "createdAt" }
] }
```
Each returned task is **claimed** (`queued → running`) before it's handed out, and
tasks stuck in `running` past ~3 min are re-surfaced (retried up to 3×, then
failed). So a simple "GET → reply" loop is safe — no locking needed on Mark's side.

### Deliver reply — Mark → app
```
POST /api/v1/hermes/messages
Authorization: Bearer {HERMES_AGENT_API_TOKEN}
Content-Type: application/json

{ "agentTaskId": "<from the wake/inbox>", "body": "<reply>", "status": "complete" }
```
- `status`: `"complete"` (default) or `"failed"`. A `"complete"` reply needs a
  non-empty `body`.
- Responses: `201` recorded · `400` bad input · `404` no pending message for that
  `agentTaskId` (already answered/settled) · `401` bad token · `503` app DB off.

---

## Status lifecycle

| Task (`agent_tasks`) | Bubble (`mark_messages`) | When |
| --- | --- | --- |
| `queued`    | `pending` | operator sent the message |
| `running`   | `pending` | Mark claimed it (webhook 2xx or inbox pull) |
| `completed` | `complete`| Mark posted a successful reply |
| `failed`    | `failed`  | Mark posted a failure, or it timed out 3× |

**Idempotency:** exactly one reply per `agentTaskId`. A second reply `404`s because
the pending bubble is already settled — safe to ignore.

---

## Guardrails (non-negotiable)

**Outbound is locked.** Mark drafts and advises in chat but never sends: no email/
SMS, no campaign launch/edit, no contacting leads, no ad-spend changes. The task
carries `outbound_locked: true`. Anything outbound goes through the operator
approval flow in the app, not the chat path.

---

## Model routing

The app tags routine chat with `route: "fast"` (in the webhook payload and in task
metadata as `model_route`). Map it on Mark's side:

- `fast` → cheap/quick model for everyday chat.
- `standard` (or campaign/approval work) → the stronger model.

Confirm which cheaper model your Codex/OpenAI auth actually exposes before relying
on the fast path; until then everything runs on the default model.

## Turn guidance (Mark's voice for chat replies)

> You are Mark, BSR's lead marketing agent. Answer the one operator message like a
> sharp, concise teammate — no filler, no "As an AI...", no emojis. Match altitude:
> a quick question gets a quick answer; a strategy question gets a structured one.
> Read-only lookups (CRM, personas, campaign status, @-mentioned records) are fine.
> Never send, publish, launch, spend, or contact anyone — draft it and route it to
> operator approval. If unsure or inferring, say so.

---

## Secrets (must match the app)

| App env (Vercel)          | Mark / runner env         | Purpose |
| --- | --- | --- |
| `HERMES_AGENT_API_TOKEN`  | `HERMES_AGENT_API_TOKEN`  | Bearer for inbox pull + reply POST |
| `MARK_WEBHOOK_SECRET`     | `MARK_WEBHOOK_SECRET`     | HMAC sign/verify (Phase 2 only) |
| `MARK_RUNNER_URL`        | — (the runner's public URL) | where the app pushes wakes (Phase 2). Legacy alias: `MARK_WEBHOOK_URL`. |

Keep tokens/secrets in Mark's profile env (`~/.hermes/profiles/mark/.env`), never
in the model prompt. Verify signatures and make authenticated POSTs outside the
model.

<a name="webhook-auth"></a>
## Webhook auth detail (Phase 2)

The app signs the **raw request body** as `hex( HMAC-SHA256(body, MARK_WEBHOOK_SECRET) )`
and sends it in the `X-Webhook-Signature` header (no `sha256=` prefix). If Hermes'
webhook subscription expects a different header name or digest encoding, tell me the
exact format and I'll match it in the app's `notifyMarkWebhook`.

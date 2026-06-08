# Hermes ⇄ Mark Chat — Agent Integration Contract

This is everything your external **Hermes/Mark agent** needs to power the in-app
chat at `/mark`. The app holds the conversation; your agent supplies the replies.
Everything is plain HTTP with one bearer token — the same pattern as
`/api/v1/hermes/runs`. **Outbound stays locked**: the chat never sends anything
to customers; your agent only returns text (and may, separately, use `/runs`).

## Auth

All endpoints require:

```
Authorization: Bearer <HERMES_AGENT_API_TOKEN>
```

`HERMES_AGENT_API_TOKEN` must be set in the app's deployment env (Vercel). Same
token gates `/runs`, `/ping`, and the chat endpoints below.

Base URL = your deployment, e.g. `https://<your-vercel-app>` (use `/api/v1/hermes/ping` to confirm reachability + auth).

## The loop

```
   ┌────────────────────────────────────────────────────────────┐
   │ 1. operator types in /mark  → app queues an agent_task       │
   │ 2. your agent: GET /api/v1/hermes/messages   (pull queue)    │
   │ 3. your agent does the work (read data, run /runs, reason…)  │
   │ 4. your agent: POST /api/v1/hermes/messages  (deliver reply) │
   │ 5. app flips the "thinking" bubble → your reply appears      │
   └────────────────────────────────────────────────────────────┘
```

Poll step 2 on whatever interval you like (a few seconds is fine). The inbox is
**read-only and idempotent** — a message stays in the queue until you deliver its
reply, so polling can't lose or double-consume work.

## Push: get woken on each message (recommended — Telegram-style)

Instead of polling, let the app wake Mark only when a message is sent. Set two
env vars on **Mark's** side and one on the app:

- App (Vercel): `MARK_WEBHOOK_URL` = the agent endpoint to call; optional
  `MARK_WEBHOOK_SECRET` = a shared secret.

When an operator sends a chat message, the app immediately `POST`s to
`MARK_WEBHOOK_URL`:

```
POST <MARK_WEBHOOK_URL>
Authorization: Bearer <MARK_WEBHOOK_SECRET>   (only if you set the secret)
Content-Type: application/json

{
  "type": "mark_chat_message",
  "agentTaskId": "uuid",
  "conversationId": "uuid",
  "message": "operator's text",
  "mentions": [ { "type": "...", "id": "...", "label": "...", "href": "..." } ],
  "operator": "evan@…"
}
```

Your endpoint should:
1. Verify the `Authorization` secret (if set) and **respond `200` immediately**
   (do the slow work async — like a Telegram webhook).
2. Compose the answer, then deliver it with the reply call in section 2:
   `POST /api/v1/hermes/messages { agentTaskId, body, metadata? }`.

That's it — no polling, no idle cost; Mark runs only when there's a message.
The call is best-effort (3s timeout); if your endpoint is down the message stays
queued and you can still pull it via the inbox below.

## 1. Pull pending messages (fallback / catch-up)

```
GET /api/v1/hermes/messages?limit=20
Authorization: Bearer <token>
```

`200` response:

```json
{
  "ok": true,
  "status": "ok",
  "messages": [
    {
      "agentTaskId": "uuid",          // echo this back when you reply
      "conversationId": "uuid",
      "message": "How is the roof-storm push doing?",
      "mentions": [
        { "type": "campaign", "id": "uuid", "label": "Roof storm push", "href": "/campaigns/uuid" }
      ],
      "operator": "evan@…",
      "createdAt": "2026-06-08T…Z"
    }
  ]
}
```

- `mentions[].type` is one of: `campaign | lead | company | contact | property | job | outcome | persona | vault`.
  Use `id` to fetch the referenced record for grounding (e.g. a campaign id, a
  persona key like `persona_insurance_agent`, a vault note slug).
- `message` is the operator's raw text.
- Errors: `401` bad/missing token, `503` Supabase/token not configured, `502` read error.

## 2. Deliver a reply

```
POST /api/v1/hermes/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "agentTaskId": "uuid",        // required — the one you pulled
  "body": "Here's where it stands: …",   // required for a completed reply
  "status": "complete",          // optional: "complete" (default) | "failed"
  "metadata": { }                 // optional: stored on the message
}
```

- `201` `{ ok: true, status: "recorded", messageId }` — the chat bubble updates and
  the task leaves the queue.
- `400` missing `agentTaskId`, or empty `body` on a completed reply.
- `404` no pending message for that `agentTaskId` (already answered / unknown).
- `401` / `503` as above.

Use `status: "failed"` with a short `body` if your agent can't complete the
request — the operator sees it as a failed reply instead of an endless spinner.

### Attaching media (images / video Mark created)

Put generated media in `metadata.media` — an array of items. The chat renders
them as a gallery under the reply (images open in a fullscreen lightbox; video
plays inline).

```json
{
  "agentTaskId": "uuid",
  "body": "Here are three ad concepts for the roof-storm push:",
  "metadata": {
    "media": [
      { "kind": "image", "url": "https://…/concept-a.png", "caption": "Concept A — urgency",
        "alt": "Storm-damaged roof with CTA", "href": "/campaigns/uuid" },
      { "kind": "image", "url": "https://…/concept-b.png", "caption": "Concept B — trust" },
      { "kind": "video", "url": "https://…/teaser.mp4", "poster": "https://…/teaser.jpg",
        "caption": "15s teaser" }
    ]
  }
}
```

Per-item fields: `kind` (`"image"` | `"video"`, required), `url` (required),
and optional `thumbnailUrl`, `poster` (video), `caption`, `alt`, `href` (a link
shown as "Open ▸", e.g. into the campaign/approval). `url` must be publicly
fetchable by the browser (e.g. a Supabase Storage public URL or signed URL).
Items with an unknown `kind` or missing `url` are dropped.

## Where the message came from (if you read Supabase directly)

If your agent connects to Postgres instead of (or in addition to) the HTTP inbox:
operator messages are queued in `public.agent_tasks` with
`task_type = 'mark_chat_message'`, `status = 'queued'`, `objective = <message>`,
and `metadata = { conversation_id, message_id, mentions, requested_by, outbound_locked: true }`.
The conversation + messages live in `public.mark_conversations` / `public.mark_messages`.
Prefer the HTTP endpoints above — they keep the "thinking" bubble and task status
in sync for you.

## Related endpoints (already live)

- `GET  /api/v1/hermes/ping` — connectivity + auth + `supabaseConfigured` check.
- `POST /api/v1/hermes/runs` — run the deterministic partner-campaign workflow
  (creates an approval-gated draft; outbound locked). Call this from inside your
  agent when a chat request warrants kicking off a campaign.

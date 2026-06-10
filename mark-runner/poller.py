#!/usr/bin/env python3
"""
Reference poller for the BSR growth engine <-> Mark (Hermes) chat loop.

Drains the app's queued Mark messages, lets Mark answer each one, and posts the
reply back. Built to be fired by a Hermes cron (one drain per run, then exit), so
idle costs nothing: the inbox GET is a cheap authenticated request that returns an
empty list when there's nothing to do, and the model is invoked ONLY when a real
message is waiting.

    GET  {APP_BASE_URL}/api/v1/hermes/messages   (Bearer)  -> queued messages
    for each:  reply = generate_reply(msg)                  <-- Mark's turn HERE
    POST {APP_BASE_URL}/api/v1/hermes/messages   (Bearer)  -> deliver the reply

The inbox GET claims each task (queued -> running) before returning it and also
re-surfaces tasks stuck in `running`, so messages are processed exactly once and a
crashed turn is retried rather than lost. See MARK.md for the full contract.

Stdlib only — no pip install. Configure via env (see .env.example):
    APP_BASE_URL, HERMES_AGENT_API_TOKEN, optional MARK_POLL_LIMIT.
"""
import json
import os
import sys
import urllib.error
import urllib.request

APP_BASE_URL = os.environ.get("APP_BASE_URL", "").rstrip("/")
TOKEN = os.environ.get("HERMES_AGENT_API_TOKEN", "")
LIMIT = int(os.environ.get("MARK_POLL_LIMIT", "5"))


def _request(method, path, payload=None):
    url = f"{APP_BASE_URL}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("authorization", f"Bearer {TOKEN}")
    if data is not None:
        req.add_header("content-type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as res:
        body = res.read().decode("utf-8")
        return res.status, (json.loads(body) if body else {})


def fetch_inbox():
    """Pull (and claim) queued messages. Returns [] on anything but a clean 200."""
    try:
        status, body = _request("GET", f"/api/v1/hermes/messages?limit={LIMIT}")
    except urllib.error.HTTPError as err:
        print(f"[mark] inbox GET failed: {err.code} {err.reason}", file=sys.stderr)
        return []
    return body.get("messages", []) if status == 200 else []


def deliver(agent_task_id, text, status="complete"):
    """Post Mark's reply back, settling the task (running -> completed/failed)."""
    return _request(
        "POST",
        "/api/v1/hermes/messages",
        {"agentTaskId": agent_task_id, "body": text, "status": status},
    )


def generate_reply(message):
    """
    >>> Mark plugs in HERE. <<<

    `message` is a dict: { agentTaskId, conversationId, message, mentions,
    operator, createdAt }. Run exactly ONE Hermes turn with Mark's own model and
    return the reply text.

    - Route the cheap/fast model for routine chat; reserve the strong model for
      heavier work (the app marks routine chat with route "fast" in task metadata).
    - OUTBOUND IS LOCKED: never send email/SMS, launch/edit campaigns, contact
      leads, or change spend. Draft and advise in the reply; sending goes through
      the operator approval flow in the app.
    - Raise an exception on failure so the caller delivers a 'failed' status and
      the operator's thread shows what happened instead of hanging.
    """
    raise NotImplementedError("Wire Mark's Hermes turn here, then return the reply text.")


def main():
    if not APP_BASE_URL or not TOKEN:
        print("APP_BASE_URL and HERMES_AGENT_API_TOKEN must be set", file=sys.stderr)
        sys.exit(1)

    messages = fetch_inbox()
    if not messages:
        return  # idle — no model invoked

    for msg in messages:
        task_id = msg["agentTaskId"]
        try:
            reply = generate_reply(msg)
            deliver(task_id, reply, "complete")
            print(f"[mark] replied to {task_id}")
        except Exception as err:  # noqa: BLE001 - any failure becomes a failed reply
            deliver(task_id, f"Mark couldn't complete this reply: {err}", "failed")
            print(f"[mark] failed {task_id}: {err}", file=sys.stderr)


if __name__ == "__main__":
    main()

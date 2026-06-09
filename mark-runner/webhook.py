#!/usr/bin/env python3
"""
Instant-wake webhook receiver for the BSR growth engine <-> Mark (Hermes) chat.

This is the low-latency Phase-2 path. The app POSTs a signed wake to
MARK_RUNNER_URL the instant an operator sends a message; this server receives it,
verifies the signature, answers from the payload, and posts Mark's reply back —
no waiting for the next poll. The payload already carries the full message, so the
handler does NOT need to pull the inbox.

    app  --POST (X-Webhook-Signature)-->  this server   (respond 202 fast)
    this server  --generate_reply()-->    Mark's turn
    this server  --POST reply-->           {APP_BASE_URL}/api/v1/hermes/messages

Keep poller.py running too (a ~10s cron): it's the safety net for any wake that
didn't land. Replies are idempotent per agentTaskId, so the two paths never
double-answer — a late duplicate just 404s.

Stdlib only — no pip install. Configure via env (see .env.example):
    APP_BASE_URL, HERMES_AGENT_API_TOKEN, MARK_WEBHOOK_SECRET,
    optional MARK_WEBHOOK_PORT (default 8644), MARK_WEBHOOK_PATH (default /webhooks/growth-chat).

Run:
    set -a; . ./.env; set +a
    python3 webhook.py
Then expose it publicly (see MARK.md) and point the app's MARK_RUNNER_URL at
{public-https-url}{MARK_WEBHOOK_PATH}.
"""
import hashlib
import hmac
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Reuse the existing Mark chat worker's turn + delivery. This reference imports
# from poller.py; a deployed host may instead have its worker in another module
# (e.g. bsr_mark_chat_worker.py) — point this import at whatever exposes
# generate_reply(message) and deliver(agentTaskId, text, status).
from poller import deliver, generate_reply

SECRET = os.environ.get("MARK_WEBHOOK_SECRET", "")
PORT = int(os.environ.get("MARK_WEBHOOK_PORT", "8644"))
PATH = os.environ.get("MARK_WEBHOOK_PATH", "/webhooks/growth-chat")


def _signature_ok(raw_body: bytes, header_value: str) -> bool:
    """Constant-time compare of the app's HMAC-SHA256 hex digest of the raw body.

    When no secret is configured we accept (loopback/dev only) — matching the app,
    which omits the header when MARK_WEBHOOK_SECRET is unset. In production, set the
    secret on BOTH sides so unsigned/forged wakes are rejected.
    """
    if not SECRET:
        return True
    if not header_value:
        return False
    expected = hmac.new(SECRET.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header_value.strip())


def _process(message: dict) -> None:
    """Run Mark's turn for one wake and deliver the reply (off the request thread)."""
    task_id = message.get("agentTaskId")
    if not task_id:
        return
    try:
        reply = generate_reply(message)
        deliver(task_id, reply, "complete")
        print(f"[mark] wake replied to {task_id}")
    except Exception as err:  # noqa: BLE001 - any failure becomes a failed reply
        try:
            deliver(task_id, f"Mark couldn't complete this reply: {err}", "failed")
        except Exception as deliver_err:  # noqa: BLE001
            print(f"[mark] wake deliver-failed {task_id}: {deliver_err}", file=sys.stderr)
        print(f"[mark] wake failed {task_id}: {err}", file=sys.stderr)


class WakeHandler(BaseHTTPRequestHandler):
    def _reply(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802 - stdlib naming
        if PATH and self.path.split("?", 1)[0] != PATH:
            self._reply(404, {"ok": False, "error": "not_found"})
            return

        length = int(self.headers.get("content-length", "0") or "0")
        raw = self.rfile.read(length) if length else b""

        if not _signature_ok(raw, self.headers.get("x-webhook-signature", "")):
            self._reply(401, {"ok": False, "error": "bad_signature"})
            return

        try:
            payload = json.loads(raw.decode("utf-8")) if raw else {}
        except json.JSONDecodeError:
            self._reply(400, {"ok": False, "error": "invalid_json"})
            return

        if payload.get("type") != "mark_chat_message" or not payload.get("agentTaskId"):
            self._reply(400, {"ok": False, "error": "unexpected_payload"})
            return

        # Ack fast so the app claims the task immediately (no poller race), then do
        # Mark's turn out-of-band. The reply lands via POST when it's ready.
        threading.Thread(target=_process, args=(payload,), daemon=True).start()
        self._reply(202, {"ok": True, "status": "accepted"})

    def log_message(self, *_args) -> None:  # silence default per-request stderr noise
        return


def main() -> None:
    if not os.environ.get("APP_BASE_URL") or not os.environ.get("HERMES_AGENT_API_TOKEN"):
        print("APP_BASE_URL and HERMES_AGENT_API_TOKEN must be set", file=sys.stderr)
        sys.exit(1)
    if not SECRET:
        print("[mark] WARNING: MARK_WEBHOOK_SECRET unset — accepting unsigned wakes (dev only)", file=sys.stderr)

    server = ThreadingHTTPServer(("0.0.0.0", PORT), WakeHandler)
    print(f"[mark] wake receiver listening on :{PORT}{PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()

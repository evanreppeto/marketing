"""Pure, dependency-free helpers shared by the realtime subscriber.

Kept separate from the realtime/HTTP glue so the logic that can actually be
wrong — row→message mapping, exactly-once claim shaping — is unit-tested without
a live socket or network. Mirrors toInboxItem() in src/lib/mark-chat/inbox.ts.
"""
import json
import os
import urllib.request
from datetime import datetime, timezone


def is_chat_task(record):
    """True only for operator chat tasks (defensive — the realtime filter already
    restricts task_type=mark_chat_message, but updates/replays shouldn't slip through)."""
    return isinstance(record, dict) and record.get("task_type") == "mark_chat_message"


def extract_record(payload):
    """Pull the new row out of a realtime postgres_changes payload, tolerating the
    handful of shapes different realtime-py versions deliver."""
    if not isinstance(payload, dict):
        return {}
    if isinstance(payload.get("record"), dict):
        return payload["record"]
    data = payload.get("data")
    if isinstance(data, dict) and isinstance(data.get("record"), dict):
        return data["record"]
    if isinstance(payload.get("new"), dict):
        return payload["new"]
    return {}


def row_to_message(record):
    """Map an agent_tasks row to the dict shape generate_reply()/deliver() expect
    (same fields the poller's inbox items carry, plus routing hints)."""
    meta = record.get("metadata") or {}
    return {
        "agentTaskId": record.get("id"),
        "conversationId": meta.get("conversation_id", ""),
        "message": record.get("objective") or meta.get("human_instruction", ""),
        "mentions": meta.get("mentions", []) or [],
        "operator": meta.get("requested_by", "Operator"),
        "command": meta.get("command"),
        "attachments": meta.get("attachments", []) or [],
        "route": meta.get("model_route", "fast"),
        "mode": meta.get("mode", "act"),
        "createdAt": record.get("created_at"),
    }


def build_claim_request(task_id, supabase_url, service_key, now_iso):
    """Shape the PostgREST CAS request: update this row to running ONLY while it's
    still queued. An empty result set means another path already claimed it."""
    base = supabase_url.rstrip("/")
    url = f"{base}/rest/v1/agent_tasks?id=eq.{task_id}&status=eq.queued"
    body = json.dumps({"status": "running", "started_at": now_iso}).encode("utf-8")
    headers = {
        "apikey": service_key,
        "authorization": f"Bearer {service_key}",
        "content-type": "application/json",
        "prefer": "return=representation",
    }
    return url, body, headers


def claim_won(response_json):
    """The CAS won iff PostgREST returned the (one) updated row."""
    return isinstance(response_json, list) and len(response_json) > 0


def claim_task(task_id, supabase_url=None, service_key=None):
    """Atomically claim queued→running. Returns True iff this caller won the claim.

    Thin network wrapper around build_claim_request/claim_won. Network errors
    (urllib URLError/HTTPError, timeouts) propagate to the caller — the realtime
    subscriber treats any claim exception as "skip this one", and the poller
    safety net re-surfaces the task, so there is deliberately no retry here.
    """
    supabase_url = supabase_url or os.environ.get("SUPABASE_URL")
    service_key = service_key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to claim a task.")
    now_iso = datetime.now(timezone.utc).isoformat()
    url, body, headers = build_claim_request(task_id, supabase_url, service_key, now_iso)
    req = urllib.request.Request(url, data=body, method="PATCH", headers=headers)
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read().decode("utf-8")
    return claim_won(json.loads(raw) if raw else [])

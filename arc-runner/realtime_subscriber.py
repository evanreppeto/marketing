#!/usr/bin/env python3
"""
Lowest-latency receiver for the BSR growth engine <-> Arc chat.

Opens an OUTBOUND WebSocket to Supabase Realtime and subscribes to INSERTs on
public.agent_tasks (task_type = arc_chat_message). The instant the app queues a
message, Supabase pushes it here; we claim it (queued->running, compare-and-set),
run Arc's turn, and POST the reply back to the app. No tunnel, no public URL —
the socket is outbound, so it traverses home NAT and reconnects on its own.

    app inserts agent_tasks (queued)            [already built]
      -> Supabase Realtime push  -->  this subscriber
      -> claim_task() (CAS)       -->  generate_reply()  -->  deliver()

Keep poller.py running underneath as the safety net for anything missed while
this process is down. Replies are idempotent per agentTaskId (a late duplicate
404s), and the CAS claim means the poller and this path never double-answer.

Arc's turn (generate_reply) and reply delivery (deliver) are imported from the
worker module named by ARC_WORKER_MODULE (default "poller"), matching webhook.py.

Env (see .env.example):
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (realtime + CAS claim)
    APP_BASE_URL, ARC_AGENT_API_TOKEN      (used by the worker's deliver())
    ARC_WORKER_MODULE                        (default "poller")

Run:
    set -a; . ./.env; set +a
    python3 realtime_subscriber.py
"""
import asyncio
import importlib
import os
import sys
import threading

from realtime import AsyncRealtimeClient, RealtimeSubscribeStates

from arc_chat_core import claim_task, extract_record, is_chat_task, row_to_message

WORKER_MODULE = os.environ.get("ARC_WORKER_MODULE", "poller")
_worker = importlib.import_module(WORKER_MODULE)
generate_reply = _worker.generate_reply
deliver = _worker.deliver


def _process(record):
    """Claim → answer → deliver, off the event loop thread."""
    msg = row_to_message(record)
    task_id = msg.get("agentTaskId")
    if not task_id:
        return
    try:
        if not claim_task(task_id):
            return  # poller or another path already took it
    except Exception as err:  # noqa: BLE001 - a claim failure should not crash the loop
        print(f"[arc-realtime] claim failed {task_id}: {err}", file=sys.stderr)
        return
    try:
        reply = generate_reply(msg)
        deliver(task_id, reply, "complete")
        print(f"[arc-realtime] replied to {task_id}")
    except Exception as err:  # noqa: BLE001 - any failure becomes a failed reply
        try:
            deliver(task_id, f"Arc couldn't complete this reply: {err}", "failed")
        except Exception as deliver_err:  # noqa: BLE001
            print(f"[arc-realtime] deliver-failed {task_id}: {deliver_err}", file=sys.stderr)
        print(f"[arc-realtime] failed {task_id}: {err}", file=sys.stderr)


def _on_insert(payload):
    record = extract_record(payload)
    if not is_chat_task(record):
        return
    threading.Thread(target=_process, args=(record,), daemon=True).start()


async def main():
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set", file=sys.stderr)
        sys.exit(1)
    if not os.environ.get("APP_BASE_URL") or not os.environ.get("ARC_AGENT_API_TOKEN"):
        print("APP_BASE_URL and ARC_AGENT_API_TOKEN must be set (used by deliver())", file=sys.stderr)
        sys.exit(1)

    ws_url = supabase_url.replace("https://", "wss://").replace("http://", "ws://") + "/realtime/v1"
    socket = AsyncRealtimeClient(ws_url, service_key, auto_reconnect=True)
    await socket.connect()

    channel = socket.channel("arc-chat")
    channel.on_postgres_changes(
        "INSERT",
        schema="public",
        table="agent_tasks",
        filter="task_type=eq.arc_chat_message",
        callback=_on_insert,
    )
    await channel.subscribe(
        lambda state, err: print(
            f"[arc-realtime] subscription: {state}"
            + (f" err={err}" if err else "")
            + (" — listening for chat tasks" if state == RealtimeSubscribeStates.SUBSCRIBED else "")
        )
    )

    # connect() already started the receive loop and heartbeat as background tasks
    # (see AsyncRealtimeClient._on_connect), so do NOT call listen()/_listen() here —
    # the public listen() is a deprecated no-op in realtime-py 2.x, and calling
    # _listen() again would open a second consumer of the same socket. Block on the
    # existing listen task so a fatal socket error exits the process (launchd then
    # restarts us); auto_reconnect=True handles transient drops inside the loop.
    listen_task = getattr(socket, "_listen_task", None)
    if listen_task is not None:
        await listen_task
    else:
        await asyncio.Event().wait()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

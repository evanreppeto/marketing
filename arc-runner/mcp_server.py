#!/usr/bin/env python3
"""
MCP server exposing the BSR "Arc Operations API" as tools for the Arc/Arc
agent, so Arc calls native tools instead of hand-crafting HTTP requests.

Every tool is a thin wrapper over a bearer-gated endpoint on the deployed app
(GET/POST {BASE_URL}/api/v1/arc/*). The app enforces all auth and safety, so
this layer adds none of its own — and, by construction, exposes NO tool that
approves, rejects, launches, sends, publishes, or dispatches. Arc can read,
advise, log, drive task lifecycle, and submit review-ready drafts; outbound
stays locked behind the human approval gate.

Transport: stdio (the standard MCP wiring for a local agent runner).

Config via env (see .env.example):
    BSR_MARKETING_BASE_URL  (falls back to APP_BASE_URL) — e.g. https://bsr-marketing.vercel.app
    ARC_AGENT_API_TOKEN  — same shared secret as the app.

Run:  python mcp_server.py    (requires `pip install -r requirements.txt`)
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from mcp.server.fastmcp import FastMCP

BASE_URL = (os.environ.get("BSR_MARKETING_BASE_URL") or os.environ.get("APP_BASE_URL", "")).rstrip("/")
TOKEN = os.environ.get("ARC_AGENT_API_TOKEN", "")

mcp = FastMCP("bsr-marketing-arc")


def _request(method: str, path: str, payload: dict | None = None, params: dict | None = None) -> dict:
    """Call the Arc Operations API and return the parsed JSON body.

    Non-2xx responses still return their JSON ({ ok: false, status, message })
    so the caller sees a structured error rather than an exception. The bearer
    token is sent in the Authorization header and never logged or echoed.
    """
    if not BASE_URL:
        return {"ok": False, "status": "not_configured", "message": "Set BSR_MARKETING_BASE_URL or APP_BASE_URL."}
    query = ""
    if params:
        clean = {k: v for k, v in params.items() if v is not None}
        if clean:
            query = "?" + urllib.parse.urlencode(clean)
    url = f"{BASE_URL}{path}{query}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("authorization", f"Bearer {TOKEN}")
    if data is not None:
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            return json.loads(exc.read().decode("utf-8"))
        except Exception:
            return {"ok": False, "status": "error", "message": f"HTTP {exc.code}"}
    except urllib.error.URLError as exc:
        # Never include the token; reason is a connection-level message.
        return {"ok": False, "status": "error", "message": f"request failed: {exc.reason}"}


# --- Health -----------------------------------------------------------------
@mcp.tool()
def health() -> dict:
    """Check the Arc Operations API is reachable and authorized."""
    return _request("GET", "/api/v1/arc/health")


# --- Tasks ------------------------------------------------------------------
@mcp.tool()
def list_tasks(status: str | None = None, assignee: str | None = None, limit: int | None = None) -> dict:
    """List agent tasks. status accepts pending/in_progress/blocked/needs_approval/completed/failed/canceled."""
    return _request("GET", "/api/v1/arc/tasks", params={"status": status, "assignee": assignee, "limit": limit})


@mcp.tool()
def get_task(task_id: str) -> dict:
    """Get full detail for one task (context, logs, next_allowed_actions)."""
    return _request("GET", f"/api/v1/arc/tasks/{task_id}")


@mcp.tool()
def claim_task(task_id: str) -> dict:
    """Claim a queued task (queued -> running)."""
    return _request("POST", f"/api/v1/arc/tasks/{task_id}/claim")


@mcp.tool()
def log_task(
    task_id: str,
    message: str | None = None,
    reasoning_summary: str | None = None,
    run_status: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Append a run-log entry to a task (does not change task status)."""
    return _request(
        "POST",
        f"/api/v1/arc/tasks/{task_id}/log",
        payload={
            "message": message,
            "reasoning_summary": reasoning_summary,
            "run_status": run_status,
            "metadata": metadata,
        },
    )


@mcp.tool()
def complete_task(task_id: str, summary: str | None = None, outputs: dict | None = None, metadata: dict | None = None) -> dict:
    """Arc a task completed."""
    return _request(
        "POST",
        f"/api/v1/arc/tasks/{task_id}/complete",
        payload={"summary": summary, "outputs": outputs, "metadata": metadata},
    )


@mcp.tool()
def block_task(task_id: str, reason: str, needs: dict | None = None, metadata: dict | None = None) -> dict:
    """Arc a task blocked with a reason (use when you need a human)."""
    return _request(
        "POST",
        f"/api/v1/arc/tasks/{task_id}/block",
        payload={"reason": reason, "needs": needs, "metadata": metadata},
    )


# --- Approvals (read + advise only) -----------------------------------------
@mcp.tool()
def list_approvals(status: str | None = None, limit: int | None = None) -> dict:
    """List human approval / campaign-review items (status may be comma-separated)."""
    return _request("GET", "/api/v1/arc/approvals", params={"status": status, "limit": limit})


@mcp.tool()
def get_approval(approval_id: str) -> dict:
    """Get one approval item, including Arc's prior recommendations."""
    return _request("GET", f"/api/v1/arc/approvals/{approval_id}")


@mcp.tool()
def list_approval_recommendations(approval_id: str) -> dict:
    """Read back the recommendations left on an approval item."""
    return _request("GET", f"/api/v1/arc/approvals/{approval_id}/recommendations")


@mcp.tool()
def add_approval_recommendation(
    approval_id: str,
    recommendation: str,
    rationale: str | None = None,
    risk_flags: list | None = None,
    suggested_edits: str | None = None,
) -> dict:
    """Add an advisory recommendation to an approval item. Advisory ONLY — this
    never approves, rejects, launches, sends, or publishes."""
    return _request(
        "POST",
        f"/api/v1/arc/approvals/{approval_id}/recommendation",
        payload={
            "recommendation": recommendation,
            "rationale": rationale,
            "risk_flags": risk_flags,
            "suggested_edits": suggested_edits,
        },
    )


# --- Campaigns (read only) --------------------------------------------------
@mcp.tool()
def list_campaigns(status: str | None = None, needs_review: bool | None = None, limit: int | None = None) -> dict:
    """List campaign packages."""
    params = {"status": status, "limit": limit}
    if needs_review:
        params["needs_review"] = "true"
    return _request("GET", "/api/v1/arc/campaigns", params=params)


@mcp.tool()
def get_campaign(campaign_id: str) -> dict:
    """Get full campaign workspace detail."""
    return _request("GET", f"/api/v1/arc/campaigns/{campaign_id}")


# --- Drafts (creates a LOCKED, pending-approval item) -----------------------
@mcp.tool()
def create_draft(
    item_type: str,
    draft: str,
    title: str | None = None,
    summary: str | None = None,
    risk_level: str | None = None,
    prompt_inputs: dict | None = None,
    campaign_id: str | None = None,
    company_id: str | None = None,
    contact_id: str | None = None,
    lead_id: str | None = None,
    task_id: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Submit a review-ready draft into the human approval queue. The created
    item is always pending_approval + locked — you draft, the human decides."""
    return _request(
        "POST",
        "/api/v1/arc/drafts",
        payload={
            "item_type": item_type,
            "draft": draft,
            "title": title,
            "summary": summary,
            "risk_level": risk_level,
            "prompt_inputs": prompt_inputs,
            "campaign_id": campaign_id,
            "company_id": company_id,
            "contact_id": contact_id,
            "lead_id": lead_id,
            "task_id": task_id,
            "metadata": metadata,
        },
    )


# --- CRM (read only) --------------------------------------------------------
@mcp.tool()
def search_crm(
    entity: str,
    q: str | None = None,
    status: str | None = None,
    persona: str | None = None,
    city: str | None = None,
    postal_code: str | None = None,
    min_score: int | None = None,
    max_score: int | None = None,
    company_id: str | None = None,
    limit: int | None = None,
) -> dict:
    """Read-only CRM search. entity ∈ leads | companies | contacts | properties | jobs | outcomes.
    Use city/postal_code on properties for geo (ZIP) discovery, and min_score/max_score on leads."""
    allowed = {"leads", "companies", "contacts", "properties", "jobs", "outcomes"}
    if entity not in allowed:
        return {"ok": False, "status": "rejected", "message": f"entity must be one of {sorted(allowed)}"}
    return _request(
        "GET",
        f"/api/v1/arc/crm/{entity}",
        params={
            "q": q,
            "status": status,
            "persona": persona,
            "city": city,
            "postal_code": postal_code,
            "min_score": min_score,
            "max_score": max_score,
            "company_id": company_id,
            "limit": limit,
        },
    )


if __name__ == "__main__":
    mcp.run()

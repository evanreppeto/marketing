# Social Image Ads into the Growth-Engine App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mark's standalone social image ads appear as their own campaigns in the growth-engine app's Campaigns + Approvals screens, image and all, locked pending human approval.

**Architecture:** The **classifier** (Python, Cloud Run) gains a permanent public image URL for a stored ad. The **app** (Next.js, Supabase project `fpjvgqrfqncnudqeudee`) gains a CRM-less `POST /api/v1/hermes/social-ads` endpoint that creates one campaign + one `social_ad` asset (image in `audit_payload.media_assets`) + one locked approval item. Mark calls the classifier to store the image, then the app to register the campaign.

**Tech Stack:** Python/FastAPI + pytest (classifier); Next.js 16 + TypeScript + zod + vitest (app); Supabase.

**Note on commits:** The app (`C:\Users\evanr\marketing`) is a git repo — commit per task as shown. The classifier (`C:\Users\evanr\marketing-classifier-agent`) is NOT a git repo — there is no commit step; deploying to Cloud Run (Task 8) is how classifier changes ship. Confirm with Evan before the first commit/deploy.

**No database migration is required** — all columns/enums already exist (verified 2026-06-08).

---

## File Structure

**Classifier repo (`C:\Users\evanr\marketing-classifier-agent`):**
- Modify `marketing_classifier/campaigns.py` — add `get_campaign_image()` + `image_url_for()`; add `image_url` to submit/publish return dicts.
- Modify `marketing_classifier/config.py` — add `CLASSIFIER_PUBLIC_URL`.
- Modify `marketing_classifier/api.py` — add public `GET /campaigns/{asset_id}/image`.
- Modify `tests/test_campaigns.py` — tests for the two new functions.

**App repo (`C:\Users\evanr\marketing`):**
- Create `src/lib/hermes/social-ad-contract.ts` — zod request schema + parser.
- Create `src/lib/hermes/social-ad-contract.test.ts` — contract tests.
- Create `src/lib/hermes/social-ad-orchestrator.ts` — `runHermesSocialAd()`.
- Create `src/lib/hermes/social-ad-orchestrator.test.ts` — orchestrator tests.
- Create `src/app/api/v1/hermes/social-ads/route.ts` — thin HTTP wrapper (no test, matches the existing `/runs` route convention).

**Mark skill (deliverable file):**
- Create `C:\Users\evanr\marketing-classifier-agent\mark-skills\submit-social-ad-to-app\SKILL.md`.

---

## Part A — Classifier: permanent public image URL

### Task 1: `get_campaign_image()` in campaigns.py

**Files:**
- Modify: `marketing_classifier/campaigns.py`
- Test: `tests/test_campaigns.py`

- [ ] **Step 1: Write the failing tests** (append to `tests/test_campaigns.py`)

```python
def test_get_campaign_image_returns_bytes_and_mime(fake_supabase):
    fake_supabase.seed("campaign_assets", {
        "id": "img-1", "gcp_bucket": "bsr-marketing-media",
        "gcp_object_path": "campaign-assets/x/feed.png",
    })

    def fake_fetch(bucket, path):
        assert bucket == "bsr-marketing-media"
        assert path == "campaign-assets/x/feed.png"
        return b"PNGBYTES", "image/png"

    data, mime = campaigns.get_campaign_image("img-1", client=fake_supabase, fetch=fake_fetch)
    assert data == b"PNGBYTES"
    assert mime == "image/png"


def test_get_campaign_image_missing_row_raises(fake_supabase):
    with pytest.raises(LookupError):
        campaigns.get_campaign_image("nope", client=fake_supabase, fetch=lambda b, p: (b"", "image/png"))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_campaigns.py -k get_campaign_image -v`
Expected: FAIL — `AttributeError: module 'marketing_classifier.campaigns' has no attribute 'get_campaign_image'`

- [ ] **Step 3: Implement** (add to `marketing_classifier/campaigns.py`, near the other functions)

```python
def get_campaign_image(asset_id, *, client=None, fetch=None):
    """Return (bytes, content_type) for a stored campaign image. LookupError if missing."""
    client = client or supabase_io.get_supabase_client()
    fetch = fetch or storage.fetch_image_bytes
    row = supabase_io.fetch_campaign_asset(client, asset_id)
    if not row:
        raise LookupError(f"No {config.CAMPAIGN_ASSETS_TABLE} row with id={asset_id!r}")
    return fetch(row["gcp_bucket"], row["gcp_object_path"])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_campaigns.py -k get_campaign_image -v`
Expected: PASS (2 passed)

### Task 2: `CLASSIFIER_PUBLIC_URL` config + `image_url_for()` helper

**Files:**
- Modify: `marketing_classifier/config.py`
- Modify: `marketing_classifier/campaigns.py`
- Test: `tests/test_campaigns.py`

- [ ] **Step 1: Add config** (in `marketing_classifier/config.py`, after `CAMPAIGN_URL_TTL_SECONDS`)

```python
# Absolute base URL of this service, used to build public image links the app embeds.
CLASSIFIER_PUBLIC_URL = _env("CLASSIFIER_PUBLIC_URL", "CLASSIFIER_URL")
```

- [ ] **Step 2: Write the failing test** (append to `tests/test_campaigns.py`)

```python
def test_image_url_for_uses_public_base(monkeypatch):
    monkeypatch.setattr(campaigns.config, "CLASSIFIER_PUBLIC_URL", "https://svc.example/")
    assert campaigns.image_url_for("abc") == "https://svc.example/campaigns/abc/image"


def test_image_url_for_falls_back_to_path(monkeypatch):
    monkeypatch.setattr(campaigns.config, "CLASSIFIER_PUBLIC_URL", None)
    assert campaigns.image_url_for("abc") == "/campaigns/abc/image"
```

- [ ] **Step 3: Run to verify fail**

Run: `python -m pytest tests/test_campaigns.py -k image_url_for -v`
Expected: FAIL — no attribute `image_url_for`

- [ ] **Step 4: Implement** (add to `marketing_classifier/campaigns.py`)

```python
def image_url_for(asset_id) -> str:
    """Absolute public URL of a campaign image (or a relative path if base unset)."""
    base = (config.CLASSIFIER_PUBLIC_URL or "").rstrip("/")
    path = f"/campaigns/{asset_id}/image"
    return f"{base}{path}" if base else path
```

- [ ] **Step 5: Wire `image_url` into the submit + publish responses.**

In `submit_campaign_asset`, change the returned dict to add (before the closing brace of the `return {`):

```python
        "image_url": image_url_for(saved.get("id")),
```

In `publish_campaign_asset`, add to its returned dict:

```python
        "image_url": image_url_for(asset_id),
```

- [ ] **Step 6: Run the full campaigns test file**

Run: `python -m pytest tests/test_campaigns.py -v`
Expected: PASS (all, including the existing submit/publish tests — they ignore the extra key)

### Task 3: Public `GET /campaigns/{asset_id}/image` endpoint

**Files:**
- Modify: `marketing_classifier/api.py`

- [ ] **Step 1: Add the import** (top of `marketing_classifier/api.py`, with the fastapi import line)

Change `from fastapi import Depends, FastAPI, Header, HTTPException, status` to also import `Response`:

```python
from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
```

- [ ] **Step 2: Add the endpoint** (after the `publish_campaign` endpoint)

```python
@app.get("/campaigns/{asset_id}/image")
def campaign_image(asset_id: str) -> Response:
    # Public (no token): marketing creative is meant to be viewable by URL so the app can embed it.
    try:
        data, mime = campaigns.get_campaign_image(asset_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return Response(content=data, media_type=mime)
```

- [ ] **Step 3: Verify app imports + route registers**

Run: `python -c "from marketing_classifier.api import app; print([r.path for r in app.routes if 'image' in r.path])"`
Expected: `['/campaigns/{asset_id}/image']`

- [ ] **Step 4: Run the full suite + lint**

Run: `python -m pytest -q` then `python -m ruff check .`
Expected: all pass, ruff clean. (Deploy happens in Task 8 — no git commit; classifier is not versioned.)

---

## Part B — App: CRM-less social-ad ingest

### Task 4: Social-ad request contract (zod)

**Files:**
- Create: `src/lib/hermes/social-ad-contract.ts`
- Test: `src/lib/hermes/social-ad-contract.test.ts`

- [ ] **Step 1: Write the failing test** (`src/lib/hermes/social-ad-contract.test.ts`)

```typescript
import { describe, expect, it } from "vitest";

import { parseHermesSocialAdRequest } from "./social-ad-contract";

describe("parseHermesSocialAdRequest", () => {
  it("accepts a valid social-ad request", () => {
    const req = parseHermesSocialAdRequest({
      workflow: "social_ad",
      name: "Storm Damage Safety",
      persona: "persona_homeowner_emergency",
      restorationFocus: "storm_surge",
      imageUrl: "https://svc.example/campaigns/abc/image",
      headline: "Tree on the roof?",
      operator: "Mark",
    });
    expect(req.name).toBe("Storm Damage Safety");
    expect(req.imageUrl).toBe("https://svc.example/campaigns/abc/image");
  });

  it("rejects a missing imageUrl", () => {
    expect(() =>
      parseHermesSocialAdRequest({ name: "x", persona: "persona_homeowner_emergency", restorationFocus: "storm_surge" }),
    ).toThrow();
  });

  it("rejects an invalid persona", () => {
    expect(() =>
      parseHermesSocialAdRequest({
        name: "x", persona: "unassigned_persona", restorationFocus: "storm_surge",
        imageUrl: "https://svc.example/i.png",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/lib/hermes/social-ad-contract.test.ts`
Expected: FAIL — cannot find module `./social-ad-contract`

- [ ] **Step 3: Implement** (`src/lib/hermes/social-ad-contract.ts`)

```typescript
import { z } from "zod";

import { OFFICIAL_PERSONA_MAPPINGS } from "@/domain";

const optionalText = z.string().trim().min(1).optional();

export const hermesSocialAdRequestSchema = z.object({
  workflow: z.literal("social_ad").default("social_ad"),
  name: z.string().trim().min(1),
  persona: z.enum(OFFICIAL_PERSONA_MAPPINGS),
  restorationFocus: z.enum([
    "flood", "water_backup", "burst_pipe", "storm_surge", "standing_water", "mold", "sewage", "fire",
  ]),
  objective: z.string().trim().min(1).default("Social image ad submitted for human approval."),
  imageUrl: z.string().trim().url(),
  format: optionalText,
  headline: optionalText,
  body: optionalText,
  ctaLabel: optionalText,
  ctaPhone: optionalText,
  sourceCampaignId: optionalText,
  operator: z.string().trim().min(1).default("Mark"),
});

export type HermesSocialAdRequest = z.output<typeof hermesSocialAdRequestSchema>;

export function parseHermesSocialAdRequest(input: unknown): HermesSocialAdRequest {
  return hermesSocialAdRequestSchema.parse(input ?? {});
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/lib/hermes/social-ad-contract.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add src/lib/hermes/social-ad-contract.ts src/lib/hermes/social-ad-contract.test.ts
git commit -m "feat(hermes): add social-ad request contract"
```

### Task 5: Social-ad orchestrator

**Files:**
- Create: `src/lib/hermes/social-ad-orchestrator.ts`
- Test: `src/lib/hermes/social-ad-orchestrator.test.ts`

- [ ] **Step 1: Write the failing test** (`src/lib/hermes/social-ad-orchestrator.test.ts`)

```typescript
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { runHermesSocialAd } from "./social-ad-orchestrator";

type InsertArg = {
  company_id?: unknown;
  asset_type?: string;
  status?: string;
  dispatch_locked?: boolean;
  launch_locked?: boolean;
  locked_until_approved?: boolean;
  audit_payload?: { media_assets?: Array<{ url: string }> };
};

const validRequest = {
  workflow: "social_ad",
  name: "Storm Damage Safety",
  persona: "persona_homeowner_emergency",
  restorationFocus: "storm_surge",
  imageUrl: "https://svc.example/campaigns/abc/image",
  headline: "Tree on the roof?",
  operator: "Mark",
};

describe("runHermesSocialAd", () => {
  it("creates a CRM-less campaign + social_ad asset + locked approval item", async () => {
    const supabase = createSupabaseQueryMock({});

    const result = await runHermesSocialAd(validRequest, supabase);
    expect(result.status).toBe("needs_approval");
    expect(result.campaignId).toBeTruthy();

    const insertsByTable = (table: string) =>
      supabase.calls.filter(([method, , t]) => method === "insert" && t === table).map(([, arg]) => arg as InsertArg);

    // No CRM pollution.
    expect(insertsByTable("companies")).toHaveLength(0);
    expect(insertsByTable("contacts")).toHaveLength(0);
    expect(insertsByTable("leads")).toHaveLength(0);

    const campaigns = insertsByTable("campaigns");
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].company_id).toBeNull();
    expect(campaigns[0].launch_locked).toBe(true);

    const assets = insertsByTable("campaign_assets");
    expect(assets).toHaveLength(1);
    expect(assets[0].asset_type).toBe("social_ad");
    expect(assets[0].dispatch_locked).toBe(true);
    expect(assets[0].audit_payload?.media_assets?.[0]?.url).toBe(validRequest.imageUrl);

    const approvals = insertsByTable("approval_items");
    expect(approvals).toHaveLength(1);
    expect(approvals[0].locked_until_approved).toBe(true);
    expect(approvals[0].status).toBe("pending_owner_approval");
  });
});
```

NOTE: the existing `createSupabaseQueryMock` records calls as `[method, arg, table]` (the 3rd element is the table name passed to `.from()`). If the mock's tuple shape differs, adjust the destructuring in `insertsByTable` to match `src/lib/repos/__tests__/test-helpers.ts` — read that file first.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/lib/hermes/social-ad-orchestrator.test.ts`
Expected: FAIL — cannot find module `./social-ad-orchestrator`

- [ ] **Step 3: Implement** (`src/lib/hermes/social-ad-orchestrator.ts`)

```typescript
import { type SupabaseClient } from "@supabase/supabase-js";

import { parseHermesSocialAdRequest } from "./social-ad-contract";
import { getSupabaseAdminClient } from "../supabase/server";

const sourceSystem = "hermes_agent_orchestrator";

export type HermesSocialAdResult = {
  runId: string;
  campaignId: string;
  campaignAssetId: string;
  approvalItemId: string;
  status: "needs_approval";
};

export async function runHermesSocialAd(
  input: unknown = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<HermesSocialAdResult> {
  const req = parseHermesSocialAdRequest(input);
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

  const campaignId = await insertOne(client, "campaigns", {
    name: `${req.name} ${runId}`,
    persona: req.persona,
    restoration_focus: req.restorationFocus,
    status: "pending_approval",
    company_id: null,
    contact_id: null,
    lead_id: null,
    owner: req.operator,
    objective: req.objective,
    source_system: sourceSystem,
    external_campaign_id: `hermes-agent-socialad-${runId}`,
    launch_locked: true,
    campaign_phase: "social_ad",
    source_signal: { run_id: runId, image_url: req.imageUrl, source_campaign_id: req.sourceCampaignId ?? null },
    reasoning_payload: {},
    audit_payload: { provider: "social_ad_ingest", outbound_locked: true },
  });

  const campaignAssetId = await insertOne(client, "campaign_assets", {
    campaign_id: campaignId,
    asset_type: "social_ad",
    channel: "social",
    title: req.name,
    status: "pending_owner_approval",
    source_system: sourceSystem,
    external_asset_id: `hermes-agent-socialad-${runId}`,
    tool_source: "Hermes Social Ad Ingest",
    prompt_inputs: {
      format: req.format ?? null,
      headline: req.headline ?? null,
      body: req.body ?? null,
      cta_label: req.ctaLabel ?? null,
      cta_phone: req.ctaPhone ?? null,
    },
    draft_body: req.body ?? null,
    dispatch_locked: true,
    reasoning_payload: {},
    audit_payload: {
      run_id: runId,
      media_assets: [{
        url: req.imageUrl,
        type: "ad",
        title: req.name,
        description: req.headline ?? null,
        thumbnail_url: req.imageUrl,
      }],
    },
  });

  const approvalItemId = await insertOne(client, "approval_items", {
    campaign_id: campaignId,
    campaign_asset_id: campaignAssetId,
    item_type: "social_ad_campaign_asset",
    status: "pending_owner_approval",
    approval_required: true,
    locked_until_approved: true,
    prompt_inputs: {},
    draft_output: req.body ?? req.name,
    requested_by: "Hermes Social Ad Ingest",
    risk_level: "medium",
    reasoning_payload: {},
    audit_payload: { run_id: runId, outbound_locked: true },
  });

  await updateById(client, "campaigns", campaignId, { approval_item_id: approvalItemId });

  await insertOne(client, "campaign_events", {
    campaign_id: campaignId,
    campaign_asset_id: campaignAssetId,
    approval_item_id: approvalItemId,
    event_type: "approval_submitted",
    actor: "Hermes Social Ad Ingest",
    detail: "Hermes submitted a social ad for human approval.",
    payload: { run_id: runId, outbound_locked: true },
  });

  return { runId, campaignId, campaignAssetId, approvalItemId, status: "needs_approval" };
}

async function insertOne(client: SupabaseClient, table: string, values: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(values).select("id").single<{ id: string }>();
  if (error) {
    throw new Error(`${table} insert failed: ${error.message}`);
  }
  return data.id;
}

async function updateById(client: SupabaseClient, table: string, id: string, values: Record<string, unknown>) {
  const { error } = await client.from(table).update(values).eq("id", id);
  if (error) {
    throw new Error(`${table} update failed: ${error.message}`);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/lib/hermes/social-ad-orchestrator.test.ts`
Expected: PASS (1 passed). If the mock tuple shape differs, fix the test's destructuring per the note in Step 1, not the implementation.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hermes/social-ad-orchestrator.ts src/lib/hermes/social-ad-orchestrator.test.ts
git commit -m "feat(hermes): add CRM-less social-ad orchestrator"
```

### Task 6: HTTP route `POST /api/v1/hermes/social-ads`

**Files:**
- Create: `src/app/api/v1/hermes/social-ads/route.ts`

- [ ] **Step 1: Implement** (`src/app/api/v1/hermes/social-ads/route.ts`) — mirrors the existing `runs/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";

import { checkBearerToken } from "@/lib/auth/api-token";
import { runHermesSocialAd } from "@/lib/hermes/social-ad-orchestrator";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const auth = checkBearerToken(request, "HERMES_AGENT_API_TOKEN");
  if (!auth.ok) {
    return NextResponse.json(
      auth.reason === "not_configured"
        ? { ok: false, status: "not_configured", message: "Set HERMES_AGENT_API_TOKEN before enabling Hermes API runs." }
        : { ok: false, status: "unauthorized", message: "Hermes API runs require a valid bearer token." },
      { status: auth.status },
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, status: "not_configured", message: "Supabase admin env vars are required before Hermes can persist work." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "rejected", message: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const result = await runHermesSocialAd(payload);
    return NextResponse.json({ ok: true, status: result.status, result, outboundDispatchAllowed: false }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, status: "rejected", errors: error.issues.map((i) => ({ code: i.code, message: i.message, path: i.path.map(String) })) },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, status: "failed", message: error instanceof Error ? error.message : "Hermes social-ad run failed." },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 2: Verify it builds / typechecks**

Run: `pnpm lint` then `pnpm vitest run src/lib/hermes`
Expected: lint clean; all hermes tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/hermes/social-ads/route.ts
git commit -m "feat(api): add POST /api/v1/hermes/social-ads endpoint"
```

---

## Part C — Mark skill

### Task 7: "Submit social ad to the app" skill

**Files:**
- Create: `C:\Users\evanr\marketing-classifier-agent\mark-skills\submit-social-ad-to-app\SKILL.md`

- [ ] **Step 1: Write the skill file**

```markdown
---
name: submit-social-ad-to-app
description: Use after Mark renders a finished, on-brand SOCIAL IMAGE AD and passes the pre-ship checklist - stores the image in the classifier, then registers it as its own campaign in the growth-engine app so a human can approve it. Mark never publishes.
---

# Submit a Social Image Ad to the App

Two steps. Step 1 stores the image and gives a permanent link. Step 2 registers the
ad as its own campaign in the app, where a human approves it. Mark never launches/sends.

## Prerequisites (in Mark's `.env`)
- `CLASSIFIER_URL` + `CLASSIFIER_API_TOKEN` (48-char classifier token)
- `APP_URL` (the growth-engine app base, e.g. https://<app-host>) + `HERMES_AGENT_API_TOKEN`

## Step 1 — store the image in the classifier
`POST {CLASSIFIER_URL}/campaigns` (bearer `CLASSIFIER_API_TOKEN`) with `campaign_name`,
`format`, `image_base64`. The response includes `id` and `image_url` (a permanent public
link to the PNG). Keep the `image_url`.

## Step 2 — register the campaign in the app
`POST {APP_URL}/api/v1/hermes/social-ads` (bearer `HERMES_AGENT_API_TOKEN`):
```
{
  "workflow": "social_ad",
  "name": "Storm Damage Safety 2026-06-08",
  "persona": "persona_homeowner_emergency",
  "restorationFocus": "storm_surge",
  "imageUrl": "<the image_url from Step 1>",
  "format": "feed_1080x1080",
  "headline": "Tree on the roof?",
  "body": "Stay safely inside. Chicago crews are ready 24/7 ...",
  "ctaLabel": "24/7 Emergency",
  "ctaPhone": "(773) 839-7852",
  "operator": "Mark"
}
```
- `persona` MUST be one of the 12 official personas; `restorationFocus` one of
  flood|water_backup|burst_pipe|storm_surge|standing_water|mold|sewage|fire.
- Success: `201 { ok:true, status:"needs_approval", result:{ campaignId, campaignAssetId, approvalItemId } }`.
- The ad now appears in the app's Campaigns gallery + Approvals queue, locked until a
  human approves. `400` = fix payload; `401/503` = auth/config.

## Do NOT
Submit a vertical + square as ONE call only if they are the same creative; otherwise
make one call per image (each becomes its own campaign asset). Never claim it was
posted/launched — a human approves and launches downstream.
```

(No commit — the classifier repo is not under git. This file is a deliverable for Evan to drop into Mark's profile at `/Users/reppeto/.hermes/profiles/mark/`.)

---

## Part D — Deploy + live verification

### Task 8: Deploy and verify end-to-end

- [ ] **Step 1: Set the classifier public-URL env + deploy** (classifier repo)

Run (PowerShell-safe, short lines):
```
gcloud run services update marketing-classifier --region us-central1 --update-env-vars CLASSIFIER_PUBLIC_URL=https://marketing-classifier-1018264991787.us-central1.run.app
```
Then deploy:
```
gcloud run deploy marketing-classifier --source . --region us-central1 --quiet
```
Expected: a new revision serving 100% traffic.

- [ ] **Step 2: Smoke-test the image endpoint** on an existing published ad

Run:
```
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://marketing-classifier-1018264991787.us-central1.run.app/campaigns/a27d0179-f5d3-4d58-a585-b69d495ec662/image
```
Expected: `200 image/png`

- [ ] **Step 3: Run the app locally with admin env + the agent token**

Confirm `.env.local` has the Supabase admin vars + `HERMES_AGENT_API_TOKEN`, then:
```
pnpm dev
```
(Or use the deployed app host if one exists — confirm with Evan which to verify against.)

- [ ] **Step 4: Submit both storm-damage ads through the new path**

For each of the two classifier ads, build its `imageUrl`
(`https://marketing-classifier-1018264991787.us-central1.run.app/campaigns/<id>/image`)
and POST to `{APP_URL}/api/v1/hermes/social-ads` with persona `persona_homeowner_emergency`,
restorationFocus `storm_surge`, name "Storm Damage Safety (square|vertical)", the caption
fields, operator "Mark". Expected: `201 needs_approval` with `campaignId`.

- [ ] **Step 5: Verify in the database + UI**

SQL (Supabase project `fpjvgqrfqncnudqeudee`):
```sql
select c.id, c.name, c.status, ca.asset_type, ca.audit_payload->'media_assets'->0->>'url' as image_url
from campaigns c join campaign_assets ca on ca.campaign_id = c.id
where c.campaign_phase = 'social_ad' order by c.created_at desc limit 5;
```
Expected: rows with `asset_type='social_ad'` and the classifier `image_url`.
Then open the app's `/campaigns` and `/approvals` pages and confirm the ads appear with
the image rendering and an approval action available.

- [ ] **Step 6: Report results to Evan** — links/screens of the campaigns showing in the app, image loading, awaiting approval. Nothing published.

---

## Self-Review (completed during planning)

- **Spec coverage:** classifier image URL (Tasks 1–3) ✓; CRM-less app ingest endpoint (Tasks 4–6) ✓; Mark skill (Task 7) ✓; re-submit the two storm ads as the live test (Task 8) ✓; same locked/human-gated model ✓.
- **NOT NULL / enum safety (the earlier-500 lesson):** verified `campaign_assets` requires campaign_id/asset_type/title (all provided); `approval_items` requires item_type (provided), risk_level is text default 'medium' (set); enums `social_ad`, `pending_owner_approval`, `pending_approval`, `approval_submitted` all confirmed valid.
- **Type consistency:** `parseHermesSocialAdRequest` / `runHermesSocialAd` / `HermesSocialAdRequest` names match across contract, orchestrator, route, and tests.
- **Known assumption to verify at execution:** the exact tuple shape returned by `createSupabaseQueryMock(...).calls` (read `src/lib/repos/__tests__/test-helpers.ts` before Task 5 and adjust the test's destructuring if needed — implementation stays as written).

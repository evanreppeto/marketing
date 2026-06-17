# Opportunity Inbox — Plan 1: Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Detect cold CRM leads as source-backed opportunities and surface them in an `/opportunities` inbox with evidence, confidence, urgency, and Dismiss/Snooze — proving the discovery surface end-to-end. (Arc-authored drafting is Plan 2.)

**Architecture:** Pure detection in `src/domain/opportunity-detection.ts`; I/O in `src/lib/opportunities/` (detector + persistence + read-model), org-scoped via `getCurrentOrgId()`, guarded by `isSupabaseAdminConfigured()` — mirrors the wired CRM-interactions feature. A new `opportunities` table stores results. The `/opportunities` page wires the existing `OpportunityCommandCenter` component.

**Tech Stack:** Next.js 16 server components + server actions, Supabase (service-role admin client), Vitest, Zod (already used in domain).

Spec: `docs/superpowers/specs/2026-06-17-opportunity-inbox-design.md`. Plan 2 (Arc-authored drafting via the runner) is separate.

---

## File Structure
- Create `supabase/migrations/20260617150000_opportunities.sql` — table + enums + indexes + grants.
- Create `src/domain/opportunity-detection.ts` (+ `src/domain/__tests__/opportunity-detection.test.ts`) — pure detection.
- Export the new domain module from `src/domain/index.ts`.
- Create `src/lib/opportunities/persistence.ts` (+ `__tests__/persistence.test.ts`) — upsert(dedup)/dismiss/snooze/markDrafting/markDrafted.
- Create `src/lib/opportunities/detector.ts` — runs detection over CRM data + persists.
- Create `src/lib/opportunities/read-model.ts` — list + count + bucket mapping for the UI.
- Create `src/app/opportunities/page.tsx` + `src/app/opportunities/actions.ts`.
- Modify `src/app/_components/console-frame.tsx` (nav entry), `src/app/_components/nav-icons.tsx` (icon), `src/app/_data/growth-engine.ts` (quick-jump entry).

---

## Task 1: Opportunities table migration

**Files:** Create `supabase/migrations/20260617150000_opportunities.sql`

- [ ] **Step 1: Write the migration** (mirrors the interactions migration: org-scoped, `set_updated_at` trigger, RLS + service_role grants; reuses `public.crm_entity_type`):

```sql
-- Opportunity Inbox: source-backed opportunities Arc detects for human review.
-- Org-scoped; nothing here goes outbound. status drives the inbox lifecycle.
create type public.opportunity_kind as enum ('crm_inactivity');
create type public.opportunity_urgency as enum ('low', 'medium', 'high');
create type public.opportunity_status as enum ('pending', 'drafting', 'drafted', 'dismissed', 'snoozed');

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.opportunity_kind not null,
  subject_type public.crm_entity_type not null,
  subject_id uuid not null,
  title text not null check (length(btrim(title)) > 0),
  summary text not null default '',
  confidence integer not null default 0 check (confidence between 0 and 100),
  urgency public.opportunity_urgency not null default 'medium',
  evidence jsonb not null default '{}'::jsonb,
  recommended_action text not null default '',
  recommended_campaign_type text,
  status public.opportunity_status not null default 'pending',
  campaign_id uuid references public.campaigns(id) on delete set null,
  agent_task_id uuid,
  detected_by text not null default 'arc',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dismissed_at timestamptz,
  snoozed_until timestamptz
);

-- One OPEN opportunity per (org, kind, subject) — dedup safety net for re-scans.
create unique index opportunities_open_unique
  on public.opportunities (org_id, kind, subject_type, subject_id)
  where status in ('pending', 'drafting', 'drafted');

create index opportunities_inbox_idx
  on public.opportunities (org_id, status, urgency, created_at desc);

create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

alter table public.opportunities enable row level security;
grant select, insert, update, delete on public.opportunities to service_role;
```

- [ ] **Step 2: Commit** — `git add supabase/migrations/20260617150000_opportunities.sql && git commit -m "feat(db): opportunities table (Opportunity Inbox spine)"`

> Note: prod DB migrations are applied manually (see memory: vercel-deploy). This migration must be run against the prod Supabase project before the feature works there.

---

## Task 2: Pure cold-lead detection

**Files:** Create `src/domain/opportunity-detection.ts`, `src/domain/__tests__/opportunity-detection.test.ts`; modify `src/domain/index.ts`.

- [ ] **Step 1: Write the failing test** `src/domain/__tests__/opportunity-detection.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { detectColdLeadOpportunities, type ColdLeadInput } from "../opportunity-detection";

const NOW = "2026-06-17T00:00:00.000Z";
function lead(over: Partial<ColdLeadInput> = {}): ColdLeadInput {
  return {
    id: "lead-1",
    label: "Dana Kasprak",
    persona: "persona_homeowner_emergency",
    leadScore: 70,
    status: "qualified",
    lastActivityAt: "2026-05-01T00:00:00.000Z", // 47 days before NOW
    hasActiveCampaign: false,
    ...over,
  };
}

describe("detectColdLeadOpportunities", () => {
  it("flags a cold, open lead with no active campaign", () => {
    const out = detectColdLeadOpportunities([lead()], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "crm_inactivity", subjectType: "lead", subjectId: "lead-1" });
    expect(out[0].evidence.daysCold).toBe(47);
    expect(out[0].confidence).toBeGreaterThan(0);
  });

  it("skips leads that are recent, converted/lost/archived, or already have a campaign", () => {
    expect(detectColdLeadOpportunities([lead({ lastActivityAt: NOW })], { now: NOW })).toEqual([]);
    expect(detectColdLeadOpportunities([lead({ status: "converted" })], { now: NOW })).toEqual([]);
    expect(detectColdLeadOpportunities([lead({ status: "lost" })], { now: NOW })).toEqual([]);
    expect(detectColdLeadOpportunities([lead({ status: "archived" })], { now: NOW })).toEqual([]);
    expect(detectColdLeadOpportunities([lead({ hasActiveCampaign: true })], { now: NOW })).toEqual([]);
  });

  it("respects a custom cold threshold", () => {
    const recentish = lead({ lastActivityAt: "2026-06-10T00:00:00.000Z" }); // 7 days
    expect(detectColdLeadOpportunities([recentish], { now: NOW })).toEqual([]); // default 30
    expect(detectColdLeadOpportunities([recentish], { now: NOW, coldDays: 5 })).toHaveLength(1);
  });

  it("derives higher urgency for high-value, long-cold leads", () => {
    const hot = detectColdLeadOpportunities([lead({ leadScore: 90, lastActivityAt: "2026-03-01T00:00:00.000Z" })], { now: NOW });
    const mild = detectColdLeadOpportunities([lead({ leadScore: 35 })], { now: NOW });
    expect(hot[0].urgency).toBe("high");
    expect(["low", "medium"]).toContain(mild[0].urgency);
  });
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm test src/domain/__tests__/opportunity-detection.test.ts`

- [ ] **Step 3: Implement** `src/domain/opportunity-detection.ts`:

```ts
/**
 * Pure detection of "opportunities" from CRM signals. No I/O. v1 source:
 * cold leads — open, unworked leads that have gone quiet — surfaced for human
 * review (never auto-contacted). Deterministic so it stays unit-testable.
 */

export type ColdLeadInput = {
  id: string;
  /** Human label (contact/company name or lead id) for the card. */
  label: string;
  persona: string;
  leadScore: number; // 0–100
  status: string; // lead_status value
  /** ISO timestamp of the lead's most recent activity (latest event, else received_at). */
  lastActivityAt: string;
  hasActiveCampaign: boolean;
};

export type DetectionConfig = { now: string; coldDays?: number };

export type OpportunityCandidate = {
  kind: "crm_inactivity";
  subjectType: "lead";
  subjectId: string;
  title: string;
  summary: string;
  confidence: number; // 0–100
  urgency: "low" | "medium" | "high";
  evidence: { daysCold: number; leadScore: number; persona: string; lastActivityAt: string };
  recommendedAction: string;
  recommendedCampaignType: string;
};

const DEFAULT_COLD_DAYS = 30;
const TERMINAL_STATUSES = new Set(["converted", "lost", "archived"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Cold-lead opportunities: open leads with no live campaign, quiet >= coldDays. */
export function detectColdLeadOpportunities(leads: ColdLeadInput[], config: DetectionConfig): OpportunityCandidate[] {
  const coldDays = config.coldDays ?? DEFAULT_COLD_DAYS;
  const out: OpportunityCandidate[] = [];
  for (const lead of leads) {
    if (TERMINAL_STATUSES.has(lead.status)) continue;
    if (lead.hasActiveCampaign) continue;
    const daysCold = daysBetween(lead.lastActivityAt, config.now);
    if (daysCold < coldDays) continue;

    // Confidence: lead quality plus a cold bonus (longer quiet = more worth re-engaging).
    const confidence = clamp(Math.round(lead.leadScore + Math.min(20, daysCold / 7)), 0, 100);
    const urgency: OpportunityCandidate["urgency"] =
      lead.leadScore >= 75 && daysCold >= 45 ? "high" : lead.leadScore >= 50 || daysCold >= 60 ? "medium" : "low";

    out.push({
      kind: "crm_inactivity",
      subjectType: "lead",
      subjectId: lead.id,
      title: `${lead.label} — quiet ${daysCold} days`,
      summary: `Open lead (score ${lead.leadScore}) with no live campaign and no activity in ${daysCold} days.`,
      confidence,
      urgency,
      evidence: { daysCold, leadScore: lead.leadScore, persona: lead.persona, lastActivityAt: lead.lastActivityAt },
      recommendedAction: "Re-engage with a persona-tailored campaign",
      recommendedCampaignType: "re_engagement",
    });
  }
  return out;
}
```

- [ ] **Step 4: Run → PASS.** `pnpm test src/domain/__tests__/opportunity-detection.test.ts`

- [ ] **Step 5: Re-export from `src/domain/index.ts`** — add: `export * from "./opportunity-detection";`

- [ ] **Step 6: Typecheck + commit.** `pnpm exec tsc --noEmit` →
```
git add src/domain/opportunity-detection.ts src/domain/__tests__/opportunity-detection.test.ts src/domain/index.ts
git commit -m "feat(domain): cold-lead opportunity detection (pure)"
```

---

## Task 3: Persistence (create-with-dedup, dismiss, snooze, mark)

**Files:** Create `src/lib/opportunities/persistence.ts`, `src/lib/opportunities/__tests__/persistence.test.ts`.

Reuses the interactions pattern: `PersistResult`, `isSupabaseAdminConfigured()` guard, `getCurrentOrgId()`, org-scoped writes.

- [ ] **Step 1: Write the failing test** (dedup is the load-bearing logic) `src/lib/opportunities/__tests__/persistence.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpportunityCandidate } from "@/domain";

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdminClient: () => mockClient,
}));
vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: async () => "org-1" }));

// Minimal Supabase query-builder stub capturing inserts and returning preset rows.
let openRows: Array<{ subject_id: string }> = [];
let inserted: Array<Record<string, unknown>> = [];
const mockClient = {
  from() {
    return {
      select() {
        return {
          eq() {
            return this;
          },
          in: async () => ({ data: openRows, error: null }),
        };
      },
      insert: async (rows: Array<Record<string, unknown>>) => {
        inserted.push(...rows);
        return { error: null };
      },
    };
  },
} as never;

import { upsertOpportunities } from "../persistence";

function candidate(id: string): OpportunityCandidate {
  return {
    kind: "crm_inactivity",
    subjectType: "lead",
    subjectId: id,
    title: `lead ${id}`,
    summary: "s",
    confidence: 60,
    urgency: "medium",
    evidence: { daysCold: 40, leadScore: 60, persona: "persona_landlord", lastActivityAt: "2026-05-01T00:00:00.000Z" },
    recommendedAction: "Re-engage",
    recommendedCampaignType: "re_engagement",
  };
}

beforeEach(() => {
  openRows = [];
  inserted = [];
});
afterEach(() => vi.clearAllMocks());

describe("upsertOpportunities", () => {
  it("inserts new candidates whose subject has no open opportunity", async () => {
    openRows = [{ subject_id: "lead-A" }]; // already open
    const res = await upsertOpportunities([candidate("lead-A"), candidate("lead-B")]);
    expect(res.ok).toBe(true);
    expect(inserted.map((r) => r.subject_id)).toEqual(["lead-B"]); // A deduped
  });
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm test src/lib/opportunities/__tests__/persistence.test.ts`

- [ ] **Step 3: Implement** `src/lib/opportunities/persistence.ts`:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import type { OpportunityCandidate } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type PersistResult = { ok: true; count: number } | { ok: false; error: string };
export type MutateResult = { ok: true } | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase isn't configured, so opportunities can't be saved.";
const OPEN_STATUSES = ["pending", "drafting", "drafted"];

/**
 * Insert new opportunities, skipping any subject that already has an OPEN
 * opportunity of the same kind (app-level dedup; the partial unique index is the
 * DB safety net). Re-scans therefore don't flood the inbox.
 */
export async function upsertOpportunities(
  candidates: OpportunityCandidate[],
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  if (candidates.length === 0) return { ok: true, count: 0 };
  const orgId = await getCurrentOrgId();
  const kind = candidates[0].kind;

  const { data: open, error: readErr } = await client
    .from("opportunities")
    .select("subject_id")
    .eq("org_id", orgId)
    .eq("kind", kind)
    .in("status", OPEN_STATUSES);
  if (readErr) return { ok: false, error: readErr.message };

  const openIds = new Set((open ?? []).map((r: { subject_id: string }) => r.subject_id));
  const fresh = candidates.filter((c) => !openIds.has(c.subjectId));
  if (fresh.length === 0) return { ok: true, count: 0 };

  const rows = fresh.map((c) => ({
    org_id: orgId,
    kind: c.kind,
    subject_type: c.subjectType,
    subject_id: c.subjectId,
    title: c.title,
    summary: c.summary,
    confidence: c.confidence,
    urgency: c.urgency,
    evidence: c.evidence,
    recommended_action: c.recommendedAction,
    recommended_campaign_type: c.recommendedCampaignType,
    status: "pending",
    detected_by: "arc",
  }));
  const { error: insErr } = await client.from("opportunities").insert(rows);
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, count: rows.length };
}

async function setStatus(
  id: string,
  patch: Record<string, unknown>,
  client: SupabaseClient,
): Promise<MutateResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const { error } = await client.from("opportunities").update(patch).eq("org_id", orgId).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function dismissOpportunity(id: string, client: SupabaseClient = getSupabaseAdminClient()) {
  return setStatus(id, { status: "dismissed", dismissed_at: new Date().toISOString() }, client);
}

export function snoozeOpportunity(id: string, untilIso: string, client: SupabaseClient = getSupabaseAdminClient()) {
  return setStatus(id, { status: "snoozed", snoozed_until: untilIso }, client);
}

export function markOpportunityDrafting(id: string, agentTaskId: string, client: SupabaseClient = getSupabaseAdminClient()) {
  return setStatus(id, { status: "drafting", agent_task_id: agentTaskId }, client);
}

export function markOpportunityDrafted(id: string, campaignId: string, client: SupabaseClient = getSupabaseAdminClient()) {
  return setStatus(id, { status: "drafted", campaign_id: campaignId }, client);
}
```

- [ ] **Step 4: Run → PASS.** `pnpm test src/lib/opportunities/__tests__/persistence.test.ts`

- [ ] **Step 5: Commit** — `git add src/lib/opportunities/persistence.ts src/lib/opportunities/__tests__/persistence.test.ts && git commit -m "feat(opportunities): persistence with re-scan dedup"`

---

## Task 4: Detector + read-model

**Files:** Create `src/lib/opportunities/detector.ts`, `src/lib/opportunities/read-model.ts`.

- [ ] **Step 1: Implement the detector** `src/lib/opportunities/detector.ts`:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { detectColdLeadOpportunities, type ColdLeadInput } from "@/domain";
import { listLeads } from "@/lib/repos/leads";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { upsertOpportunities, type PersistResult } from "./persistence";

const ACTIVE_CAMPAIGN_STATUSES = ["draft", "approved_awaiting_launch", "active", "paused"];

/**
 * Run cold-lead detection over current CRM data and persist new opportunities.
 * Recency = the lead's latest `events` row, falling back to its received_at.
 */
export async function runColdLeadDetection(
  client: SupabaseClient = getSupabaseAdminClient(),
  now: string = new Date().toISOString(),
): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: "not_configured" };

  const leads = await listLeads({ limit: 500 }, client);
  if (leads.length === 0) return { ok: true, count: 0 };
  const leadIds = leads.map((l) => l.id);

  // Latest activity per lead from the events log (one query, newest first).
  const { data: events } = await client
    .from("events")
    .select("subject_id, occurred_at")
    .eq("subject_type", "lead")
    .in("subject_id", leadIds)
    .order("occurred_at", { ascending: false });
  const latestActivity = new Map<string, string>();
  for (const e of (events ?? []) as Array<{ subject_id: string; occurred_at: string }>) {
    if (!latestActivity.has(e.subject_id)) latestActivity.set(e.subject_id, e.occurred_at);
  }

  // Leads that already have a non-terminal campaign.
  const { data: camps } = await client
    .from("campaigns")
    .select("lead_id, status")
    .in("lead_id", leadIds)
    .in("status", ACTIVE_CAMPAIGN_STATUSES);
  const leadsWithCampaign = new Set((camps ?? []).map((c: { lead_id: string }) => c.lead_id).filter(Boolean));

  const inputs: ColdLeadInput[] = leads.map((l) => ({
    id: l.id,
    label: l.lossSummary?.slice(0, 60) || `Lead ${l.id.slice(0, 8)}`,
    persona: l.persona,
    leadScore: l.leadScore,
    status: l.status,
    lastActivityAt: latestActivity.get(l.id) ?? l.receivedAt,
    hasActiveCampaign: leadsWithCampaign.has(l.id),
  }));

  const candidates = detectColdLeadOpportunities(inputs, { now });
  return upsertOpportunities(candidates, client);
}
```

- [ ] **Step 2: Implement the read-model** `src/lib/opportunities/read-model.ts`:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import type { OpportunityBucket, OpportunityRow } from "@/app/_components/opportunity-command-center";
import type { ThemeTone } from "@/app/_components/theme";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

type OpportunityRecord = {
  id: string;
  subject_type: string;
  subject_id: string;
  title: string;
  summary: string;
  confidence: number;
  urgency: "low" | "medium" | "high";
  status: string;
  recommended_action: string;
};

const URGENCY_TONE: Record<OpportunityRecord["urgency"], ThemeTone> = { high: "red", medium: "amber", low: "blue" };
const URGENCY_RANK: Record<OpportunityRecord["urgency"], number> = { high: 0, medium: 1, low: 2 };

/** Open opportunities (pending/drafting/drafted) for the inbox. Empty when unconfigured. */
export async function listOpenOpportunities(
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<OpportunityRecord[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const orgId = await getCurrentOrgId();
  const { data, error } = await client
    .from("opportunities")
    .select("id, subject_type, subject_id, title, summary, confidence, urgency, status, recommended_action")
    .eq("org_id", orgId)
    .in("status", ["pending", "drafting", "drafted"])
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as OpportunityRecord[];
}

/** Count of pending (un-triaged) opportunities, for the /arc chip. */
export async function countPendingOpportunities(client: SupabaseClient = getSupabaseAdminClient()): Promise<number> {
  if (!isSupabaseAdminConfigured()) return 0;
  const orgId = await getCurrentOrgId();
  const { count } = await client
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "pending");
  return count ?? 0;
}

function toRow(r: OpportunityRecord): OpportunityRow {
  return {
    id: r.id,
    href: `/crm/leads/${r.subject_id}`,
    record: r.title,
    account: r.summary,
    nextStep: r.recommended_action,
    stage: r.status,
    tone: URGENCY_TONE[r.urgency],
    value: String(r.confidence),
    urgencyTag: r.urgency,
  };
}

/** Bucket open opportunities by urgency for OpportunityCommandCenter. */
export function buildOpportunityBuckets(records: OpportunityRecord[]): OpportunityBucket[] {
  const sorted = [...records].sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]);
  return [
    {
      key: "all",
      title: "All opportunities",
      detail: `${sorted.length} open`,
      href: "/opportunities",
      tone: "amber",
      rows: sorted.map(toRow),
      emptyTitle: "No opportunities yet",
      emptyDetail: "Run a scan to surface cold leads worth re-engaging.",
    },
  ];
}
```

- [ ] **Step 3: Typecheck + commit.** `pnpm exec tsc --noEmit` →
```
git add src/lib/opportunities/detector.ts src/lib/opportunities/read-model.ts
git commit -m "feat(opportunities): detector + inbox read-model"
```

---

## Task 5: Inbox page + Scan/Dismiss/Snooze actions

**Files:** Create `src/app/opportunities/actions.ts`, `src/app/opportunities/page.tsx`.

- [ ] **Step 1: Implement actions** `src/app/opportunities/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { runColdLeadDetection } from "@/lib/opportunities/detector";
import { dismissOpportunity, snoozeOpportunity } from "@/lib/opportunities/persistence";

export async function scanOpportunitiesAction(): Promise<void> {
  await requireOperator();
  await runColdLeadDetection();
  revalidatePath("/opportunities");
}

export async function dismissOpportunityAction(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get("id") ?? "").trim();
  if (id) await dismissOpportunity(id);
  revalidatePath("/opportunities");
}

export async function snoozeOpportunityAction(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get("id") ?? "").trim();
  if (id) {
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // snooze 1 week
    await snoozeOpportunity(id, until);
  }
  revalidatePath("/opportunities");
}
```

- [ ] **Step 2: Implement the page** `src/app/opportunities/page.tsx` (server component; reuses `PageHeader`/`OperatorBar`/`ActionFeedback` primitives like the scaffold pages, plus the real `OpportunityCommandCenter`):

```tsx
import { PageHeader, OperatorBar, ActionFeedback } from "@/app/_components/page-header";
import { OpportunityCommandCenter } from "@/app/_components/opportunity-command-center";
import { buildOpportunityBuckets, listOpenOpportunities } from "@/lib/opportunities/read-model";

import { scanOpportunitiesAction } from "./actions";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;
  const records = await listOpenOpportunities();
  const buckets = buildOpportunityBuckets(records);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title="Opportunities"
        description="Source-backed opportunities Arc found for review. Nothing is contacted without your approval."
      />
      <OperatorBar
        primary={
          <form action={scanOpportunitiesAction}>
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--accent-contrast)]"
            >
              Scan for opportunities
            </button>
          </form>
        }
      />
      <ActionFeedback action={action} messages={{ scanned: "Scan complete." }} />
      <OpportunityCommandCenter buckets={buckets} />
    </div>
  );
}
```

> Plan-stage note: confirm `PageHeader`/`OperatorBar`/`ActionFeedback` prop shapes against `src/app/_components/page-header.tsx` and an existing scaffold page (e.g. an `/activity` or partners page) and match them exactly; adjust the markup above to the real prop names if they differ. `OpportunityCommandCenter`'s props (`{ buckets }`) are already confirmed.

- [ ] **Step 3: Typecheck + commit.** `pnpm exec tsc --noEmit` →
```
git add src/app/opportunities
git commit -m "feat(opportunities): inbox page + scan/dismiss/snooze actions"
```

---

## Task 6: Navigation entry + /arc count

**Files:** Modify `src/app/_components/nav-icons.tsx`, `src/app/_components/console-frame.tsx`, `src/app/_data/growth-engine.ts`.

- [ ] **Step 1: Add an icon.** In `src/app/_components/nav-icons.tsx`, add `"opportunities"` to the `NavIconName` union and a matching `case "opportunities":` returning an SVG (reuse the visual language of the other icons — e.g. a target/spark glyph). Keep the same `viewBox`/stroke conventions as the existing icons in that file.

- [ ] **Step 2: Add the nav item.** In `src/app/_components/console-frame.tsx`, add to the `navItems: ShellNavItem[]` array (after Campaigns):
```ts
    { label: "Opportunities", href: "/opportunities", icon: "opportunities", matches: ["/opportunities"] },
```

- [ ] **Step 3: Quick-jump entry.** In `src/app/_data/growth-engine.ts`, add to `navItems`:
```ts
  { label: "Opportunities", href: "/opportunities", icon: "opportunities" },
```

- [ ] **Step 4: Typecheck + commit.** `pnpm exec tsc --noEmit` →
```
git add src/app/_components/nav-icons.tsx src/app/_components/console-frame.tsx src/app/_data/growth-engine.ts
git commit -m "feat(opportunities): nav entry + icon"
```

---

## Task 7: Manual acceptance

- [ ] **Step 1: Apply the migration** to the local/dev Supabase (and note it must be applied to prod manually).
- [ ] **Step 2: Seed** a couple of leads with old `received_at` (or no recent `events`), open status, no campaign.
- [ ] **Step 3:** Visit `/opportunities` → click **Scan for opportunities** → cold leads appear as cards with confidence/urgency + a link to `/crm/leads/<id>`. Re-scan → no duplicates.
- [ ] **Step 4:** Dismiss / Snooze a card → it leaves the active inbox.
- [ ] **Step 5:** Without Supabase configured, the page renders an empty state and Scan no-ops gracefully (no crash).

---

## Self-review notes
- **Spec coverage:** `opportunities` table (T1); cold-lead detection (T2); persistence with dedup (T3); detector + read-model + count (T4); inbox page + Scan/Dismiss/Snooze (T5); nav + icon (T6); manual acceptance (T7). The **Draft with Arc** action + `/arc` chip wiring belong to Plan 2 (Arc-authored drafting) — the read-model already exposes `countPendingOpportunities` for the chip.
- **Type/name consistency:** `OpportunityCandidate` (domain) → `upsertOpportunities` (persistence) → `runColdLeadDetection` (detector) → `OpportunityRecord`/`buildOpportunityBuckets` (read-model) → `OpportunityCommandCenter` `{buckets}` (UI, confirmed props). `getCurrentOrgId`/`isSupabaseAdminConfigured` guards match the interactions reference.
- **Reuse:** mirrors CRM-interactions (PersistResult/guard/org-scope), the `events` table for recency, `campaigns.lead_id` for active-campaign check, and the already-built `OpportunityCommandCenter`.
- **Deferred to Plan 2:** the runner wake-type `arc_opportunity_draft`, the `agent_task` enqueue, `draft-asset` `opportunity_id` linkage, the live **Draft with Arc** action, and the `/arc` count chip.
- **Open items confirmed at build:** exact `page-header.tsx` primitive prop shapes; the new nav icon SVG.
```

# Phase 1A: Schema Additions + Leads Repo (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the three missing schema tables (`events`, `routing_decisions`, `integrity_findings`), define their domain types, build a typed `leads` repo with `list`/`get`/`count` reads, and establish the test-mocking pattern that subsequent repos (Plans 1B and 1C) will copy.

**Architecture:** One migration appends three tables and supporting indexes to the existing schema. New `src/lib/repos/` module holds per-object read functions that take an injectable `SupabaseClient` (default = `getSupabaseAdminClient()`); tests pass a chainable mock so no live Supabase is required. Zod schemas in `src/domain/` parse snake_case rows and `.transform()` them into camelCase domain types to stay consistent with the existing `parseLeadIngestionPayload` output style.

**Tech Stack:** Next.js 16, React 19, Supabase (`@supabase/supabase-js` v2), Zod v4, Vitest v4, pnpm. Path alias `@/*` → `./src/*`.

---

## File Structure

**Create:**
- `supabase/migrations/20260528120000_phase1_activity_routing_integrity.sql` — adds `events`, `routing_decisions`, `integrity_findings` tables, indexes, and reuses `set_updated_at()`.
- `src/domain/events.ts` — `EventType`, `EventSubjectType`, `EventRowSchema`, `EventSchema` (transformed), `Event` type.
- `src/domain/routing-decisions.ts` — `RoutingDecisionRowSchema`, `RoutingDecisionSchema`, `RoutingDecision` type.
- `src/domain/integrity-findings.ts` — `IntegrityFindingSeverity`, `IntegrityFindingRowSchema`, `IntegrityFindingSchema`, `IntegrityFinding` type.
- `src/domain/leads.ts` — `LeadRowSchema`, `LeadSchema`, `Lead` type (stored-lead representation; distinct from existing `LeadIngestionPayload`).
- `src/lib/repos/__tests__/test-helpers.ts` — `createSupabaseQueryMock()` builder for repo unit tests.
- `src/lib/repos/leads.ts` — `listLeads`, `getLead`, `countLeads`.
- `src/lib/repos/leads.test.ts` — colocated tests using the mock helper.
- `src/lib/repos/index.ts` — re-exports the repo functions.

**Modify:**
- `src/domain/index.ts` — add four new `export *` lines.

---

## Task 1: Add migration for `events`, `routing_decisions`, `integrity_findings`

**Files:**
- Create: `supabase/migrations/20260528120000_phase1_activity_routing_integrity.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Phase 1A: activity events, routing decisions, integrity findings.
-- Reuses set_updated_at() defined in 20260527131500_initial_growth_engine_schema.sql.

create type public.event_subject_type as enum (
  'company',
  'contact',
  'property',
  'lead',
  'job',
  'outcome'
);

create type public.routing_decision_kind as enum (
  'mitigation',
  'review',
  'out_of_scope',
  'archived'
);

create type public.integrity_severity as enum (
  'info',
  'warning',
  'blocking'
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  actor text not null check (length(btrim(actor)) > 0),
  subject_type public.event_subject_type not null,
  subject_id uuid not null,
  type text not null check (length(btrim(type)) > 0),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index events_subject_idx on public.events(subject_type, subject_id, occurred_at desc);
create index events_type_idx on public.events(type, occurred_at desc);
create index events_occurred_at_idx on public.events(occurred_at desc);

create table public.routing_decisions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  decision public.routing_decision_kind not null,
  confidence integer not null check (confidence between 0 and 100),
  sla_target_minutes integer check (sla_target_minutes is null or sla_target_minutes >= 0),
  decided_by text not null check (length(btrim(decided_by)) > 0),
  decided_at timestamptz not null default now(),
  rationale jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index routing_decisions_lead_id_idx on public.routing_decisions(lead_id, decided_at desc);
create index routing_decisions_decision_idx on public.routing_decisions(decision, decided_at desc);

create table public.integrity_findings (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null check (length(btrim(rule_key)) > 0),
  subject_type public.event_subject_type not null,
  subject_id uuid not null,
  severity public.integrity_severity not null default 'warning',
  detail jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrity_findings_resolved_after_detected_check check (
    resolved_at is null or resolved_at >= detected_at
  )
);

create unique index integrity_findings_open_unique_idx
  on public.integrity_findings(rule_key, subject_type, subject_id)
  where resolved_at is null;

create index integrity_findings_subject_idx
  on public.integrity_findings(subject_type, subject_id);

create index integrity_findings_severity_idx
  on public.integrity_findings(severity)
  where resolved_at is null;

create trigger integrity_findings_set_updated_at
before update on public.integrity_findings
for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Lint-check the SQL parses by reading it back**

Run: `cat supabase/migrations/20260528120000_phase1_activity_routing_integrity.sql | head -5`
Expected: prints the comment header — confirms file was written.

- [ ] **Step 3: Verify build is unaffected (no app code references this yet)**

Run: `pnpm build`
Expected: PASS — "Compiled successfully", no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260528120000_phase1_activity_routing_integrity.sql
git commit -m "feat(schema): add events, routing_decisions, integrity_findings tables"
```

---

## Task 2: Add `Event` domain type

**Files:**
- Create: `src/domain/events.ts`
- Create: `src/domain/__tests__/events.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/__tests__/events.test.ts
import { describe, expect, it } from "vitest";

import { EventSchema } from "../events";

describe("EventSchema", () => {
  it("parses a snake_case row into a camelCase domain Event", () => {
    const row = {
      id: "11111111-1111-1111-1111-111111111111",
      actor: "system",
      subject_type: "lead",
      subject_id: "22222222-2222-2222-2222-222222222222",
      type: "lead.routed",
      payload: { decision: "mitigation" },
      occurred_at: "2026-05-28T12:00:00.000Z",
      created_at: "2026-05-28T12:00:00.000Z",
    };

    expect(EventSchema.parse(row)).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      actor: "system",
      subjectType: "lead",
      subjectId: "22222222-2222-2222-2222-222222222222",
      type: "lead.routed",
      payload: { decision: "mitigation" },
      occurredAt: "2026-05-28T12:00:00.000Z",
      createdAt: "2026-05-28T12:00:00.000Z",
    });
  });

  it("rejects rows missing required fields", () => {
    expect(() =>
      EventSchema.parse({
        id: "11111111-1111-1111-1111-111111111111",
        actor: "system",
        subject_type: "lead",
        // subject_id missing
        type: "lead.routed",
        payload: {},
        occurred_at: "2026-05-28T12:00:00.000Z",
        created_at: "2026-05-28T12:00:00.000Z",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/events.test.ts`
Expected: FAIL — "Cannot find module '../events'".

- [ ] **Step 3: Implement the domain module**

```ts
// src/domain/events.ts
import { z } from "zod";

export const EVENT_SUBJECT_TYPES = ["company", "contact", "property", "lead", "job", "outcome"] as const;
export const EventSubjectTypeSchema = z.enum(EVENT_SUBJECT_TYPES);
export type EventSubjectType = z.infer<typeof EventSubjectTypeSchema>;

// Free-form event type strings. Conventions: "<subject>.<verb>" (e.g. "lead.created").
// Listed canonical types here so call sites can reference constants instead of magic strings.
export const EVENT_TYPES = {
  LeadCreated: "lead.created",
  LeadValidated: "lead.validated",
  LeadRouted: "lead.routed",
  LeadContacted: "lead.contacted",
  JobOpened: "job.opened",
  JobCompleted: "job.completed",
  OutcomeRecorded: "outcome.recorded",
} as const;

export const EventRowSchema = z.object({
  id: z.string().uuid(),
  actor: z.string().min(1),
  subject_type: EventSubjectTypeSchema,
  subject_id: z.string().uuid(),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  occurred_at: z.string(),
  created_at: z.string(),
});

export const EventSchema = EventRowSchema.transform((row) => ({
  id: row.id,
  actor: row.actor,
  subjectType: row.subject_type,
  subjectId: row.subject_id,
  type: row.type,
  payload: row.payload,
  occurredAt: row.occurred_at,
  createdAt: row.created_at,
}));

export type EventRow = z.infer<typeof EventRowSchema>;
export type Event = z.infer<typeof EventSchema>;
```

- [ ] **Step 4: Re-export from `src/domain/index.ts`**

Modify `src/domain/index.ts` to add a single line:

```ts
export * from "./events";
```

(append to existing export list)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/events.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/events.ts src/domain/__tests__/events.test.ts src/domain/index.ts
git commit -m "feat(domain): add Event schema and EVENT_TYPES constants"
```

---

## Task 3: Add `RoutingDecision` domain type

**Files:**
- Create: `src/domain/routing-decisions.ts`
- Create: `src/domain/__tests__/routing-decisions.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/__tests__/routing-decisions.test.ts
import { describe, expect, it } from "vitest";

import { RoutingDecisionSchema } from "../routing-decisions";

describe("RoutingDecisionSchema", () => {
  it("parses a snake_case row into a camelCase domain RoutingDecision", () => {
    const row = {
      id: "aaaa1111-1111-1111-1111-111111111111",
      lead_id: "bbbb2222-2222-2222-2222-222222222222",
      decision: "mitigation",
      confidence: 92,
      sla_target_minutes: 15,
      decided_by: "system",
      decided_at: "2026-05-28T12:05:00.000Z",
      rationale: { signal: "standing water" },
      created_at: "2026-05-28T12:05:00.000Z",
    };

    expect(RoutingDecisionSchema.parse(row)).toEqual({
      id: "aaaa1111-1111-1111-1111-111111111111",
      leadId: "bbbb2222-2222-2222-2222-222222222222",
      decision: "mitigation",
      confidence: 92,
      slaTargetMinutes: 15,
      decidedBy: "system",
      decidedAt: "2026-05-28T12:05:00.000Z",
      rationale: { signal: "standing water" },
      createdAt: "2026-05-28T12:05:00.000Z",
    });
  });

  it("rejects an out-of-range confidence", () => {
    expect(() =>
      RoutingDecisionSchema.parse({
        id: "aaaa1111-1111-1111-1111-111111111111",
        lead_id: "bbbb2222-2222-2222-2222-222222222222",
        decision: "mitigation",
        confidence: 250,
        sla_target_minutes: null,
        decided_by: "system",
        decided_at: "2026-05-28T12:05:00.000Z",
        rationale: {},
        created_at: "2026-05-28T12:05:00.000Z",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/routing-decisions.test.ts`
Expected: FAIL — "Cannot find module '../routing-decisions'".

- [ ] **Step 3: Implement the domain module**

```ts
// src/domain/routing-decisions.ts
import { z } from "zod";

export const ROUTING_DECISION_KINDS = ["mitigation", "review", "out_of_scope", "archived"] as const;
export const RoutingDecisionKindSchema = z.enum(ROUTING_DECISION_KINDS);
export type RoutingDecisionKind = z.infer<typeof RoutingDecisionKindSchema>;

export const RoutingDecisionRowSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid(),
  decision: RoutingDecisionKindSchema,
  confidence: z.number().int().min(0).max(100),
  sla_target_minutes: z.number().int().min(0).nullable(),
  decided_by: z.string().min(1),
  decided_at: z.string(),
  rationale: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});

export const RoutingDecisionSchema = RoutingDecisionRowSchema.transform((row) => ({
  id: row.id,
  leadId: row.lead_id,
  decision: row.decision,
  confidence: row.confidence,
  slaTargetMinutes: row.sla_target_minutes,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at,
  rationale: row.rationale,
  createdAt: row.created_at,
}));

export type RoutingDecisionRow = z.infer<typeof RoutingDecisionRowSchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
```

- [ ] **Step 4: Re-export from `src/domain/index.ts`**

Append to `src/domain/index.ts`:

```ts
export * from "./routing-decisions";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/routing-decisions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/routing-decisions.ts src/domain/__tests__/routing-decisions.test.ts src/domain/index.ts
git commit -m "feat(domain): add RoutingDecision schema"
```

---

## Task 4: Add `IntegrityFinding` domain type

**Files:**
- Create: `src/domain/integrity-findings.ts`
- Create: `src/domain/__tests__/integrity-findings.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/__tests__/integrity-findings.test.ts
import { describe, expect, it } from "vitest";

import { IntegrityFindingSchema } from "../integrity-findings";

describe("IntegrityFindingSchema", () => {
  it("parses a snake_case row with an unresolved finding", () => {
    const row = {
      id: "cccc1111-1111-1111-1111-111111111111",
      rule_key: "missing_email",
      subject_type: "contact",
      subject_id: "dddd2222-2222-2222-2222-222222222222",
      severity: "warning",
      detail: { field: "email" },
      detected_at: "2026-05-28T11:00:00.000Z",
      resolved_at: null,
      created_at: "2026-05-28T11:00:00.000Z",
      updated_at: "2026-05-28T11:00:00.000Z",
    };

    expect(IntegrityFindingSchema.parse(row)).toEqual({
      id: "cccc1111-1111-1111-1111-111111111111",
      ruleKey: "missing_email",
      subjectType: "contact",
      subjectId: "dddd2222-2222-2222-2222-222222222222",
      severity: "warning",
      detail: { field: "email" },
      detectedAt: "2026-05-28T11:00:00.000Z",
      resolvedAt: null,
      createdAt: "2026-05-28T11:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("parses a resolved finding", () => {
    const parsed = IntegrityFindingSchema.parse({
      id: "cccc1111-1111-1111-1111-111111111111",
      rule_key: "duplicate_company",
      subject_type: "company",
      subject_id: "eeee3333-3333-3333-3333-333333333333",
      severity: "blocking",
      detail: { duplicate_of: "ffff4444-4444-4444-4444-444444444444" },
      detected_at: "2026-05-27T10:00:00.000Z",
      resolved_at: "2026-05-28T12:00:00.000Z",
      created_at: "2026-05-27T10:00:00.000Z",
      updated_at: "2026-05-28T12:00:00.000Z",
    });

    expect(parsed.resolvedAt).toBe("2026-05-28T12:00:00.000Z");
    expect(parsed.severity).toBe("blocking");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/integrity-findings.test.ts`
Expected: FAIL — "Cannot find module '../integrity-findings'".

- [ ] **Step 3: Implement the domain module**

```ts
// src/domain/integrity-findings.ts
import { z } from "zod";

import { EventSubjectTypeSchema } from "./events";

export const INTEGRITY_SEVERITIES = ["info", "warning", "blocking"] as const;
export const IntegritySeveritySchema = z.enum(INTEGRITY_SEVERITIES);
export type IntegritySeverity = z.infer<typeof IntegritySeveritySchema>;

export const IntegrityFindingRowSchema = z.object({
  id: z.string().uuid(),
  rule_key: z.string().min(1),
  subject_type: EventSubjectTypeSchema,
  subject_id: z.string().uuid(),
  severity: IntegritySeveritySchema,
  detail: z.record(z.string(), z.unknown()),
  detected_at: z.string(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const IntegrityFindingSchema = IntegrityFindingRowSchema.transform((row) => ({
  id: row.id,
  ruleKey: row.rule_key,
  subjectType: row.subject_type,
  subjectId: row.subject_id,
  severity: row.severity,
  detail: row.detail,
  detectedAt: row.detected_at,
  resolvedAt: row.resolved_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}));

export type IntegrityFindingRow = z.infer<typeof IntegrityFindingRowSchema>;
export type IntegrityFinding = z.infer<typeof IntegrityFindingSchema>;
```

- [ ] **Step 4: Re-export from `src/domain/index.ts`**

Append:

```ts
export * from "./integrity-findings";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/integrity-findings.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/integrity-findings.ts src/domain/__tests__/integrity-findings.test.ts src/domain/index.ts
git commit -m "feat(domain): add IntegrityFinding schema"
```

---

## Task 5: Add `Lead` domain type (stored-lead representation)

**Files:**
- Create: `src/domain/leads.ts`
- Create: `src/domain/__tests__/leads.test.ts`
- Modify: `src/domain/index.ts`

The existing `lead-ingestion.ts` defines the *input* payload type for the ingest API. This task introduces the *stored* `Lead` shape that repos return — distinct because it has DB-managed fields (`id`, `lead_score`, `received_at`, etc.) that the ingest payload lacks.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/__tests__/leads.test.ts
import { describe, expect, it } from "vitest";

import { LeadSchema } from "../leads";

describe("LeadSchema", () => {
  it("parses a stored lead row into a camelCase domain Lead", () => {
    const row = {
      id: "10000000-0000-0000-0000-000000000001",
      company_id: "10000000-0000-0000-0000-000000000002",
      contact_id: "10000000-0000-0000-0000-000000000003",
      property_id: "10000000-0000-0000-0000-000000000004",
      persona: "persona_homeowner_emergency",
      status: "validated",
      routing_recommendation: "elevated",
      source: "website",
      external_lead_id: null,
      loss_summary: "Basement flooding",
      loss_signals: ["standing water", "burst pipe"],
      matched_target_keywords: ["standing water"],
      matched_non_target_keywords: [],
      lead_score: 85,
      received_at: "2026-05-28T09:00:00.000Z",
      metadata: { partner_score: 60 },
      created_at: "2026-05-28T09:00:00.000Z",
      updated_at: "2026-05-28T09:00:00.000Z",
    };

    expect(LeadSchema.parse(row)).toEqual({
      id: "10000000-0000-0000-0000-000000000001",
      companyId: "10000000-0000-0000-0000-000000000002",
      contactId: "10000000-0000-0000-0000-000000000003",
      propertyId: "10000000-0000-0000-0000-000000000004",
      persona: "persona_homeowner_emergency",
      status: "validated",
      routingRecommendation: "elevated",
      source: "website",
      externalLeadId: null,
      lossSummary: "Basement flooding",
      lossSignals: ["standing water", "burst pipe"],
      matchedTargetKeywords: ["standing water"],
      matchedNonTargetKeywords: [],
      leadScore: 85,
      receivedAt: "2026-05-28T09:00:00.000Z",
      metadata: { partner_score: 60 },
      createdAt: "2026-05-28T09:00:00.000Z",
      updatedAt: "2026-05-28T09:00:00.000Z",
    });
  });

  it("rejects lead_score above 100", () => {
    expect(() =>
      LeadSchema.parse({
        id: "10000000-0000-0000-0000-000000000001",
        company_id: null,
        contact_id: null,
        property_id: null,
        persona: "persona_homeowner_emergency",
        status: "validated",
        routing_recommendation: "target",
        source: "website",
        external_lead_id: null,
        loss_summary: null,
        loss_signals: [],
        matched_target_keywords: [],
        matched_non_target_keywords: [],
        lead_score: 150,
        received_at: "2026-05-28T09:00:00.000Z",
        metadata: {},
        created_at: "2026-05-28T09:00:00.000Z",
        updated_at: "2026-05-28T09:00:00.000Z",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/leads.test.ts`
Expected: FAIL — "Cannot find module '../leads'".

- [ ] **Step 3: Implement the domain module**

```ts
// src/domain/leads.ts
import { z } from "zod";

import { INTERNAL_UNASSIGNED_PERSONA, OFFICIAL_PERSONA_MAPPINGS } from "./personas";

const PERSONA_VALUES = [
  ...OFFICIAL_PERSONA_MAPPINGS,
  INTERNAL_UNASSIGNED_PERSONA,
] as [string, ...string[]];

export const LEAD_STATUSES = [
  "new",
  "validated",
  "needs_review",
  "qualified",
  "converted",
  "lost",
  "archived",
] as const;
export const LeadStatusSchema = z.enum(LEAD_STATUSES);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;

export const ROUTING_RECOMMENDATIONS = ["target", "elevated", "downgraded", "isolated", "archived"] as const;
export const RoutingRecommendationSchema = z.enum(ROUTING_RECOMMENDATIONS);
export type RoutingRecommendation = z.infer<typeof RoutingRecommendationSchema>;

export const LeadRowSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid().nullable(),
  contact_id: z.string().uuid().nullable(),
  property_id: z.string().uuid().nullable(),
  persona: z.enum(PERSONA_VALUES),
  status: LeadStatusSchema,
  routing_recommendation: RoutingRecommendationSchema,
  source: z.string().min(1),
  external_lead_id: z.string().nullable(),
  loss_summary: z.string().nullable(),
  loss_signals: z.array(z.string()),
  matched_target_keywords: z.array(z.string()),
  matched_non_target_keywords: z.array(z.string()),
  lead_score: z.number().int().min(0).max(100),
  received_at: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

export const LeadSchema = LeadRowSchema.transform((row) => ({
  id: row.id,
  companyId: row.company_id,
  contactId: row.contact_id,
  propertyId: row.property_id,
  persona: row.persona,
  status: row.status,
  routingRecommendation: row.routing_recommendation,
  source: row.source,
  externalLeadId: row.external_lead_id,
  lossSummary: row.loss_summary,
  lossSignals: row.loss_signals,
  matchedTargetKeywords: row.matched_target_keywords,
  matchedNonTargetKeywords: row.matched_non_target_keywords,
  leadScore: row.lead_score,
  receivedAt: row.received_at,
  metadata: row.metadata,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}));

export type LeadRow = z.infer<typeof LeadRowSchema>;
export type Lead = z.infer<typeof LeadSchema>;
```

- [ ] **Step 4: Re-export from `src/domain/index.ts`**

Append:

```ts
export * from "./leads";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/leads.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full domain suite to confirm nothing else broke**

Run: `pnpm test src/domain`
Expected: PASS — all existing + new tests green.

- [ ] **Step 7: Commit**

```bash
git add src/domain/leads.ts src/domain/__tests__/leads.test.ts src/domain/index.ts
git commit -m "feat(domain): add stored Lead schema"
```

---

## Task 6: Add the repo test-mocking helper

This helper is the foundation every repo test uses. It builds a chainable mock that mimics the supabase-js query builder and lets a test assert which methods/arguments were called and supply canned response data.

**Files:**
- Create: `src/lib/repos/__tests__/test-helpers.ts`
- Create: `src/lib/repos/__tests__/test-helpers.test.ts`

- [ ] **Step 1: Write the failing test for the helper itself**

```ts
// src/lib/repos/__tests__/test-helpers.test.ts
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "./test-helpers";

describe("createSupabaseQueryMock", () => {
  it("returns canned data when the chain is awaited", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [{ id: "abc" }], error: null },
    });

    const result = await supabase.from("leads").select("*").order("received_at", { ascending: false });

    expect(result).toEqual({ data: [{ id: "abc" }], error: null });
  });

  it("records every chained call on the recorded calls log", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await supabase.from("leads").select("id").eq("status", "validated").limit(5);

    expect(supabase.calls).toEqual([
      ["from", "leads"],
      ["select", "id"],
      ["eq", "status", "validated"],
      ["limit", 5],
    ]);
  });

  it("returns canned data for .single() too", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: { id: "abc" }, error: null },
    });

    const result = await supabase.from("leads").select("*").eq("id", "abc").single();
    expect(result).toEqual({ data: { id: "abc" }, error: null });
  });

  it("returns an error response when configured", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: { message: "boom" } },
    });

    const result = await supabase.from("leads").select("*");
    expect(result.error).toEqual({ message: "boom" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/repos/__tests__/test-helpers.test.ts`
Expected: FAIL — "Cannot find module './test-helpers'".

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/repos/__tests__/test-helpers.ts
import { type SupabaseClient } from "@supabase/supabase-js";

export type MockResponse = {
  data: unknown;
  error: { message: string } | null;
};

export type MockSupabase = SupabaseClient & {
  calls: Array<[string, ...unknown[]]>;
};

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "delete",
  "upsert",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "is",
  "like",
  "ilike",
  "order",
  "limit",
  "range",
  "single",
  "maybeSingle",
] as const;

export function createSupabaseQueryMock(
  responses: Record<string, MockResponse>,
): MockSupabase {
  const calls: Array<[string, ...unknown[]]> = [];

  const makeChain = (tableName: string) => {
    const chain: Record<string, unknown> = {};

    for (const method of CHAIN_METHODS) {
      chain[method] = (...args: unknown[]) => {
        calls.push([method, ...args]);
        return chain;
      };
    }

    chain.then = (
      onFulfilled?: (value: MockResponse) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const response = responses[tableName] ?? { data: [], error: null };
      return Promise.resolve(response).then(onFulfilled, onRejected);
    };

    return chain;
  };

  const from = (tableName: string) => {
    calls.push(["from", tableName]);
    return makeChain(tableName);
  };

  return { from, calls } as unknown as MockSupabase;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/repos/__tests__/test-helpers.test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/__tests__/test-helpers.ts src/lib/repos/__tests__/test-helpers.test.ts
git commit -m "test: add createSupabaseQueryMock helper for repo unit tests"
```

---

## Task 7: Implement `listLeads` (no filters)

**Files:**
- Create: `src/lib/repos/leads.ts`
- Create: `src/lib/repos/leads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/repos/leads.test.ts
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "./__tests__/test-helpers";
import { listLeads } from "./leads";

const validLeadRow = {
  id: "10000000-0000-0000-0000-000000000001",
  company_id: null,
  contact_id: "10000000-0000-0000-0000-000000000003",
  property_id: null,
  persona: "persona_homeowner_emergency",
  status: "validated",
  routing_recommendation: "elevated",
  source: "website",
  external_lead_id: null,
  loss_summary: "Basement flooding",
  loss_signals: ["standing water"],
  matched_target_keywords: ["standing water"],
  matched_non_target_keywords: [],
  lead_score: 85,
  received_at: "2026-05-28T09:00:00.000Z",
  metadata: {},
  created_at: "2026-05-28T09:00:00.000Z",
  updated_at: "2026-05-28T09:00:00.000Z",
};

describe("listLeads", () => {
  it("returns parsed Lead objects ordered by received_at desc", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [validLeadRow], error: null },
    });

    const leads = await listLeads({}, supabase);

    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      id: validLeadRow.id,
      leadScore: 85,
      receivedAt: "2026-05-28T09:00:00.000Z",
    });
    expect(supabase.calls).toContainEqual(["from", "leads"]);
    expect(supabase.calls).toContainEqual(["select", "*"]);
    expect(supabase.calls).toContainEqual(["order", "received_at", { ascending: false }]);
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: { message: "db down" } },
    });

    await expect(listLeads({}, supabase)).rejects.toThrow(/listLeads failed: db down/);
  });

  it("returns an empty array when Supabase returns null data with no error", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: null },
    });

    await expect(listLeads({}, supabase)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/repos/leads.test.ts`
Expected: FAIL — "Cannot find module './leads'".

- [ ] **Step 3: Implement `listLeads` (no filters yet)**

```ts
// src/lib/repos/leads.ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { type Lead, LeadSchema } from "@/domain";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type ListLeadsFilter = Record<string, never>;

export async function listLeads(
  _filter: ListLeadsFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Lead[]> {
  const { data, error } = await client
    .from("leads")
    .select("*")
    .order("received_at", { ascending: false });

  if (error) {
    throw new Error(`listLeads failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown[];
  return rows.map((row) => LeadSchema.parse(row));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/repos/leads.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/leads.ts src/lib/repos/leads.test.ts
git commit -m "feat(repos): add listLeads with no-filter happy path"
```

---

## Task 8: Extend `listLeads` to support status / persona / source / limit filters

**Files:**
- Modify: `src/lib/repos/leads.ts`
- Modify: `src/lib/repos/leads.test.ts`

- [ ] **Step 1: Add failing tests for each filter**

Append to `src/lib/repos/leads.test.ts`:

```ts
describe("listLeads filters", () => {
  it("applies a status filter via .eq", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await listLeads({ status: "validated" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "status", "validated"]);
  });

  it("applies a persona filter via .eq", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await listLeads({ persona: "persona_insurance_agent" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "persona", "persona_insurance_agent"]);
  });

  it("applies a source filter via .eq", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await listLeads({ source: "website" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "source", "website"]);
  });

  it("applies a numeric limit via .limit", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await listLeads({ limit: 25 }, supabase);

    expect(supabase.calls).toContainEqual(["limit", 25]);
  });
});
```

You will also need to update the import line at the top of the test file's `listLeads` import to include the type — replace:

```ts
import { listLeads } from "./leads";
```

with:

```ts
import { listLeads, type ListLeadsFilter } from "./leads";
```

(The type is only re-exported for clarity; it's not used yet, but importing it now means future tasks won't need a separate edit.)

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm test src/lib/repos/leads.test.ts`
Expected: FAIL — the four new tests fail because the filters are not applied (the call log doesn't contain the `.eq`/`.limit` entries).

- [ ] **Step 3: Update `listLeads` to apply filters**

Replace the contents of `src/lib/repos/leads.ts` with:

```ts
// src/lib/repos/leads.ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { type Lead, LeadSchema, type LeadStatus } from "@/domain";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type ListLeadsFilter = {
  status?: LeadStatus;
  persona?: string;
  source?: string;
  limit?: number;
};

export async function listLeads(
  filter: ListLeadsFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Lead[]> {
  let query = client.from("leads").select("*");

  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.persona) {
    query = query.eq("persona", filter.persona);
  }
  if (filter.source) {
    query = query.eq("source", filter.source);
  }
  if (typeof filter.limit === "number") {
    query = query.limit(filter.limit);
  }

  const { data, error } = await query.order("received_at", { ascending: false });

  if (error) {
    throw new Error(`listLeads failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown[];
  return rows.map((row) => LeadSchema.parse(row));
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pnpm test src/lib/repos/leads.test.ts`
Expected: PASS — original three + four new filter tests, seven total green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/leads.ts src/lib/repos/leads.test.ts
git commit -m "feat(repos): add status/persona/source/limit filters to listLeads"
```

---

## Task 9: Implement `getLead`

**Files:**
- Modify: `src/lib/repos/leads.ts`
- Modify: `src/lib/repos/leads.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/repos/leads.test.ts`:

```ts
describe("getLead", () => {
  it("returns a single parsed Lead when one is found", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: validLeadRow, error: null },
    });

    const lead = await getLead(validLeadRow.id, supabase);

    expect(lead).toMatchObject({ id: validLeadRow.id, leadScore: 85 });
    expect(supabase.calls).toContainEqual(["from", "leads"]);
    expect(supabase.calls).toContainEqual(["eq", "id", validLeadRow.id]);
    expect(supabase.calls).toContainEqual(["maybeSingle"]);
  });

  it("returns null when no row is found", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: null },
    });

    await expect(getLead("missing-id", supabase)).resolves.toBeNull();
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: { message: "db down" } },
    });

    await expect(getLead("any-id", supabase)).rejects.toThrow(/getLead failed: db down/);
  });
});
```

Update the import at the top of the test file:

```ts
import { getLead, listLeads, type ListLeadsFilter } from "./leads";
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm test src/lib/repos/leads.test.ts`
Expected: FAIL — "getLead is not exported from './leads'".

- [ ] **Step 3: Implement `getLead`**

Append to `src/lib/repos/leads.ts`:

```ts
export async function getLead(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Lead | null> {
  const { data, error } = await client
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getLead failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return LeadSchema.parse(data);
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pnpm test src/lib/repos/leads.test.ts`
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/leads.ts src/lib/repos/leads.test.ts
git commit -m "feat(repos): add getLead by id"
```

---

## Task 10: Implement `countLeads`

**Files:**
- Modify: `src/lib/repos/leads.ts`
- Modify: `src/lib/repos/leads.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/repos/leads.test.ts`:

```ts
describe("countLeads", () => {
  it("returns the count value from a head select", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null, count: 42 } as unknown as Parameters<typeof createSupabaseQueryMock>[0]["leads"],
    });

    const count = await countLeads({}, supabase);

    expect(count).toBe(42);
    expect(supabase.calls).toContainEqual(["from", "leads"]);
    expect(supabase.calls).toContainEqual(["select", "*", { count: "exact", head: true }]);
  });

  it("applies a status filter", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null, count: 7 } as unknown as Parameters<typeof createSupabaseQueryMock>[0]["leads"],
    });

    await countLeads({ status: "validated" }, supabase);

    expect(supabase.calls).toContainEqual(["eq", "status", "validated"]);
  });

  it("returns 0 when count is null or missing", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await expect(countLeads({}, supabase)).resolves.toBe(0);
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: { message: "boom" } },
    });

    await expect(countLeads({}, supabase)).rejects.toThrow(/countLeads failed: boom/);
  });
});
```

The mock's `MockResponse` type doesn't include `count` today; this test casts. We'll widen the helper in Step 2 properly before relying on this.

Update the import at the top of the test file:

```ts
import { countLeads, getLead, listLeads, type ListLeadsFilter } from "./leads";
```

- [ ] **Step 2: Widen `MockResponse` to support a `count` field**

Modify `src/lib/repos/__tests__/test-helpers.ts`:

Replace the `MockResponse` type:

```ts
export type MockResponse = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};
```

No other changes needed — the helper passes the whole response object through.

- [ ] **Step 3: Run tests to verify the new countLeads tests fail**

Run: `pnpm test src/lib/repos/leads.test.ts`
Expected: FAIL — "countLeads is not exported from './leads'".

- [ ] **Step 4: Implement `countLeads`**

Append to `src/lib/repos/leads.ts`:

```ts
export async function countLeads(
  filter: ListLeadsFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<number> {
  let query = client.from("leads").select("*", { count: "exact", head: true });

  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.persona) {
    query = query.eq("persona", filter.persona);
  }
  if (filter.source) {
    query = query.eq("source", filter.source);
  }

  const { count, error } = (await query) as { count: number | null; error: { message: string } | null };

  if (error) {
    throw new Error(`countLeads failed: ${error.message}`);
  }

  return count ?? 0;
}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `pnpm test src/lib/repos/leads.test.ts`
Expected: PASS — all 14 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/repos/leads.ts src/lib/repos/leads.test.ts src/lib/repos/__tests__/test-helpers.ts
git commit -m "feat(repos): add countLeads with optional filters"
```

---

## Task 11: Add the repo barrel export

**Files:**
- Create: `src/lib/repos/index.ts`
- Create: `src/lib/repos/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/repos/index.test.ts
import { describe, expect, it } from "vitest";

import * as repos from "./index";

describe("repos barrel", () => {
  it("re-exports the lead repo functions", () => {
    expect(typeof repos.listLeads).toBe("function");
    expect(typeof repos.getLead).toBe("function");
    expect(typeof repos.countLeads).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/repos/index.test.ts`
Expected: FAIL — "Cannot find module './index'".

- [ ] **Step 3: Implement the barrel**

```ts
// src/lib/repos/index.ts
export * from "./leads";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/repos/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/index.ts src/lib/repos/index.test.ts
git commit -m "feat(repos): add barrel module"
```

---

## Task 12: Final verification — full test suite, lint, build

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all domain tests + four new domain tests + repo tests, no regressions.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: no output (clean) or only pre-existing warnings (no new ones from Phase 1A files).

- [ ] **Step 3: Run the production build**

Run: `pnpm build`
Expected: PASS — "Compiled successfully", static pages generated, no TypeScript errors.

- [ ] **Step 4: Manual sanity grep — confirm no UI page imports the new repos yet**

Run: `grep -r "from \"@/lib/repos\"" src/app || echo "no UI consumers yet (expected for Phase 1A)"`
Expected: prints `no UI consumers yet (expected for Phase 1A)`. UI wiring is Plan 1B/1C.

- [ ] **Step 5: Commit any whitespace / lockfile changes if present**

```bash
git status
# If nothing to add, skip. Otherwise:
# git add <files> && git commit -m "chore: post-Phase-1A cleanup"
```

---

## Done Definition

After all 12 tasks land:

1. A new migration file (`20260528120000_phase1_activity_routing_integrity.sql`) defines `events`, `routing_decisions`, `integrity_findings` tables, their enum types, indexes, and uniqueness constraints.
2. Four new domain modules (`events.ts`, `routing-decisions.ts`, `integrity-findings.ts`, `leads.ts`) export Zod row schemas + camelCase domain types + canonical constants.
3. `src/domain/index.ts` re-exports all four new modules.
4. `src/lib/repos/__tests__/test-helpers.ts` provides `createSupabaseQueryMock()`, the foundation for all future repo unit tests.
5. `src/lib/repos/leads.ts` exports `listLeads`, `getLead`, `countLeads` — fully unit-tested with the mock helper.
6. `src/lib/repos/index.ts` re-exports the repo functions.
7. `pnpm test` and `pnpm build` are both green.
8. No UI page imports from `@/lib/repos` yet — that's Plan 1B (other repos) and Plan 1C (page wiring).

## What Plan 1B and 1C will add (out of scope here)

- **Plan 1B:** `companies`, `contacts`, `properties`, `jobs`, `outcomes`, `events`, `routing-decisions`, `integrity-findings` repos — each follows the exact pattern established by `leads.ts` in this plan.
- **Plan 1C:** Replace `src/app/_data/growth-engine.ts` consumers page-by-page (`/data-foundation`, `/crm/*`, `/lead-ingestion`, `/loss-routing`, `/reports`, `/customer-types`) with `await listX(...)` calls from server components. Adds `Suspense` boundaries and `EmptyState` rendering.

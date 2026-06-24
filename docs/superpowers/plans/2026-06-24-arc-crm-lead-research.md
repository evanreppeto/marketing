# Arc CRM Lead Research — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Arc a live CRM write tool (`create_lead_from_research`) that creates a company + contact(s) + a leads-pipeline row from web research, or enriches blank fields on existing records — sourced from web research only, tagged `source='arc_research'`, with no approval queue.

**Architecture:** Follows the repo's layering — pure validation in `src/domain/lead-research.ts`, I/O in `src/lib/lead-research/persistence.ts`, an `arcGuard`-protected route at `src/app/api/v1/arc/crm/leads`, and an act/draft-gated agent tool in `apps/arc-runner/src/tools/crm-write.ts`. Create and enrich unify as a single dedup/upsert. No schema migration — every field already exists as a column.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Zod, Supabase (admin client), Vitest. Package manager: pnpm. Agent runner uses `@anthropic-ai/claude-agent-sdk`.

---

## Spec

See `docs/superpowers/specs/2026-06-24-arc-crm-lead-research-design.md`.

## Pre-flight

This work should be done in an isolated worktree/branch off `main` — the
`codex/premium-crm-product-ui` branch has a large uncommitted working tree. Run
all commands from the `marketing` repo root. Verify tooling:

- [ ] **Step 0: Confirm the test runner works**

Run: `pnpm test src/domain/__tests__/personas.test.ts`
Expected: PASS (sanity check that vitest + `@/` alias resolve).

---

## File Structure

- Create `src/domain/lead-research.ts` — pure validation/normalization (`parseLeadResearchInput`, types).
- Create `src/domain/__tests__/lead-research.test.ts` — domain unit tests.
- Modify `src/domain/index.ts` — re-export the new module.
- Create `src/lib/lead-research/persistence.ts` — dedup/upsert + lead insert + audit activity.
- Create `src/lib/lead-research/__tests__/persistence.test.ts` — persistence unit tests.
- Create `src/app/api/v1/arc/crm/leads/route.ts` — `POST` handler.
- Create `src/app/api/v1/arc/crm/leads/route.test.ts` — route unit test.
- Create `apps/arc-runner/src/tools/crm-write.ts` — the `create_lead_from_research` tool.
- Create `apps/arc-runner/src/tools/crm-write.test.ts` — tool unit test.
- Modify `apps/arc-runner/src/tools/index.ts` — register the write tool.
- Modify `apps/arc-runner/src/tools/index.test.ts` — add the tool to the WRITE expectations.
- Modify `apps/arc-runner/src/prompt.ts` — add the "finding leads" instruction.

---

## Task 1: Domain — validate & normalize research input

**Files:**
- Create: `src/domain/lead-research.ts`
- Modify: `src/domain/index.ts`
- Test: `src/domain/__tests__/lead-research.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/lead-research.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseLeadResearchInput } from "@/domain";

const valid = {
  persona: "persona_plumbing_partner",
  company: { name: "Acme Plumbing", website_url: "https://acme.example" },
  contacts: [{ first_name: "Dana", last_name: "Lee", title: "Owner", email: "Dana@Acme.example", phone: "(312) 555-0144" }],
  evidence: [{ url: "https://acme.example/about", note: "team page" }],
  confidence: 0.8,
};

describe("parseLeadResearchInput", () => {
  it("accepts a well-formed research lead and normalizes fields", () => {
    const result = parseLeadResearchInput(valid);
    if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
    expect(result.value.persona).toBe("persona_plumbing_partner");
    expect(result.value.company.name).toBe("Acme Plumbing");
    expect(result.value.contacts[0].email).toBe("dana@acme.example"); // lowercased
    expect(result.value.contacts[0].title).toBe("Owner");
    expect(result.value.confidence).toBe(0.8);
  });

  it("rejects unassigned_persona", () => {
    const result = parseLeadResearchInput({ ...valid, persona: "unassigned_persona" });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown persona", () => {
    const result = parseLeadResearchInput({ ...valid, persona: "persona_made_up" });
    expect(result.ok).toBe(false);
  });

  it("requires at least one source of evidence", () => {
    const result = parseLeadResearchInput({ ...valid, evidence: [] });
    expect(result.ok).toBe(false);
  });

  it("requires the company to have a name", () => {
    const result = parseLeadResearchInput({ ...valid, company: { name: "  " } });
    expect(result.ok).toBe(false);
  });

  it("requires each contact to have at least a name, email, or phone", () => {
    const result = parseLeadResearchInput({ ...valid, contacts: [{ title: "Owner" }] });
    expect(result.ok).toBe(false);
  });

  it("drops a malformed email to null rather than fabricating", () => {
    const result = parseLeadResearchInput({
      ...valid,
      contacts: [{ first_name: "Dana", email: "not-an-email" }],
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.contacts[0].email).toBeNull();
    expect(result.value.contacts[0].firstName).toBe("Dana");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/lead-research.test.ts`
Expected: FAIL — `parseLeadResearchInput` is not exported from `@/domain`.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/lead-research.ts`:

```ts
/**
 * Pure validation + normalization for Arc research-sourced CRM leads. No I/O.
 * Persistence and org-scoping live in src/lib/lead-research/. Unknown or
 * malformed contact details are coerced to null — never fabricated.
 */
import { type ParseResult } from "./interactions";
import { OFFICIAL_PERSONA_MAPPINGS, validateLeadIngestionPersona } from "./personas";

export type LeadResearchCompanyInput = {
  name: string;
  websiteUrl: string | null;
  phone: string | null;
  email: string | null;
};

export type LeadResearchContactInput = {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
};

export type LeadResearchPropertyInput = {
  streetLine1: string;
  streetLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  propertyType: string | null;
};

export type LeadResearchEvidence = { url: string; note: string | null };

export type ParsedLeadResearchInput = {
  persona: string;
  company: LeadResearchCompanyInput;
  contacts: LeadResearchContactInput[];
  property: LeadResearchPropertyInput | null;
  evidence: LeadResearchEvidence[];
  confidence: number | null;
  existingCompanyId: string | null;
  existingContactId: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strOrNull(value: unknown): string | null {
  const s = str(value);
  return s ? s : null;
}

function emailOrNull(value: unknown): string | null {
  const s = str(value).toLowerCase();
  return s && EMAIL_RE.test(s) ? s : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLeadResearchInput(
  raw: unknown,
  opts: { allowedPersonas?: readonly string[] } = {},
): ParseResult<ParsedLeadResearchInput> {
  if (!isObject(raw)) return { ok: false, error: "Request body must be an object." };

  const persona = validateLeadIngestionPersona(
    raw.persona,
    opts.allowedPersonas ?? OFFICIAL_PERSONA_MAPPINGS,
  );
  if (!persona.ok) return { ok: false, error: persona.message };

  if (!isObject(raw.company)) return { ok: false, error: "A research lead needs a company." };
  const companyName = str(raw.company.name);
  if (!companyName) return { ok: false, error: "The company needs a name." };
  const company: LeadResearchCompanyInput = {
    name: companyName,
    websiteUrl: strOrNull(raw.company.website_url),
    phone: strOrNull(raw.company.phone),
    email: emailOrNull(raw.company.email),
  };

  if (!Array.isArray(raw.contacts) || raw.contacts.length === 0) {
    return { ok: false, error: "A research lead needs at least one contact." };
  }
  const contacts: LeadResearchContactInput[] = [];
  for (const rawContact of raw.contacts) {
    if (!isObject(rawContact)) return { ok: false, error: "Each contact must be an object." };
    const contact: LeadResearchContactInput = {
      firstName: strOrNull(rawContact.first_name),
      lastName: strOrNull(rawContact.last_name),
      title: strOrNull(rawContact.title),
      email: emailOrNull(rawContact.email),
      phone: strOrNull(rawContact.phone),
    };
    if (!contact.firstName && !contact.lastName && !contact.email && !contact.phone) {
      return { ok: false, error: "Each contact needs at least a name, email, or phone." };
    }
    contacts.push(contact);
  }

  let property: LeadResearchPropertyInput | null = null;
  if (raw.property != null) {
    if (!isObject(raw.property)) return { ok: false, error: "Property must be an object." };
    const streetLine1 = str(raw.property.street_line_1);
    const city = str(raw.property.city);
    const state = str(raw.property.state);
    const postalCode = str(raw.property.postal_code);
    if (!streetLine1 || !city || state.length !== 2 || !postalCode) {
      return { ok: false, error: "A property needs street, city, 2-letter state, and postal code." };
    }
    property = {
      streetLine1,
      streetLine2: strOrNull(raw.property.street_line_2),
      city,
      state: state.toUpperCase(),
      postalCode,
      propertyType: strOrNull(raw.property.property_type),
    };
  }

  if (!Array.isArray(raw.evidence)) return { ok: false, error: "A research lead must cite its sources." };
  const evidence: LeadResearchEvidence[] = [];
  for (const rawEvidence of raw.evidence) {
    if (!isObject(rawEvidence)) continue;
    const url = str(rawEvidence.url);
    if (!url) continue;
    evidence.push({ url, note: strOrNull(rawEvidence.note) });
  }
  if (evidence.length === 0) {
    return { ok: false, error: "A research lead must cite at least one source URL." };
  }

  const confidence =
    typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1
      ? raw.confidence
      : null;

  return {
    ok: true,
    value: {
      persona: persona.persona,
      company,
      contacts,
      property,
      evidence,
      confidence,
      existingCompanyId: strOrNull(raw.existing_company_id),
      existingContactId: strOrNull(raw.existing_contact_id),
    },
  };
}
```

Then add to `src/domain/index.ts` (after the existing `export * from "./leads";` line):

```ts
export * from "./lead-research";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/lead-research.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/lead-research.ts src/domain/index.ts src/domain/__tests__/lead-research.test.ts
git commit -m "feat(lead-research): validate & normalize Arc research lead input

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Persistence — dedup/upsert company + contacts, insert lead, audit

**Files:**
- Create: `src/lib/lead-research/persistence.ts`
- Test: `src/lib/lead-research/__tests__/persistence.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/lead-research/__tests__/persistence.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedLeadResearchInput } from "@/domain";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/interactions/persistence", () => ({
  insertActivity: vi.fn(async () => ({ ok: true, id: "activity-1" })),
}));

import { insertActivity } from "@/lib/interactions/persistence";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

import { persistLeadResearch } from "../persistence";

const getSupabaseMock = vi.mocked(getSupabaseAdminClient);

function insertFor(supabase: { calls: Array<[string, ...unknown[]]> }, table: string) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < supabase.calls.length; i++) {
    const [method, arg] = supabase.calls[i];
    if (method === "from" && arg === table) {
      const next = supabase.calls[i + 1];
      if (next && next[0] === "insert") out.push(next[1] as Record<string, unknown>);
    }
  }
  return out;
}

const input: ParsedLeadResearchInput = {
  persona: "persona_plumbing_partner",
  company: { name: "Acme Plumbing", websiteUrl: "https://acme.example", phone: null, email: null },
  contacts: [{ firstName: "Dana", lastName: "Lee", title: "Owner", email: "dana@acme.example", phone: null }],
  property: null,
  evidence: [{ url: "https://acme.example/about", note: null }],
  confidence: 0.8,
  existingCompanyId: null,
  existingContactId: null,
};

beforeEach(() => {
  getSupabaseMock.mockReset();
  vi.mocked(insertActivity).mockClear();
});

describe("persistLeadResearch", () => {
  it("creates company, contact, and lead when nothing matches", async () => {
    const supabase = createSupabaseQueryMock({
      // first response = dedup select (miss); second = insert
      companies: [{ data: null, error: null }, { data: { id: "company-1" }, error: null }],
      contacts: [{ data: null, error: null }, { data: { id: "contact-1" }, error: null }],
      leads: { data: { id: "lead-1" }, error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const result = await persistLeadResearch(input, { orgId: "org-1" });

    expect(result).toEqual({
      ok: true,
      companyId: "company-1",
      contactIds: ["contact-1"],
      leadId: "lead-1",
      enriched: false,
    });
    expect(insertFor(supabase, "leads")[0]).toMatchObject({
      org_id: "org-1",
      company_id: "company-1",
      contact_id: "contact-1",
      persona: "persona_plumbing_partner",
      source: "arc_research",
      status: "needs_review",
      routing_recommendation: "target",
      loss_signals: [],
      lead_score: 0,
    });
    expect(insertFor(supabase, "companies")[0]).toMatchObject({
      name: "Acme Plumbing",
      website_url: "https://acme.example",
      org_id: "org-1",
    });
  });

  it("enriches only blank fields on a matched company without inserting a duplicate", async () => {
    const supabase = createSupabaseQueryMock({
      // dedup hit: company exists with a website already, phone is blank
      companies: { data: { id: "company-1", website_url: "https://existing.example", phone: null, email: null }, error: null },
      contacts: [{ data: null, error: null }, { data: { id: "contact-1" }, error: null }],
      leads: { data: { id: "lead-1" }, error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const withPhone: ParsedLeadResearchInput = {
      ...input,
      company: { name: "Acme Plumbing", websiteUrl: "https://acme.example", phone: "3125550100", email: null },
    };

    const result = await persistLeadResearch(withPhone, { orgId: "org-1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.enriched).toBe(true);
    // No company insert happened (dedup hit) — only an update.
    expect(insertFor(supabase, "companies")).toHaveLength(0);
    const updateCall = supabase.calls.find((c) => c[0] === "update");
    expect(updateCall?.[1]).toEqual({ phone: "3125550100" }); // website_url NOT overwritten
  });

  it("returns an error when Supabase is not configured", async () => {
    const { isSupabaseAdminConfigured } = await import("@/lib/supabase/server");
    vi.mocked(isSupabaseAdminConfigured).mockReturnValueOnce(false);
    const result = await persistLeadResearch(input, { orgId: "org-1" });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/lead-research/__tests__/persistence.test.ts`
Expected: FAIL — `../persistence` module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/lead-research/persistence.ts`:

```ts
import { type ParsedLeadResearchInput } from "@/domain";
import { insertActivity } from "@/lib/interactions/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type LeadResearchScope = { orgId: string; workspaceId?: string };

export type PersistLeadResearchResult =
  | { ok: true; companyId: string | null; contactIds: string[]; leadId: string; enriched: boolean }
  | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase is not configured, so nothing was written.";

type SupabaseClientLike = ReturnType<typeof getSupabaseAdminClient>;

/** Build a patch of only the columns that are currently blank on the existing row. */
function blankOnlyPatch(
  existing: Record<string, unknown>,
  incoming: Record<string, string | null>,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming)) {
    const current = existing[key];
    if (value != null && (current == null || current === "")) {
      patch[key] = value;
    }
  }
  return patch;
}

export async function persistLeadResearch(
  input: ParsedLeadResearchInput,
  scope: LeadResearchScope,
): Promise<PersistLeadResearchResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const supabase = getSupabaseAdminClient();
  const orgId = scope.orgId;
  const provenance = { source: "arc_research", evidence: input.evidence, confidence: input.confidence };

  try {
    let enriched = false;

    // --- Company: dedup by id or (org, name); enrich blanks or insert ---
    let companyId: string | null = null;
    const existingCompany = input.existingCompanyId
      ? await fetchById(supabase, "companies", "id, website_url, phone, email", input.existingCompanyId, orgId)
      : await fetchByName(supabase, input.company.name, orgId);

    if (existingCompany) {
      companyId = existingCompany.id as string;
      const patch = blankOnlyPatch(existingCompany, {
        website_url: input.company.websiteUrl,
        phone: input.company.phone,
        email: input.company.email,
      });
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("companies").update(patch).eq("id", companyId).eq("org_id", orgId);
        if (error) return { ok: false, error: error.message };
        enriched = true;
        await logActivity(orgId, "company", companyId, "record_updated", `Arc enriched ${input.company.name}`, provenance);
      }
    } else {
      const inserted = await insertReturningId(supabase, "companies", {
        org_id: orgId,
        name: input.company.name,
        persona: input.persona,
        website_url: input.company.websiteUrl,
        phone: input.company.phone,
        email: input.company.email,
        metadata: provenance,
      });
      if (!inserted.ok) return inserted;
      companyId = inserted.id;
      await logActivity(orgId, "company", companyId, "record_created", `Arc created ${input.company.name}`, provenance);
    }

    // --- Contacts: dedup by id or (org, email|phone); enrich blanks or insert ---
    const contactIds: string[] = [];
    for (let i = 0; i < input.contacts.length; i++) {
      const contact = input.contacts[i];
      const existing =
        i === 0 && input.existingContactId
          ? await fetchById(supabase, "contacts", "id, first_name, last_name, title, email, phone", input.existingContactId, orgId)
          : await fetchContact(supabase, contact.email, contact.phone, orgId);

      const incoming = {
        first_name: contact.firstName,
        last_name: contact.lastName,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
      };

      if (existing) {
        const contactId = existing.id as string;
        const patch = blankOnlyPatch(existing, incoming);
        if (Object.keys(patch).length > 0) {
          const { error } = await supabase.from("contacts").update(patch).eq("id", contactId).eq("org_id", orgId);
          if (error) return { ok: false, error: error.message };
          enriched = true;
          await logActivity(orgId, "contact", contactId, "record_updated", "Arc enriched contact", provenance);
        }
        contactIds.push(contactId);
      } else {
        const inserted = await insertReturningId(supabase, "contacts", {
          org_id: orgId,
          company_id: companyId,
          persona: input.persona,
          ...incoming,
          metadata: { source: "arc_research" },
        });
        if (!inserted.ok) return inserted;
        contactIds.push(inserted.id);
        await logActivity(orgId, "contact", inserted.id, "record_created", "Arc created contact", provenance);
      }
    }

    // --- Property (optional, no dedup in v1) ---
    let propertyId: string | null = null;
    if (input.property) {
      const inserted = await insertReturningId(supabase, "properties", {
        org_id: orgId,
        company_id: companyId,
        contact_id: contactIds[0] ?? null,
        persona: input.persona,
        street_line_1: input.property.streetLine1,
        street_line_2: input.property.streetLine2,
        city: input.property.city,
        state: input.property.state,
        postal_code: input.property.postalCode,
        property_type: input.property.propertyType,
        metadata: { source: "arc_research" },
      });
      if (!inserted.ok) return inserted;
      propertyId = inserted.id;
    }

    // --- Lead (always) ---
    const leadInsert = await insertReturningId(supabase, "leads", {
      org_id: orgId,
      company_id: companyId,
      contact_id: contactIds[0] ?? null,
      property_id: propertyId,
      persona: input.persona,
      status: "needs_review",
      routing_recommendation: "target",
      source: "arc_research",
      loss_signals: [],
      lead_score: 0,
      metadata: provenance,
    });
    if (!leadInsert.ok) return leadInsert;
    await logActivity(orgId, "lead", leadInsert.id, "record_created", `Arc created research lead: ${input.company.name}`, provenance);

    return { ok: true, companyId, contactIds, leadId: leadInsert.id, enriched };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to persist research lead." };
  }
}

async function fetchById(
  supabase: SupabaseClientLike,
  table: string,
  columns: string,
  id: string,
  orgId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase.from(table).select(columns).eq("id", id).eq("org_id", orgId).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function fetchByName(
  supabase: SupabaseClientLike,
  name: string,
  orgId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("companies")
    .select("id, website_url, phone, email")
    .eq("org_id", orgId)
    .ilike("name", name)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function fetchContact(
  supabase: SupabaseClientLike,
  email: string | null,
  phone: string | null,
  orgId: string,
): Promise<Record<string, unknown> | null> {
  const columns = "id, first_name, last_name, title, email, phone";
  if (email) {
    const { data } = await supabase.from("contacts").select(columns).eq("org_id", orgId).eq("email", email).maybeSingle();
    if (data) return data as Record<string, unknown>;
  }
  if (phone) {
    const { data } = await supabase.from("contacts").select(columns).eq("org_id", orgId).eq("phone", phone).maybeSingle();
    if (data) return data as Record<string, unknown>;
  }
  return null;
}

async function insertReturningId(
  supabase: SupabaseClientLike,
  table: string,
  values: Record<string, unknown>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.from(table).insert(values).select("id").single<{ id: string }>();
  if (error) return { ok: false, error: `Failed to write ${table}: ${error.message}` };
  if (!data?.id) return { ok: false, error: `Failed to write ${table}: no id returned.` };
  return { ok: true, id: data.id };
}

async function logActivity(
  orgId: string,
  entityType: "company" | "contact" | "lead",
  entityId: string,
  activityType: "record_created" | "record_updated",
  summary: string,
  provenance: Record<string, unknown>,
): Promise<void> {
  await insertActivity(
    {
      entityType,
      entityId,
      activityType,
      summary,
      actorKind: "agent",
      actorName: "Arc",
      metadata: provenance,
    },
    { orgId },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/lead-research/__tests__/persistence.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-research/persistence.ts src/lib/lead-research/__tests__/persistence.test.ts
git commit -m "feat(lead-research): dedup/upsert persistence with blank-only enrichment

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: API route — POST /api/v1/arc/crm/leads

**Files:**
- Create: `src/app/api/v1/arc/crm/leads/route.ts`
- Test: `src/app/api/v1/arc/crm/leads/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/arc/crm/leads/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/v1/arc/_lib/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/v1/arc/_lib/http")>();
  return { ...actual, arcGuard: vi.fn() };
});
vi.mock("@/lib/lead-research/persistence", () => ({ persistLeadResearch: vi.fn() }));

import { arcGuard } from "@/app/api/v1/arc/_lib/http";
import { persistLeadResearch } from "@/lib/lead-research/persistence";

import { POST } from "./route";

function post(body: unknown) {
  return new Request("http://localhost/api/v1/arc/crm/leads", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer t" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  persona: "persona_plumbing_partner",
  company: { name: "Acme Plumbing" },
  contacts: [{ email: "dana@acme.example" }],
  evidence: [{ url: "https://acme.example" }],
};

describe("POST /api/v1/arc/crm/leads", () => {
  it("persists and returns 201 with the new ids", async () => {
    vi.mocked(arcGuard).mockResolvedValue({
      ok: true,
      scope: { orgId: "org-1", workspaceId: "ws-1", source: "agent-token" },
    });
    vi.mocked(persistLeadResearch).mockResolvedValue({
      ok: true,
      companyId: "company-1",
      contactIds: ["contact-1"],
      leadId: "lead-1",
      enriched: false,
    });

    const res = await POST(post(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, leadId: "lead-1", companyId: "company-1", enriched: false });
  });

  it("returns 400 on validation failure", async () => {
    vi.mocked(arcGuard).mockResolvedValue({
      ok: true,
      scope: { orgId: "org-1", workspaceId: "ws-1", source: "agent-token" },
    });
    const res = await POST(post({ ...validBody, persona: "unassigned_persona" }));
    expect(res.status).toBe(400);
  });

  it("returns 502 when persistence fails", async () => {
    vi.mocked(arcGuard).mockResolvedValue({
      ok: true,
      scope: { orgId: "org-1", workspaceId: "ws-1", source: "agent-token" },
    });
    vi.mocked(persistLeadResearch).mockResolvedValue({ ok: false, error: "db down" });
    const res = await POST(post(validBody));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/v1/arc/crm/leads/route.test.ts`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/api/v1/arc/crm/leads/route.ts`:

```ts
import { arcGuard, fail, INVALID_JSON, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { parseLeadResearchInput } from "@/domain";
import { persistLeadResearch } from "@/lib/lead-research/persistence";

/**
 * Lets Arc create a CRM lead from web research: a company, its contact(s), and a
 * leads-pipeline row — or enrich blank fields on records that already match.
 * Writes live, tagged source="arc_research". No outbound side effects.
 *
 *   POST /api/v1/arc/crm/leads
 *   { persona, company:{name,...}, contacts:[...], evidence:[{url}], ... }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  const scope = { orgId: allowed.scope.orgId, workspaceId: allowed.scope.workspaceId };

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }

  const parsed = parseLeadResearchInput(body);
  if (!parsed.ok) return fail("invalid_request", parsed.error, 400);

  try {
    const result = await persistLeadResearch(parsed.value, scope);
    if (!result.ok) return fail("failed", result.error, 502);
    return ok(
      {
        companyId: result.companyId,
        contactIds: result.contactIds,
        leadId: result.leadId,
        enriched: result.enriched,
      },
      201,
    );
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to write research lead.", 502);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/api/v1/arc/crm/leads/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/arc/crm/leads/route.ts src/app/api/v1/arc/crm/leads/route.test.ts
git commit -m "feat(lead-research): POST /api/v1/arc/crm/leads route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Arc tool — create_lead_from_research (act/draft)

**Files:**
- Create: `apps/arc-runner/src/tools/crm-write.ts`
- Modify: `apps/arc-runner/src/tools/index.ts`
- Test: `apps/arc-runner/src/tools/crm-write.test.ts`, `apps/arc-runner/src/tools/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/arc-runner/src/tools/crm-write.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "../arc-client";
import { crmWriteTools } from "./crm-write";

const noStep = async () => {};
type HandlerResult = { content: Array<{ type: string; text: string }> };

function byName(client: ArcClient) {
  return Object.fromEntries(crmWriteTools(client, noStep).map((t) => [t.name, t]));
}
function callHandler(tool: { handler: unknown }, args: Record<string, unknown>): Promise<HandlerResult> {
  return (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
}

describe("crmWriteTools", () => {
  it("create_lead_from_research posts the payload to the leads route", async () => {
    const client = {
      apiPost: vi.fn(async () => ({ ok: true, leadId: "lead-1", companyId: "company-1", contactIds: ["contact-1"], enriched: false })),
    } as unknown as ArcClient;
    const tools = byName(client);
    const args = {
      persona: "persona_plumbing_partner",
      company: { name: "Acme Plumbing" },
      contacts: [{ email: "dana@acme.example" }],
      evidence: [{ url: "https://acme.example" }],
    };
    const res = await callHandler(tools["create_lead_from_research"], args);
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/crm/leads", { ...args, author_name: "Arc" });
    expect(res.content[0].text).toContain("lead-1");
  });

  it("exposes exactly the one write tool", () => {
    const names = crmWriteTools({} as ArcClient, noStep).map((t) => t.name);
    expect(names).toEqual(["create_lead_from_research"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/arc-runner/src/tools/crm-write.test.ts`
Expected: FAIL — `./crm-write` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/arc-runner/src/tools/crm-write.ts`:

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * CRM core-record write tool (act/draft modes only). Creates a lead from web
 * research — a company, its contact(s), and a leads-pipeline row — or enriches
 * blank fields on records that already match. Writes live, tagged
 * source="arc_research". Only ever pass fields found in a real source; never
 * invent an email or phone. Does not contact anyone.
 */
export function crmWriteTools(client: ArcClient, step: StepFn) {
  const createLeadFromResearch = tool(
    "create_lead_from_research",
    "Create a CRM lead from web research: a company, its contact(s), and a leads-pipeline row. Re-uses an existing company/contact when one matches, filling only blank fields. Only pass fields you found in a real source — never invent an email or phone. Writes live (no approval needed for CRM records) and tags everything source=arc_research. Does not contact anyone.",
    {
      persona: z
        .string()
        .describe("Best-fit persona key for this lead, e.g. persona_plumbing_partner. Must be one of the org's personas."),
      company: z.object({
        name: z.string(),
        website_url: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
      }),
      contacts: z
        .array(
          z.object({
            first_name: z.string().optional(),
            last_name: z.string().optional(),
            title: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
          }),
        )
        .min(1),
      property: z
        .object({
          street_line_1: z.string(),
          street_line_2: z.string().optional(),
          city: z.string(),
          state: z.string(),
          postal_code: z.string(),
          property_type: z.string().optional(),
        })
        .optional(),
      evidence: z
        .array(z.object({ url: z.string(), note: z.string().optional() }))
        .min(1)
        .describe("The sources you actually read. Required — never create a lead you can't cite."),
      confidence: z.number().min(0).max(1).optional(),
      existing_company_id: z.string().optional().describe("Set to enrich a company you already found via search_companies."),
      existing_contact_id: z.string().optional().describe("Set to enrich a contact you already found via search_contacts."),
    },
    async (args) =>
      runTool(step, `Creating lead from research: ${args.company.name}`, async () => {
        return client.apiPost<{
          companyId: string | null;
          contactIds: string[];
          leadId: string;
          enriched: boolean;
        }>("/api/v1/arc/crm/leads", { ...args, author_name: "Arc" });
      }),
  );

  return [createLeadFromResearch];
}
```

Modify `apps/arc-runner/src/tools/index.ts`: add the import near the other tool imports (after line 7, the `interactions` import):

```ts
import { crmWriteTools } from "./crm-write";
```

And update the `writeTools` function (currently lines 35-38) to include it:

```ts
/** Append-only writes + research lead creation: CRM interactions + brain observations + create_lead_from_research. act/draft only. */
function writeTools(client: ArcClient, step: StepFn) {
  return [...brainWriteTools(client, step), ...interactionWriteTools(client, step), ...crmWriteTools(client, step)];
}
```

- [ ] **Step 4: Update the mode-gating test**

Modify `apps/arc-runner/src/tools/index.test.ts` — add the new tool to the `WRITE` array (line 41):

```ts
const WRITE = ["record_brain_note", "link_brain_nodes", "log_interaction", "create_lead_from_research"];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test apps/arc-runner/src/tools/crm-write.test.ts apps/arc-runner/src/tools/index.test.ts`
Expected: PASS (crm-write: 2 tests; index: all mode-gating tests, now including the new write tool in act/draft and excluded from ask).

- [ ] **Step 6: Commit**

```bash
git add apps/arc-runner/src/tools/crm-write.ts apps/arc-runner/src/tools/crm-write.test.ts apps/arc-runner/src/tools/index.ts apps/arc-runner/src/tools/index.test.ts
git commit -m "feat(arc): create_lead_from_research write tool (act/draft)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Arc prompt — teach the finding-leads workflow

**Files:**
- Modify: `apps/arc-runner/src/prompt.ts`

No test (prompt is plain copy). The change updates the stale "never editing core CRM records" clause and adds a workflow paragraph.

- [ ] **Step 1: Update the Tools paragraph**

In `apps/arc-runner/src/prompt.ts`, find the sentence in the Tools paragraph (line 15) that reads:

```
In act/draft mode you can also log CRM interactions (notes, follow-up tasks, timeline activity) on existing records and record learnings/signals to the brain — never editing core CRM records and never contacting anyone.
```

Replace it with:

```
In act/draft mode you can also log CRM interactions (notes, follow-up tasks, timeline activity) on existing records, record learnings/signals to the brain, and create new CRM leads from research (create_lead_from_research) — always tagged source=arc_research, and never contacting anyone.
```

- [ ] **Step 2: Add the finding-leads paragraph**

In `apps/arc-runner/src/prompt.ts`, add this as a new paragraph immediately after the paragraph that ends `...before recommending or drafting.` (line 17, the `list_opportunities` paragraph). Keep it inside the template literal:

```
Finding leads: when the operator asks you to find leads, partners, or prospects, ALWAYS research first with research_web and read real sources before writing anything. Then call create_lead_from_research once per prospect to create the company, its contact(s), and a leads-pipeline row — or to enrich a record you already found (pass existing_company_id / existing_contact_id, or just the same name/email/phone and it will match and fill only blank fields). Assign the best-fit persona. Only write fields you actually found in a source — never invent an email, phone, or title; leave unknowns out. Always pass the evidence URLs you read and a confidence. These records are written live (no approval step for CRM records); approval still gates anything outbound. After creating leads, emit a result card linking the new records and cite_sources with the evidence you used.
```

- [ ] **Step 3: Verify the runner still type-checks / builds**

Run: `pnpm --filter ./apps/arc-runner test apps/arc-runner/src/tools/index.test.ts`
Expected: PASS (no syntax error introduced into the prompt module; the template literal still closes correctly). If the runner has its own lint/build, also run `pnpm lint` at the repo root.

- [ ] **Step 4: Commit**

```bash
git add apps/arc-runner/src/prompt.ts
git commit -m "feat(arc): prompt Arc to research-then-create leads with honest fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the full test suite for the touched areas**

Run: `pnpm test src/domain/__tests__/lead-research.test.ts src/lib/lead-research/__tests__/persistence.test.ts src/app/api/v1/arc/crm/leads/route.test.ts apps/arc-runner/src/tools/crm-write.test.ts apps/arc-runner/src/tools/index.test.ts`
Expected: ALL PASS.

- [ ] **Type-check / lint**

Run: `pnpm lint`
Expected: no new errors in the created/modified files.

- [ ] **Manual smoke (optional, requires Supabase + ARC_AGENT_API_TOKEN configured)**

```bash
curl -sS -X POST "$APP_BASE_URL/api/v1/arc/crm/leads" \
  -H "authorization: Bearer $ARC_AGENT_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{"persona":"persona_plumbing_partner","company":{"name":"Test Plumbing Co","website_url":"https://test.example"},"contacts":[{"first_name":"Pat","title":"Owner","email":"pat@test.example"}],"evidence":[{"url":"https://test.example/about"}]}'
```
Expected: `201` with `{ ok:true, status:"ok", leadId, companyId, contactIds, enriched:false }`. Re-running the same payload should return `enriched:true` (or unchanged) and NOT create a duplicate company/contact.

---

## Notes for the implementer

- **DRY:** reuse `validateLeadIngestionPersona` (personas), `ParseResult` (interactions), `insertActivity` (interactions persistence), and `createSupabaseQueryMock` (repo test helper). Don't hand-roll equivalents.
- **No fabrication:** the honesty rule (unknown fields → null, never invented) lives in two places by design — domain validation (`emailOrNull`) and the prompt. Keep both.
- **Activity types are an enum.** Only `record_created` / `record_updated` are valid here; provenance goes in `metadata`, not in a custom `activity_type`.
- **Lead status default** is `needs_review`. If the operator prefers `new`, change the single literal in `persistLeadResearch`.
- **Per-org personas (deliberate v1 scope):** the route calls `parseLeadResearchInput(body)` without per-org allowed keys, so it validates against the 12 `OFFICIAL_PERSONA_MAPPINGS`. The spec allows this fallback ("where available, falling back to"). `parseLeadResearchInput` already accepts `opts.allowedPersonas` — when an org adds custom personas, load them (`src/lib/personas/read-model.ts`) in the route and pass them through. Out of scope here; do not block on it.
- **Phone is stored as provided (v1).** No phone normalization, so contact dedup-by-phone is an exact-string match. Email dedup is normalized (lowercased). If duplicate contacts from differing phone formats become a problem, add a normalizer in `lead-research.ts` and reuse it in `fetchContact`.

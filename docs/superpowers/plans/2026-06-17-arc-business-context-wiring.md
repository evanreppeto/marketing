# Arc Business-Context Wiring — Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Arc's generated copy and guardrails read from the per-org Brand Kit (`getBusinessContext`) instead of hardcoded "Big Shoulders Restoration" / water-loss values — so Arc speaks as whatever business the org configured, while preserving BSR's current behavior via its seeded Brand Kit.

**Architecture:** Thread an `ArcBusinessContext` (from Plan 1's `getBusinessContext(orgId)`) into the orchestrators, which pass it to `createPartnerCampaignDraft` and into the guardrail check. `draft-engine` builds copy from `context.businessName`/`services`/`tone`/offer. `guardrails` becomes industry-agnostic: a universal baseline (human-review + outbound-locked, always) plus blocking on the org's `bannedPhrases`; `disallowedClaims`/`complianceNotes` surface as review context. BSR's insurance phrases move into its seeded `banned_phrases` so its guardrail behavior is unchanged.

**Tech Stack:** Next.js 16, TypeScript, Supabase, Vitest, pnpm.

**Source spec:** `docs/superpowers/specs/2026-06-16-business-profile-brand-kit-design.md` (§4). Builds on Plan 1 (`getBusinessContext`, `ArcBusinessContext`).

**Approved scope decisions (2026-06-17):**
- Guardrails: drive from Brand Kit + keep universal baseline (no hardcoded-insurance fallback). BSR's insurance phrases get seeded into `banned_phrases`.
- `restorationFocus`: **left as-is** (BSR campaign metadata). Plan 2 removes hardcoded business *identity* only; genericizing the `restorationFocus` enum + its ~16 UI consumers is deferred.
- The current restoration-specific **off-scope-loss** guardrail (hail-only/wind-only on `lossSignals`) is **removed** from the copy guardrail — it's lead-qualification, not copy compliance, and restoration-specific. Flagged behavior change for BSR (see Task 2).

---

## File Structure

| File | Change |
|------|--------|
| `src/lib/arc/guardrails.ts` | Rewrite `checkArcGeneratedCopy` to take `bannedPhrases` + `complianceNotes`; universal baseline + banned-phrase blocking; drop hardcoded insurance/off-scope regex |
| `src/lib/arc/guardrails.test.ts` | Rewrite tests for the new signature/behavior |
| `src/lib/arc/draft-engine.ts` | `createPartnerCampaignDraft(request, context)`; replace all hardcoded BSR/water strings with `context` values; pass `context.bannedPhrases` to the guardrail |
| `src/lib/arc/orchestrator.ts` | `runArcPartnerCampaign(input, client, context?)`; default-resolve `context` via `getBusinessContext(getCurrentOrgId())`; pass to draft |
| `src/lib/arc/orchestrator.test.ts` | Inject a test `ArcBusinessContext` so no DB/org lookup is needed |
| `src/lib/arc/social-ad-orchestrator.ts` | Same context-threading + de-hardcode (mirror partner pattern) |
| `src/lib/arc/social-ad-orchestrator.test.ts` | Inject test context |
| `scripts/seed-bsr-brand-kit.mjs` | Add BSR `banned_phrases` (insurance phrases) so guardrail behavior is preserved |

No contract/schema changes (`orgId` stays an app-layer concern; `restorationFocus` unchanged).

---

## Task 1: Rewrite the guardrail engine (industry-agnostic)

**Files:** `src/lib/arc/guardrails.ts`, `src/lib/arc/guardrails.test.ts`

- [ ] **Step 1: Rewrite the tests** — replace the entire body of `src/lib/arc/guardrails.test.ts` with:

```ts
import { describe, expect, it } from "vitest";

import { checkArcGeneratedCopy } from "./guardrails";

describe("checkArcGeneratedCopy", () => {
  it("always applies the universal baseline (human review + outbound locked)", () => {
    const result = checkArcGeneratedCopy({ draftOutput: "Hello from Acme Co. Want to chat?" });
    expect(result.riskLevel).toBe("low");
    expect(result.approvalStatus).toBe("pending_owner_approval");
    expect(result.blockedPhrases).toEqual([]);
    expect(result.flags).toContain("Human review required");
    expect(result.flags).toContain("Outbound locked until approved");
  });

  it("blocks copy that contains one of the org's banned phrases (case-insensitive)", () => {
    const result = checkArcGeneratedCopy({
      draftOutput: "We guarantee your INSURANCE WILL COVER the claim.",
      bannedPhrases: ["insurance will cover", "we guarantee"],
      complianceNotes: "Coverage-neutral language required.",
    });
    expect(result.riskLevel).toBe("blocked");
    expect(result.approvalStatus).toBe("needs_compliance");
    expect(result.blockedPhrases).toContain("insurance will cover");
    expect(result.blockedPhrases).toContain("we guarantee");
    expect(result.complianceNotes).toBe("Coverage-neutral language required.");
  });

  it("ignores empty/whitespace banned phrases and passes clean copy", () => {
    const result = checkArcGeneratedCopy({
      draftOutput: "A friendly note from Acme.",
      bannedPhrases: ["", "   "],
    });
    expect(result.riskLevel).toBe("low");
    expect(result.blockedPhrases).toEqual([]);
    expect(result.flags).toContain("No banned phrase detected");
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL** (`pnpm test src/lib/arc/guardrails.test.ts`): the current signature uses `restorationFocus`/`lossSignals`, so the new expectations fail.

- [ ] **Step 3: Replace the entire body of `src/lib/arc/guardrails.ts` with:**

```ts
export type ArcRiskLevel = "low" | "medium" | "high" | "blocked";

export type ArcGuardrailResult = {
  riskLevel: ArcRiskLevel;
  approvalStatus: "needs_compliance" | "pending_owner_approval";
  complianceNotes: string;
  flags: string[];
  blockedPhrases: string[];
};

/**
 * Industry-agnostic guardrail check for Arc-generated copy.
 *
 * Two non-negotiable baseline flags are ALWAYS applied (human review + outbound
 * locked) — Arc never sends without human approval. Beyond that, copy is blocked
 * only when it contains one of the org's configured banned phrases (from the
 * Brand Kit). Business-specific rules (e.g. BSR's insurance-claim phrases) live
 * in that per-org list, not in this engine.
 */
export function checkArcGeneratedCopy(input: {
  draftOutput: string;
  bannedPhrases?: string[];
  complianceNotes?: string;
}): ArcGuardrailResult {
  const haystack = input.draftOutput.toLowerCase();
  const blockedPhrases = (input.bannedPhrases ?? [])
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0 && haystack.includes(phrase.toLowerCase()));

  const flags = new Set<string>(["Human review required", "Outbound locked until approved"]);

  if (blockedPhrases.length > 0) {
    flags.add("Banned phrase detected");
    return {
      riskLevel: "blocked",
      approvalStatus: "needs_compliance",
      complianceNotes:
        input.complianceNotes ?? "Blocked by guardrails: contains disallowed language. Rewrite before owner approval.",
      flags: [...flags],
      blockedPhrases,
    };
  }

  flags.add("No banned phrase detected");
  return {
    riskLevel: "low",
    approvalStatus: "pending_owner_approval",
    complianceNotes: input.complianceNotes ?? "Review before outbound. No disallowed language detected.",
    flags: [...flags],
    blockedPhrases: [],
  };
}
```

- [ ] **Step 4: Run the tests — expect PASS** (`pnpm test src/lib/arc/guardrails.test.ts`).

- [ ] **Step 5: Commit**
```bash
git add src/lib/arc/guardrails.ts src/lib/arc/guardrails.test.ts
git commit -m "feat(arc): industry-agnostic guardrails driven by Brand Kit banned phrases"
```

> Note: `blockedPhrases` now contains the actual matched phrases (not the old label strings). The orchestrator stores it in `audit_payload.blocked_phrases` — still a `string[]`, so no downstream type change.

---

## Task 2: Thread business context into the draft engine

**Files:** `src/lib/arc/draft-engine.ts`

This task changes a pure function's signature (`createPartnerCampaignDraft(request)` → `(request, context)`) and removes hardcoded identity. No standalone unit test exists for draft-engine; it's covered via `orchestrator.test.ts` (Task 4). Verification here is `tsc` (it will fail until Task 3 updates the caller — that's expected and noted).

- [ ] **Step 1: Edit `src/lib/arc/draft-engine.ts`.** Add the import at the top:
```ts
import { type ArcBusinessContext } from "@/domain";
```

- [ ] **Step 2: Change the signature and identity-derived values.** Replace the function header and the `audienceSummary`/`offerSummary`/guardrail call region (the current lines ~20–36) so it reads:

```ts
export function createPartnerCampaignDraft(
  request: ArcPartnerCampaignRequest,
  context: ArcBusinessContext,
): ArcDraftPackage {
  const companyName = request.company.name;
  const firstName = request.contact.firstName;
  const businessName = context.businessName;
  const servicesPhrase =
    context.services.length > 0 ? context.services.join(", ") : "the services you need";
  const campaignName =
    request.campaign.name ?? `${humanizePersona(request.persona)} Referral Outreach - ${companyName}`;
  const audienceSummary =
    request.campaign.audienceSummary ??
    `${companyName} decision makers who may need ${servicesPhrase}.`;
  const offerSummary =
    request.campaign.offerSummary ?? `A simple handoff lane with ${servicesPhrase}.`;
  const draftOutput = buildDraftOutput({ request, firstName, businessName, offerSummary, servicesPhrase });
  const guardrails = checkArcGeneratedCopy({
    draftOutput,
    bannedPhrases: context.bannedPhrases,
    complianceNotes: context.guardrails.complianceNotes,
  });
```

- [ ] **Step 3: Replace the `recommendedAction` and `personaSummary`** (currently hardcode "BSR" / "water-loss") with neutral, context-driven text:
```ts
    personaSummary: `${companyName} is a ${humanizePersona(request.persona)} candidate for ${businessName}.`,
    recommendedAction:
      `Review the lead fit and edit/approve the draft if the message matches ${businessName}'s voice.`,
```
(Leave the rest of the returned object — `promptInput`, `promptInputs`, `reasoningPayload`, etc. — as-is; the `guardrail_summary`/`Guardrail:` lines may keep their generic wording.)

- [ ] **Step 4: Rewrite `buildDraftOutput`** to use `businessName`/`offerSummary`/`servicesPhrase` instead of the hardcoded BSR/water copy. Replace the whole function with:

```ts
function buildDraftOutput(input: {
  request: ArcPartnerCampaignRequest;
  firstName: string;
  businessName: string;
  offerSummary: string;
  servicesPhrase: string;
}) {
  const { request, firstName, businessName, offerSummary, servicesPhrase } = input;
  const cta = request.campaign.cta.toLowerCase();

  if (request.channel === "sms") {
    return [
      `Hi ${firstName}, this is ${businessName}.`,
      `When your customers need help, we can support with ${servicesPhrase}.`,
      `Would it be useful to ${cta}?`,
    ].join(" ");
  }

  if (request.channel === "call_script") {
    return [
      `Opening: Hi ${firstName}, this is ${businessName} calling about a simple handoff process for your customers.`,
      "",
      `Context: When your customers need ${servicesPhrase}, our team can help while respecting the relationship you already earned.`,
      "",
      `Ask: Would it be useful to ${cta}?`,
    ].join("\n");
  }

  return [
    `Subject: A simple handoff lane with ${businessName}`,
    "",
    `Hi ${firstName},`,
    "",
    `When your customers need help, ${businessName} can support with ${servicesPhrase} — protecting the relationship you already earned.`,
    "",
    offerSummary,
    "",
    `Would it be useful to ${cta}?`,
    "",
    "Best,",
    businessName,
  ].join("\n");
}
```

- [ ] **Step 5: Verify** `npx eslint src/lib/arc/draft-engine.ts` is clean. (`npx tsc --noEmit` will report an error at the `createPartnerCampaignDraft(request)` call site in `orchestrator.ts` — EXPECTED; fixed in Task 3. Do not "fix" it here.)

- [ ] **Step 6: Commit**
```bash
git add src/lib/arc/draft-engine.ts
git commit -m "feat(arc): draft engine builds copy from Brand Kit business context"
```

---

## Task 3: Resolve & thread context through the orchestrator

**Files:** `src/lib/arc/orchestrator.ts`

- [ ] **Step 1: Add imports** at the top of `src/lib/arc/orchestrator.ts`:
```ts
import { type ArcBusinessContext } from "@/domain";
import { getBusinessContext } from "../brand-kit/read-model";
import { getCurrentOrgId } from "../auth/org";
```

- [ ] **Step 2: Add an optional `context` param and resolve it.** Change the function signature and the first lines of the body:
```ts
export async function runArcPartnerCampaign(
  input: unknown = {},
  client: SupabaseClient = getSupabaseAdminClient(),
  context?: ArcBusinessContext,
): Promise<ArcRunResult> {
  const request = parseArcPartnerCampaignRequest(input);
  const businessContext = context ?? (await getBusinessContext(await getCurrentOrgId()));
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const startedAt = new Date().toISOString();
  const agentId = await upsertArcAgent(client);
  const draft = createPartnerCampaignDraft(request, businessContext);
```
(The optional `context` param keeps the existing `(input, client)` call sites working and lets tests inject a context without a DB/org lookup.)

- [ ] **Step 3: Verify** `npx tsc --noEmit` is now clean (Task 2's call site is satisfied), and `npx eslint src/lib/arc/orchestrator.ts` is clean.

- [ ] **Step 4: Commit**
```bash
git add src/lib/arc/orchestrator.ts
git commit -m "feat(arc): resolve per-org business context in partner orchestrator"
```

> The API route `src/app/api/v1/arc/runs/route.ts` needs NO change: the orchestrator self-resolves `getCurrentOrgId()` (the route already guards `isSupabaseAdminConfigured()`).

---

## Task 4: Update the partner orchestrator test to inject context

**Files:** `src/lib/arc/orchestrator.test.ts`

- [ ] **Step 1: Read** `src/lib/arc/orchestrator.test.ts` to see how it builds the mock `client` and calls `runArcPartnerCampaign`.

- [ ] **Step 2: Inject a minimal test context** so the test never calls `getCurrentOrgId()`/`getBusinessContext` (which would hit Supabase). Add a constant near the top of the test file:
```ts
import { type ArcBusinessContext } from "@/domain";

const TEST_CONTEXT: ArcBusinessContext = {
  businessName: "Big Shoulders Restoration",
  industry: "home_property_services",
  services: ["Water mitigation", "Documentation", "Rebuild coordination"],
  tone: "reassuring",
  voiceGuidance: null,
  preferredPhrases: [],
  bannedPhrases: ["insurance will cover", "claim will be approved", "we guarantee"],
  proofPoints: [],
  personas: [],
  guardrails: { disallowedClaims: [], complianceNotes: "Coverage-neutral language required." },
};
```
Then update every `runArcPartnerCampaign(<input>, <client>)` call in the file to `runArcPartnerCampaign(<input>, <client>, TEST_CONTEXT)`.

- [ ] **Step 3: Adjust any assertion** that depended on the old hardcoded copy or old `blockedPhrases` label strings. If an assertion checks generated `draft_body`/copy text, update it to the new context-driven wording (e.g. expect it to contain "Big Shoulders Restoration" via `TEST_CONTEXT.businessName`, which still holds for this test). If an assertion checks `blocked_phrases` values, update to the new matched-phrase form.

- [ ] **Step 4: Run** `pnpm test src/lib/arc/orchestrator.test.ts` — expect PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/arc/orchestrator.test.ts
git commit -m "test(arc): inject business context into partner orchestrator test"
```

---

## Task 5: Apply the same wiring to the social-ad orchestrator

**Files:** `src/lib/arc/social-ad-orchestrator.ts`, `src/lib/arc/social-ad-orchestrator.test.ts`

- [ ] **Step 1: Read** both `src/lib/arc/social-ad-orchestrator.ts` and its test to learn the entry signature (`runArcSocialAd(input, client, upload)`) and how it generates/guards copy and what it persists.

- [ ] **Step 2: Thread context** the same way as Task 3: add an optional `context?: ArcBusinessContext` parameter (after the existing params), resolve it with `context ?? (await getBusinessContext(await getCurrentOrgId()))`, and use `context.businessName`/`services`/`bannedPhrases`/`guardrails.complianceNotes` wherever the file currently hardcodes "Big Shoulders Restoration", water-loss copy, or calls `checkArcGeneratedCopy`. If it calls `checkArcGeneratedCopy`, update the call to the new `{ draftOutput, bannedPhrases, complianceNotes }` signature. Leave `restorationFocus`/`req.restorationFocus` persistence as-is (deferred per scope).

- [ ] **Step 3: Update the test** to inject `TEST_CONTEXT` (same shape as Task 4) into `runArcSocialAd`, and fix any copy/`blockedPhrases` assertions to the new behavior.

- [ ] **Step 4: Verify** `pnpm test src/lib/arc/social-ad-orchestrator.test.ts` passes; `npx tsc --noEmit` clean; `npx eslint src/lib/arc/social-ad-orchestrator.ts` clean.

- [ ] **Step 5: Commit**
```bash
git add src/lib/arc/social-ad-orchestrator.ts src/lib/arc/social-ad-orchestrator.test.ts
git commit -m "feat(arc): wire business context into social-ad orchestrator"
```

> If reading the file reveals it does NOT call `checkArcGeneratedCopy` or generate identity copy (e.g. it only persists images), keep the change minimal: thread context only where identity strings actually appear, and report DONE_WITH_CONCERNS describing what was/wasn't applicable.

---

## Task 6: Seed BSR's banned phrases (preserve guardrail behavior)

**Files:** `scripts/seed-bsr-brand-kit.mjs`

The new guardrail blocks only on `banned_phrases`. BSR's old insurance regex must become seeded phrases or BSR loses that protection.

- [ ] **Step 1: Add `banned_phrases` to the seeded `profile` object** in `scripts/seed-bsr-brand-kit.mjs` (alongside `services`, `guardrails`, etc.):
```js
  banned_phrases: [
    "insurance will cover",
    "insurance will pay",
    "insurance will approve",
    "claim will be approved",
    "guaranteed payout",
    "guaranteed coverage",
    "guaranteed approval",
    "we guarantee",
  ],
```

- [ ] **Step 2: Verify** `node --check scripts/seed-bsr-brand-kit.mjs` is valid.

- [ ] **Step 3: Commit**
```bash
git add scripts/seed-bsr-brand-kit.mjs
git commit -m "feat(brand-kit): seed BSR banned phrases to preserve guardrail behavior"
```

> **Operator step (post-merge, prod):** re-run `pnpm seed:brand-kit-bsr` (idempotent upsert on `org_id`) so prod's BSR profile gets `banned_phrases`. Until then, prod Arc copy won't block insurance language. (Alternatively a one-line `update public.business_profiles set banned_phrases = '[...]'::jsonb where org_id = (select id from organizations where slug='big-shoulders-restoration');` — the plan author will provide it at merge time.)

---

## Task 7: Full verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `pnpm test` → full suite green (no regressions).
- [ ] **Step 3:** `npx eslint` on every file this plan touched → clean.
- [ ] **Step 4:** Grep guard — confirm no hardcoded identity remains in the Arc runtime:
  - `grep -rni "big shoulders" src/lib/arc/` → expect **no matches** (the only allowed occurrence is in test fixtures via `TEST_CONTEXT`, which is fine).
  - Confirm `src/lib/arc/draft-engine.ts` and `guardrails.ts` contain no literal "water"/"insurance"/"restoration" business copy.
- [ ] **Step 5: Commit** any final fixups.

---

## Done criteria for Plan 2
- Arc's partner + social-ad runtimes resolve `getBusinessContext(getCurrentOrgId())` and build copy from it; no hardcoded "Big Shoulders Restoration"/water-loss strings remain in `src/lib/arc/` (outside test fixtures).
- Guardrails are industry-agnostic: universal baseline always; blocking driven by the org's `banned_phrases`; `complianceNotes` surfaced. BSR behavior preserved via seeded `banned_phrases`.
- `restorationFocus` left intact (deferred).
- `pnpm test`, `tsc`, eslint all green.

**Operator follow-up:** re-run `pnpm seed:brand-kit-bsr` against prod so BSR's `banned_phrases` populate.

**Next:** Plan 3 — onboarding wizard + per-org branding in Settings (and, separately, the deferred `restorationFocus` genericization + persona enum relaxation at the v2 cutover).

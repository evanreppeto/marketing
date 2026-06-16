# Business Profile / Brand Kit + Onboarding — Design

**Date:** 2026-06-16
**Status:** Approved design, pre-implementation
**Topic:** Make the app industry-agnostic and tailorable per business. Introduce a per-org Business Profile ("Brand Kit") that defines who a business is, an onboarding wizard that captures it, and wire Arc + branding to read from it.

---

## 1. Goal & Context

### Product goal
Turn this single-tenant, restoration-hardcoded app into a **broad, industry-agnostic marketing OS** that many businesses can tailor to their own brand, services, voice, personas, and guardrails — and that the Arc agent operates from. The long-term target is self-serve SaaS ("serve the masses").

### This project's slice
**Business Profile / Brand Kit + onboarding wizard, with Arc and branding reading from it.** Real self-serve signup/auth, hard data isolation, and billing are deferred to later sub-projects (see §8).

### Guiding principles (non-negotiable, from CLAUDE.md)
- **The product is industry-agnostic.** No restoration logic anywhere in the runtime. Restoration survives only as (a) one optional template flavor and (b) a one-time data seed for the existing BSR org.
- **Agent drafts, human approves, database remembers.** Arc may *draft* a Brand Kit from a URL/description, but nothing is saved or sent without explicit human approval. This project adds **no outbound behavior**.
- **Layering:** `src/domain/` (pure, no I/O) → `src/lib/<feature>/` (I/O, persistence, read-models) → `src/app/<route>/` (views + actions). Persistence gated by `requireOperator()` + `isSupabaseAdminConfigured()`, org-scoped via `getCurrentOrgId()`, following the vault/campaigns reference shape.
- **Graceful degradation:** without Supabase/Arc configured, templates still work and Arc falls back to a neutral context so dev keeps running.

### Current state (what we're replacing)
- DB is multi-tenant-ready: `organizations` table (with unused `branding` jsonb), all CRM tables scoped by `org_id`. `getCurrentOrgId()` resolves a single hardcoded slug.
- Branding (logo, names, accent, density, motion) is operator-configurable but **global** (`app_settings`), not per-org.
- **Hardcoded to BSR/restoration:** 12 personas (`OFFICIAL_PERSONA_MAPPINGS` + `persona_mapping` Postgres enum + `leads_persona_not_unassigned_check`); loss types (`RESTORATION_FOCUS_VALUES`); Arc draft copy ("Hi, this is Big Shoulders Restoration…") in `draft-engine.ts`; guardrail blocked phrases (insurance claims) in `guardrails.ts`.

---

## 2. Architecture Overview

```
src/domain/brand-kit.ts            (pure: validation, defaults, template library, Arc-context assembly) + __tests__
        │
src/lib/brand-kit/
   ├── persistence.ts              (read/write business_profiles + persona_definitions, org-scoped)
   └── read-model.ts               (getBusinessContext(orgId) → bundle for Arc + UI)
        │
src/app/onboarding/                (guided wizard: server components + "use server" actions)
src/app/settings/                  (Brand Kit editor section; re-points existing branding/appearance controls at org profile)
        │
src/lib/arc/{draft-engine,guardrails,orchestrator,social-ad-orchestrator}.ts
                                   (consume the context bundle; restoration removed from code)

supabase/migrations/<ts>_business_profiles_and_personas.sql
                                   (business_profiles, persona_definitions, persona enum relaxation)
scripts/                           (one-time seed of existing BSR org profile)
```

---

## 3. Data Model (Section A — approved)

New `supabase/migrations/` file (timestamp-prefixed; do not edit shipped migrations).

### 3.1 `business_profiles` (one row per org — the Brand Kit)
- `org_id` (FK → organizations, **unique**)
- **Identity:** `display_name`, `legal_name`, `tagline`, `description`, `industry`, `website_url`, `logo_url`, `favicon_url`, `short_mark`
- **Geography:** `service_areas` (jsonb), `time_zone`
- **Styling (moved here from global `app_settings`):** `accent` (free hex string, not just the 5 presets), `density` (`comfortable` | `compact`), `motion` (`standard` | `reduced`)
- **Voice:** `tone`, `voice_guidance` (text), `preferred_phrases` (jsonb), `banned_phrases` (jsonb)
- **Services:** `services` (jsonb array — replaces hardcoded `RESTORATION_FOCUS_VALUES`)
- **Proof:** `proof_points` (jsonb — testimonials, certifications, stats Arc may cite)
- **Guardrails:** `guardrails` (jsonb — blocked claims/phrases, regulated-claim notes — replaces hardcoded insurance phrases)
- **Lifecycle:** `status` (`draft` | `active`), `onboarding_completed_at`, `created_at`, `updated_at`

Rationale for a dedicated table over the `organizations.branding` JSONB blob: queryable, typed, migration-friendly, lets Arc/read-models select specific fields. JSONB columns retained only for genuinely freeform data (voice, guardrails, proof).

### 3.2 `persona_definitions` (de-BSR change; stubbed in current code comments)
- `org_id` (FK), `key`, `label`, `description`, `attributes` (jsonb: recommended CTA / message angle / proof points — the Persona Revenue Intelligence fields), `scoring_weight` (numeric), `sort_order`, `active`
- Unique on (`org_id`, `key`).
- The 12 `OFFICIAL_PERSONA_MAPPINGS` are **demoted** to seed data for the restoration template flavor — no longer the global validation authority.

### 3.3 Persona enum relaxation (flagged migration risk)
- `leads.persona` currently constrained by the `persona_mapping` Postgres enum + `leads_persona_not_unassigned_check`, hard-enforcing the 12.
- **Change:** relax `leads.persona` from enum to `text`; move validity to per-org `persona_definitions`, validated at the app layer (`src/domain`). **Preserve** the `unassigned_persona` rejection (internal-only; ingest still returns 400; keep an app-layer + check-constraint guard against the literal `unassigned_persona`).
- **Scoring/routing stays deterministic and app-owned** (per the Lead Ingestion Contract). What becomes data is (a) the persona *set* and (b) per-persona `scoring_weight`. No scoring logic moves into Postgres.
- Migration must preserve existing lead rows (enum values are valid text after relaxation).

### 3.4 `industry_templates`
- **Code constant / seed data, not a user table.** Lives as pure data in `src/domain/brand-kit.ts`.
- Broad industry buckets (quick-starts), all equal citizens — **no special status for restoration**:
  - Home & Property Services (restoration is a sub-flavor here)
  - Professional & B2B Services
  - Health & Wellness
  - Retail & E-commerce
  - Real Estate & Property
  - Hospitality & Local
  - Start neutral / from scratch
- Each bucket pre-fills broadly-useful personas, services, and voice defaults — all fully editable. The neutral option is always available.

---

## 4. Arc Business-Context Wiring (Section B — approved)

### 4.1 `src/domain/brand-kit.ts` (pure, unit-tested; no I/O)
- `parseBusinessProfile()` — validation + defaults
- `NEUTRAL_DEFAULTS` — industry-agnostic baseline (generic persona starters like "decision-maker", "referrer", "repeat customer"; empty services; only universally-safe guardrails, e.g. no false claims / misleading pricing — true for any business)
- `INDUSTRY_TEMPLATES` — the broad-bucket library as pure data
- `assembleArcContext(profile, personas)` → typed **business-context bundle**: business name, services, voice, banned/preferred phrases, proof points, persona set + attributes, guardrail rules

### 4.2 `src/lib/brand-kit/`
- `persistence.ts` — read/write `business_profiles` + `persona_definitions`, org-scoped via `getCurrentOrgId()`, gated by `requireOperator()` + `isSupabaseAdminConfigured()`
- `read-model.ts` — `getBusinessContext(orgId)` assembles the bundle for Arc and UI

### 4.3 De-hardcode wiring
- `draft-engine.ts` — name, offer summary, services, tone, CTA come from the bundle; no literal "Big Shoulders Restoration"
- `guardrails.ts` — blocked phrases/claims and disallowed scopes come from `profile.guardrails`; the restoration insurance rules become the restoration template's default values (so seeded BSR behavior is unchanged)
- `orchestrator.ts` / `social-ad-orchestrator.ts` — receive the context bundle

### 4.4 Degradation & safety
- Missing profile or no Supabase → `assembleArcContext` returns `NEUTRAL_DEFAULTS` so Arc still runs in dev.
- Approval rule preserved: Arc-drafted Brand Kit content and all campaign output stay internal until a human approves. No outbound behavior added.

---

## 5. Onboarding Wizard + Settings (Section C — approved)

### 5.1 `src/app/onboarding/`
Guided wizard, server components + `"use server"` actions, gated by `requireOperator()` + `isSupabaseAdminConfigured()`, following the vault/campaigns reference shape. Steps:
1. **Basics** — display name, industry bucket, website URL, one-line description
2. **Quick-start** — apply chosen bucket's template (pre-fills the kit). *Optional:* "Let Arc refine this from your website" → Arc drafts tailored values, shown as a **review-and-approve diff**; nothing saved until the human accepts
3. **Identity & styling** — logo, colors (free hex), tagline
4. **Services & personas** — edit pre-filled lists (add/remove/rename)
5. **Voice & guardrails & proof** — tone, banned/preferred phrases, proof points
6. **Review & activate** — sets `status = active`, `onboarding_completed_at`

The wizard writes only the org's own config record. No outbound anything.

### 5.2 Settings
- Brand Kit becomes an editable section under `/settings`, reusing existing `settings-forms` patterns, so a business can revise anytime.
- Current global branding/appearance controls are **re-pointed at the org profile** (read/write `business_profiles` instead of global `app_settings`).

---

## 6. Population Strategy (approved)

**Industry templates as the backbone; Arc refinement layered on top as an approval-gated enhancement.**
- Templates alone are a complete, shippable path — works with no AI and no Supabase configured.
- Arc refinement drafts the kit from a URL/description; human reviews/edits/approves before save. Satisfies "Arc works off these" while honoring "Arc drafts, human approves."

---

## 7. Testing
- `src/domain/__tests__/brand-kit.test.ts` — neutral defaults, template library shape, `parseBusinessProfile` validation, `assembleArcContext` output.
- Arc wiring covered by existing draft/guardrail tests re-pointed at profile-driven data.
- Migration: verify existing lead rows survive the persona enum→text relaxation and the `unassigned_persona` guard still rejects.

---

## 8. Scope Boundaries (Section D — approved)

### In scope (this project)
- `business_profiles` + `persona_definitions` tables + persona-enum relaxation migration
- `src/domain/brand-kit.ts` (templates + neutral defaults + Arc-context assembly, unit-tested)
- `src/lib/brand-kit/` persistence + read-model
- Arc wiring: `draft-engine`, `guardrails`, orchestrators read from the bundle (restoration removed from code)
- Onboarding wizard + Brand Kit editor in Settings
- Per-org branding/appearance (moved off global `app_settings`)
- One-time seed of the existing BSR org so prod doesn't regress

### Deferred (separate sub-projects)
- **Real self-serve signup/auth + hard data isolation (RLS enforcement).** Onboarding assumes an org already exists. Multi-account signup, subdomains, and `service_role`→RLS hardening are the next (big) project. The wizard works, but true "anyone signs up" tenancy is separate.
- **Billing/plans.**
- **Per-org scoring-rule tuning** beyond the simple `scoring_weight` field (deep scoring stays deterministic/app-owned).
- **Custom fonts / full surface-color theming** (accent + density + motion only for now).

---

## 9. Don't-break-prod note
The BSR instance auto-deploys to Vercel from `origin/main` and runs on the current hardcoded values. A one-time seed script populates the existing BSR org's `business_profiles` + `persona_definitions` with today's values (restoration template flavor) so prod behavior is preserved the day this ships. This is a seed, **not** special-casing restoration in `src/`. Supabase migrations must be applied to the prod DB manually.

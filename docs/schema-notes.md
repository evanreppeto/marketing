# Growth Engine Schema Notes

## Core Objects

The initial Supabase migration creates the six-object CRM foundation for the Growth Engine:

- `companies`
- `contacts`
- `properties`
- `leads`
- `jobs`
- `outcomes`

The schema keeps relationship fields nullable where real-world intake may arrive incomplete, but every foreign-key column has an index so dashboard joins and attribution queries have a sensible starting point.

## Persona Mapping

The `persona_mapping` enum contains the 12 official personas from the Big Shoulders Restoration Persona Knowledge Base:

- `persona_homeowner_emergency`
- `persona_homeowner_preventative`
- `persona_homeowner_rebuild`
- `persona_landlord`
- `persona_hoa_board`
- `persona_property_manager`
- `persona_insurance_agent`
- `persona_listing_agent`
- `persona_buyers_agent`
- `persona_plumbing_partner`
- `persona_hvac_roof_electrical_partner`
- `persona_gc_remodeler_partner`

It also includes `unassigned_persona` for internal legacy/admin records only.

## Ingestion Boundary

New lead ingestion must reject `unassigned_persona`. The database also enforces this with `leads_persona_not_unassigned_check`, so API code cannot accidentally persist a newly ingested lead without a verified persona.

`companies`, `contacts`, `properties`, `jobs`, and `outcomes` may temporarily use `unassigned_persona` for backfilled, legacy, or admin-created records where attribution is still being reconciled. AI routing and outbound messaging should treat this value as ineligible.

## Routing and Scoring Fields

`leads` includes fields for deterministic routing and scoring:

- `routing_recommendation`
- `loss_signals`
- `matched_target_keywords`
- `matched_non_target_keywords`
- `lead_score`

These fields are intentionally simple database primitives. The application layer should own the flood/water keyword classifier and scoring function so they remain deterministic, unit-testable, and easy to audit.

## Attribution Path

`outcomes` can link back through `job_id`, `lead_id`, `company_id`, `contact_id`, `property_id`, and `persona`. This supports later revenue attribution by persona, referring company, contact, property, and originating lead.

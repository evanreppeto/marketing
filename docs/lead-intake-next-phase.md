# Lead Intake Next Phase

## Goal

Ship the next lead-intake phase as a production-ready workflow that accepts only verified, actionable lead payloads, rejects ambiguous or unsafe payloads before persistence, and gives operators a repeatable manual verification path before database writes are enabled.

This slice is documentation and test planning only. It does not change the current ingestion route, domain logic, Supabase schema, or persistence behavior.

## Current Boundary

The current intake endpoint is `POST /api/v1/leads/ingest`.

It already performs the production gate for incoming payloads:

- Parses JSON request bodies.
- Validates required intake fields.
- Requires an official persona mapping.
- Rejects `unassigned_persona` for new lead ingestion.
- Classifies water-loss, hail/wind-only, and unknown loss signals.
- Calculates deterministic lead and partner scores.
- Returns accepted responses with `202 Accepted`.
- Returns rejected responses with `400 Bad Request`.
- Reports persistence as `not_configured` until Supabase project environment variables are connected.

The next phase should keep this gate intact and add persistence only after accepted payloads have passed validation, classification, routing, and scoring.

## Production Workflow

1. Receive a JSON payload from the website, call center, partner referral flow, or internal intake tool.
2. Reject malformed JSON before domain parsing.
3. Validate the payload shape:
   - `persona` is present.
- `source` is present.
- `lossSignals` contains at least one non-empty signal.
- At least one relationship is present: company, contact, or property.
- Optional company, contact, property, and metadata fields match the accepted schema.
4. Validate persona eligibility:
   - Official personas are eligible for new lead intake.
   - `unassigned_persona` is internal-only and must be rejected.
   - Unknown or non-string personas must be rejected.
5. Classify the loss:
   - Target water-loss signals route to elevated handling.
   - Hail-only or wind-only roof losses route to low-priority archive handling.
   - Unknown losses route to manual review.
   - If target and non-target signals both appear, target water-loss handling wins.
6. Calculate deterministic scores:
   - Lead score uses urgency signals such as standing water, uploaded photos, and after-hours calls.
   - Partner score uses partner tier and relationship signal.
   - Scores must remain deterministic and auditable.
7. Return the API response:
   - Accepted payloads return the parsed persona, classification, routing, scores, and persistence status.
   - Rejected payloads return stable error codes, messages, and field paths where available.
8. In the persistence phase, write only accepted payloads to Supabase:
   - Create or associate company, contact, and property records when supplied.
   - Create the lead with the verified persona, routing recommendation, loss signals, matched keywords, and score.
   - Do not persist rejected payloads as leads.
   - Capture enough rejection metadata separately only if an explicit audit table is added later.

## Accepted Outcomes

An accepted payload should return `202 Accepted` with `ok: true` and `status: "accepted"`.

Expected accepted cases:

- Emergency homeowner water loss with `standing water`, `flooding`, `water backup`, `storm surge`, or `burst pipe` signals routes as `elevated`.
- Water-loss payloads with both target and non-target wording still route as water-loss leads.
- Hail-only or wind-only roof losses with an official persona are accepted but route as `archived`.
- Unknown but structurally valid losses with an official persona are accepted and route as `needs_review`.
- Partner referral payloads may include company `partnerTier` and `networkConnection` to produce a partner score.
- Contact, company, and property details may be partial, but at least one of those relationship objects must be present before the payload can become a lead.

Accepted responses should include:

- `persona`
- `routing`
- `classification.classification`
- `classification.routingRecommendation`
- `classification.matchedTargetKeywords`
- `classification.matchedNonTargetKeywords`
- `scores.leadScore`
- `scores.partnerScore`
- `scores.calculatedAt`
- `persistence.status`

Until Supabase persistence is enabled, `persistence.status` should remain `not_configured`.

## Rejected Outcomes

A rejected payload should return `400 Bad Request` with `ok: false` and `status: "rejected"`.

Expected rejected cases:

- Malformed JSON returns `invalid_json`.
- Missing `persona` returns `persona_required`.
- `persona: "unassigned_persona"` returns `persona_internal_only`.
- Non-string persona values return `persona_invalid_type`.
- Unknown persona strings return `persona_unknown`.
- Missing or blank `source` fails schema validation.
- Missing, empty, or blank `lossSignals` fails schema validation.
- Missing company, contact, and property relationships fail schema validation.
- Invalid optional fields fail schema validation, such as malformed contact email, invalid company partner tier, invalid company network connection, or a property state that is not two characters.

Rejected responses should include:

- Stable machine-readable `code` values.
- Human-readable `message` values.
- `path` values for field-level failures where available.

Rejected payloads must not create lead records in the persistence phase.

## Manual Verification Plan

Run these checks before enabling Supabase writes in production.

1. Install and start the app:

```bash
pnpm install
pnpm dev
```

2. Confirm the automated baseline still passes:

```bash
pnpm test
pnpm lint
pnpm build
```

3. Send an elevated water-loss payload:

```powershell
$body = @{
  persona = "persona_homeowner_emergency"
  source = "website"
  contact = @{
    firstName = "Marlene"
    phone = "312-555-0148"
  }
  property = @{
    streetLine1 = "1234 W Addison St"
    city = "Chicago"
    state = "IL"
    postalCode = "60613"
  }
  lossSummary = "Basement flooding after burst pipe"
  lossSignals = @("standing water", "burst pipe")
  metadata = @{
    after_hours_call = $true
    photo_uploaded = $true
  }
} | ConvertTo-Json -Depth 5

curl.exe -i -X POST "http://localhost:3000/api/v1/leads/ingest" -H "Content-Type: application/json" -d $body
```

Expected result:

- HTTP `202`
- `ok: true`
- `status: "accepted"`
- `routing: "elevated"`
- `classification.classification: "target_water_loss"`
- `scores.leadScore: 100`
- `persistence.status: "not_configured"` until database writes are enabled

4. Send a hail-only payload:

```powershell
$body = @{
  persona = "persona_homeowner_emergency"
  source = "website"
  contact = @{
    phone = "312-555-0100"
  }
  lossSummary = "Car hail damage"
  lossSignals = @("hail damage")
} | ConvertTo-Json -Depth 5

curl.exe -i -X POST "http://localhost:3000/api/v1/leads/ingest" -H "Content-Type: application/json" -d $body
```

Expected result:

- HTTP `202`
- `ok: true`
- `routing: "archived"`
- `classification.classification: "non_target_hail_or_wind_only"`

5. Send an unknown but structurally valid loss:

```powershell
$body = @{
  persona = "persona_property_manager"
  source = "call_center"
  contact = @{
    email = "manager@example.com"
  }
  lossSummary = "General property inspection request"
  lossSignals = @("general property inspection")
} | ConvertTo-Json -Depth 5

curl.exe -i -X POST "http://localhost:3000/api/v1/leads/ingest" -H "Content-Type: application/json" -d $body
```

Expected result:

- HTTP `202`
- `ok: true`
- `routing: "needs_review"`
- `classification.classification: "unknown"`

6. Send an internal persona payload:

```powershell
$body = @{
  persona = "unassigned_persona"
  source = "website"
  contact = @{
    phone = "312-555-0100"
  }
  lossSignals = @("standing water")
} | ConvertTo-Json -Depth 5

curl.exe -i -X POST "http://localhost:3000/api/v1/leads/ingest" -H "Content-Type: application/json" -d $body
```

Expected result:

- HTTP `400`
- `ok: false`
- `status: "rejected"`
- First error `code: "persona_internal_only"`
- First error `path: ["persona"]`

7. Send malformed JSON:

```powershell
curl.exe -i -X POST "http://localhost:3000/api/v1/leads/ingest" -H "Content-Type: application/json" -d "{"
```

Expected result:

- HTTP `400`
- `ok: false`
- `status: "rejected"`
- First error `code: "invalid_json"`

8. After Supabase writes are enabled, repeat the accepted cases and verify:

- One lead record is created per accepted payload.
- No lead record is created for rejected payloads.
- Persisted persona never equals `unassigned_persona`.
- Persisted routing, matched keywords, loss signals, and scores match the API response.
- Optional company, contact, and property records are linked when supplied.
- Re-running the same `externalLeadId` follows the chosen idempotency rule before production traffic is allowed.

## Test Planning

Keep the automated test plan focused on the intake boundary:

- Accepted target water-loss payload returns `202`, elevated routing, target classification, matched target keywords, and expected scores.
- Accepted non-target hail or wind-only payload returns `202`, archived routing, and non-target classification.
- Accepted unknown payload returns `202`, needs-review routing, and unknown classification.
- Mixed target and non-target payload prioritizes target water-loss routing.
- `unassigned_persona`, unknown persona, missing persona, and non-string persona all reject with stable codes.
- Missing `source`, empty `lossSignals`, invalid email, invalid partner tier, invalid network connection, and invalid property state all reject with field paths.
- Missing company, contact, and property relationships rejects with a relationship field path.
- Malformed JSON rejects before domain parsing.
- Persistence tests, once enabled, prove accepted payloads create records and rejected payloads do not.
- Idempotency tests, once implemented, prove duplicate `externalLeadId` handling is deterministic.

## Open Decisions Before Persistence

- Choose the idempotency rule for repeated `externalLeadId` values.
- Decide whether rejected payload audit data belongs in a separate table.
- Decide whether accepted but archived hail/wind-only records should create leads, outcome-only audit rows, or a separate low-priority queue.
- Confirm whether `needs_review` leads should trigger operator notification immediately or only appear in a dashboard queue.
- Confirm which source systems are allowed in production and whether each needs a source-specific shared secret or signature.

# Arc Redesign — Design ↔ Wiring Map

**Purpose:** every element in the gallery designs (`%TEMP%/arc-ui-mockups/build-*.html`) is tagged against the real backend so we never ship a fake. This is the buildability contract for wiring each gallery screen into the app.

**Legend:** ✅ wired now (real field/route exists) · ⚠️ partial (real field, needs an extension) · 🔨 build (new backend work)

**Non-negotiable principle:** when a screen is wired into the app, **each element is either backed by real data or its backend is built in the same PR.** The showcase/gallery may use gated demo data (`isDemoDataEnabled()`, off in production) — production renders real data or a designed empty state, never hardcoded fakes.

---

## Screen: Home / Command Center — `build-home.html` (mockup 01)

| Element | Status | Backend |
|---|---|---|
| Greeting + date + summary line | ✅ | computed server-side; counts from `getDashboardCounts` |
| Focal **top opportunity** (title, confidence, CTA) | ✅ | `listOpenOpportunities()[0]` |
| Focal evidence chips (persona / days-cold / score) | ⚠️ | `evidence` JSONB is real but CRM-derived; richer multi-source = detectors (🔨) |
| **Waiting on you** = decision queue (Needs you) | ✅ | `approval_items` + leads-awaiting-review |
| "Blocked" (guardrail/claim hold) state | 🔨 | surface `reasoning.guardrailFlags` as a hold state |
| Metric strip values | ⚠️ | counts ✅; per-vertical metric set + sparkline series → `getPerformanceReadModel` / 🔨 |
| **Open opportunities** cards | ✅ | `listOpenOpportunities()` |
| **Campaigns in flight** (name/persona/channels/status) | ✅ | `getCampaignWorkspaceList` |
| Campaign "Next action" (Approve N / Sending) | ⚠️ | derive from `pendingCount` + `lifecycle` |
| Reply-rate per campaign | 🔨 | no per-campaign reply series today (engagement-event aggregation) |
| **Signals** rail | ⚠️ | today = opportunities; multi-source signals = detectors (🔨) |
| **Arc activity** | ✅ | `getRecentActivity` |
| Quick actions (New campaign / Add lead / Ask Arc) | ✅ | existing routes/actions |
| **Workspace switcher** | ✅ | workspaces exist (`signal_active_workspace`) |
| Per-vertical retailoring on switch | 🔨 | `workspace.business_type` config + per-vertical templates |

## Screen: Arc Chat — `build-arc.html` (mockup 02)

| Element | Status | Backend |
|---|---|---|
| Operator + Arc messages | ✅ | Arc runner (Cloud Run) + chat persistence |
| **Thought-trace** ("Thought for Ns") | ✅ | reasoning content (reasoning-core shipped); UI render ✅ |
| **Inline approval card** (Approve/Revise/Decline) | ✅ | `InlineApprovalCard` primitive + `approval_items` + draft-asset route |
| Numbered **citations** | ⚠️ | sources exist in reply-meta; numbered-chip wiring |
| "Arc is thinking" shimmer | ✅ | streaming states |
| Composer **Ask / Act / Draft** modes | ✅ | runner modes (`toolsForMode`) |
| "Outbound stays locked" | ✅ | the approval gate is real |
| Thread rail (Pinned / Projects / Archived) | ⚠️ | conversations exist; pin/group metadata = small add |

## Screen: Opportunities — `build-opportunities.html` (mockup 03)

| Element | Status | Backend |
|---|---|---|
| Title, confidence %, urgency, recommended action, detected-at | ✅ | `OpportunityRecord` fields |
| **Create campaign / Ask Arc to draft** → approval | ✅ | `getOpportunityForDraft` → draft-asset → `approval_items` |
| Persona (Who it targets) | ✅ | `evidence.persona` |
| Evidence rows (multi-source) | ⚠️ | one CRM-derived source today; multi-source = detectors (🔨) |
| Audience count / avg value | 🔨 | audience sizing query |
| **Projected impact** forecast | 🔨 | projection model |
| **Draft preview** (subject/body before create) | 🔨 | pre-generate draft on detection/open |
| **"How this played out before"** | 🔨 | similar-play matching over performance history |
| **Approval routing** (multi-step) + auto-expire | 🔨 | roles/routing + expiry (today = single operator gate) |
| Dismiss | ⚠️ | opportunity status transition |

## Screen: Campaign Builder — `build-campaign-builder.html` (mockup 05)

| Element | Status | Backend |
|---|---|---|
| Title + "In review" status pill | ✅ | campaign read-model `lifecycle` |
| Format tabs (Brief/Audience/Email/SMS/Ad/Landing) | ✅ | `campaign_assets` by `assetType` (show present formats; Arc drafts missing ones) |
| Draft content per format (subject/body/etc.) | ✅ | `CampaignWorkspaceAsset.body` / `preview` |
| Media + **Real-media** provenance badge | ✅ | `MediaProvenanceBadge` + `SafeImage` + `CampaignMediaAsset.origin` |
| **Approve / Request revision / Decline** | ✅ | `decideAssetAction` / `requestRevisionAction` / `decideApprovalAction` |
| "Outbound stays locked until approved" | ✅ | `dispatchLocked` + approval gate |
| Target audience chips + lookalike + size | ⚠️ | `audienceSummary` real; structured segments/size/lookalike = audience model |
| Guardrail check (per-check breakdown) | ⚠️ | `reasoning.guardrailFlags` exist; claim/logo/privacy breakdown = structured guardrail result |
| Assets (Real / AI / Composite) | ✅ | `CampaignMediaAsset.origin` (attached/generated/referenced) |
| **Platforms tab** — per-platform copy + format variants (IG/FB/X/LinkedIn/TikTok) | ⚠️ | copy variants = Arc per-platform draft; aspect variants = Higgsfield `reframe`; `CampaignMediaAsset.format` is real |
| Platform **publishing** | 🔨 | needs platform connectors (Meta/X/LinkedIn) + scheduling; stays approval-gated (never auto-outbound) |

*Highest-wireability screen so far — it's the existing wired campaigns feature, restyled.*

## Screen: Creative Studio — `build-studio.html` (mockup 05; extends mockup 12 Library)

The richest creative surface: **Arc copilot docked in the inspector** + **campaign tie** + a full tool ribbon. Corrected against the 2026-06-25 backend audit — `compose_creative` is fully wired; all Higgsfield tools are ⚠️ gated (connector OFF until a per-workspace Vault credential is stored, draft/act-mode only); third-party **import-from-URL** into the app Library is 🔨 (not wired — Higgsfield's `media_import_url` is MCP-side, not app ingestion).

| Element | Status | Backend |
|---|---|---|
| **Campaign context** bar + brief card ("attaches on approve") | ✅ | `getCampaignWorkspaceList`; asset lands via `draft-asset`/`library/attach` with `campaign_id` as `pending_approval` |
| "Library only" (no campaign) | ✅ | omit `campaign_id` → saves to `media_assets` |
| **Brand overlay** (logo + kicker + headline + CTA) | ✅ | `compose_creative` (`apps/arc-runner/src/tools/media.ts:178`) → `POST /api/v1/arc/media/compose` (`src/lib/media/compose/renderer.ts`) |
| Edit copy (kicker / headline / subhead / CTA) | ✅ | compose inputs (`headline` / `kicker` / `cta_label`) |
| Recolor to brand | ✅ | brand kit palette (`business_profiles.brand_palette` → `toBrandTokens`, `creative-templates.ts:91`) |
| Format 1:1 / 4:5 / 9:16 / 16:9 (+ px labels) | ✅ | `CREATIVE_DIMENSIONS` (`creative-templates.ts:35`) |
| Templates (bold / editorial / minimal) | ✅ | `selectCreativeTemplate` (`creative-templates.ts:53`) |
| Source — **Library** | ✅ | `list_media` / `media_assets` (`available_to_arc`) |
| Source — **AI** (generate image / video) | ⚠️ | Higgsfield `generate_image` / `generate_video` — connector `gated_write`, draft/act-only, **OFF until per-workspace Vault credential** |
| Source — **Upload** (device) | ✅ | Library upload UI → `media_assets` |
| Source — **Import from URL** (Canva / MJ / DALL·E) | 🔨 | no app-Library ingestion endpoint; net-new (provenance-tagged) |
| Source — **Stock** | 🔨 | needs a stock-media provider |
| Tool — **Variations** | ⚠️ | Higgsfield generate (gated); each is a separate draft |
| Tool — **Reframe** (video aspect) | ⚠️ | Higgsfield `reframe` (gated, video) |
| Tool — **Expand / Outpaint** | ⚠️ | Higgsfield `outpaint_image` (gated) |
| Tool — **Cut-out** (remove bg) | ⚠️ | Higgsfield `remove_background` (gated) |
| Tool — **Upscale** (2K / 4K) | ⚠️ | Higgsfield `upscale_image` / `upscale_video` (gated) |
| Tool — **Animate** (still → motion) | ⚠️ | Higgsfield `motion_control` / `generate_video` (gated) |
| **Virality** check | ⚠️ | `virality_predictor` — **video-only** (`variants.ts` `analysis.scores`: viral_potential / hook_score / sustain). Images use the **fit proxy** shown (format-match / brand-present / dims) — never a fake % |
| **Guardrails** (brand / claim / privacy) | ⚠️ | `riskFlags` on `ArcMedia` exist; structured per-check breakdown + claim→proof linkage = build |
| **Arc copilot** (thread, thought-trace, Ask/Act/Draft) | ✅ | Arc runner chat + reasoning-core; drafts land via `draft-asset` as `pending_approval` |
| Arc draft cards: Approve / Revise / Decline | ✅ | `decideAssetAction` / `requestRevisionAction` (approval gate) |
| Provenance badges (Real / AI / Composite / Imported / Stock) | ✅ | `ArcMedia.source` = `bsr_real` / `ai_generated` / `composite` / `stock` / `external` |
| Draft status pill ("Draft · not approved") | ✅ | `ArcMedia.status` = `draft` / `revision` / `approved` / `rejected` |
| Save to Library / Add to campaign / Download | ✅ | Library + `library/attach` / `draft-asset` + export |
| **Image / Video** mode toggle | ✅ / ⚠️ | image = `compose_creative` ✅; video = Higgsfield `generate_video` (gated) |
| **Template** picker (Bold / Editorial / Minimal) | ✅ | `selectCreativeTemplate` / compose `template` param |
| Video **timeline / play** scrubber | ⚠️ | UI over a generated clip; the clip itself = Higgsfield (gated) |
| **Audio** — voiceover / music bed | ⚠️ | Higgsfield `generate_audio` / `dubbing` / `voice_change` (gated) |
| **Captions** (auto-burned subtitles) | 🔨 | net-new (transcription + burn-in) |

**Net-new to fully wire:** (1) **Higgsfield connector enablement** (per-workspace Vault credential + spike sign-off) flips every ⚠️ AI tool live; (2) app-Library **import-from-URL** ingestion endpoint (provenance-tagged) for third-party art; (3) **structured guardrail result** + claim→proof linkage; (4) a **campaign-media picker** dialog component. The Arc copilot, campaign tie, brand overlay, formats, provenance and approval gate are all ✅ today.

## Screen: CRM Contacts — `build-crm.html` (mockup 06)

Rebuilt as a real **data grid** — the app's installed stack is **`@tanstack/react-table` 8.21.3 + MUI Material 7** (audit 2026-06-25), so the production table should be a TanStack grid, not a hand-rolled list. Columns follow the real **per-object preset model** (`crm-object-table.tsx` + `crm-field-presets.ts`): column types `primary / secondary / persona / score / status / updated / nextAction / value / links`.

| Element | Status | Backend |
|---|---|---|
| **Per-object columns** (Companies/Contacts/Properties/Leads/Jobs/Outcomes switch column set) | ✅ | `crm-field-presets.ts` column-type model; 6 tables in `20260527131500_initial_growth_engine_schema.sql` |
| Sortable headers / sticky header / density | ✅ | TanStack sorting + column model (client) |
| **Row + select-all** checkboxes → bulk action bar | ⚠️ | selection is client; the **bulk actions** (add-to-campaign / assign-persona / add-task / Arc enrich) map to real writes but need a multi-select action handler |
| Contact cell (avatar, name, title) | ✅ | `contacts.first_name`/`last_name`/`full_name`/`title` |
| Company column | ✅ | `contacts.company_id` → `companies.name` |
| **Persona** chip (group-colored) | ✅ | `persona_mapping` enum (group color = `growth-engine.ts` persona `group`) |
| **Status** pill (active / inactive / do_not_contact) | ✅ | `contacts.status` = `contact_status` enum |
| **Lead score** (number + bar) — Leads/Properties tabs | ✅ | `leads.lead_score` (int 0–100, `calculateLeadScore`) |
| **Routing** — Leads tab | ✅ | `leads.routing_recommendation` enum |
| **Tier** (A/B/C) — Companies tab | ✅ | `companies.partner_tier` |
| **Value / Revenue** ($) — Jobs/Outcomes tabs | ✅ | `jobs.estimated_revenue_cents` / `outcomes.gross_revenue_cents` |
| Last activity (relative + absolute) | ✅ | interactions / `updated_at` |
| **Tasks** ("N open") — Contacts tab | ✅ | `crm_tasks` (status=open count) |
| Toolbar filters (Persona / Status / Owner) + saved views | ⚠️ | filter dimensions are real columns; **saved views** need a small persisted-view store |
| Footer pagination + "Arc enriched N today" | ✅ | org-scoped paged query + activity read-model |
| Click row → record · Add / Import / Export | ✅ | record route; CSV import/export of org-scoped tables |

*Note: persona shown as org-configurable (the mockup's SaaS personas) — the DB enum is restoration-specific today; **org-configurable personas** remain the per-vertical config build (see foundation note).*

## Screen: CRM Record — `build-crm-record.html` (mockup 07)

Rebuilt to the real **4-tab record** (`crm-record-page.tsx`: Overview / Activity / Intelligence / Related). Each RI-narrative field is **tagged in the UI itself** ("Arc estimate" / "planned" vs "wired") so nothing reads as wired when it isn't.

| Element | Status | Backend |
|---|---|---|
| Header band: name, role → company, persona, status, source, owner | ✅ | `contacts` columns + `companies` join |
| Metric strip — **Lead score** (linked lead) | ✅ | `leads.lead_score` |
| Metric strip — **Interactions** count | ✅ | `crm_activities` |
| Metric strip — **Open tasks** | ✅ | `crm_tasks` |
| Metric strip — **Lifetime value** | ✅ | `outcomes.gross_revenue_cents` (won/paid) |
| **Overview** — stored fields (email/phone/title/company/source/created) | ✅ | `contacts` columns |
| **Activity** — Timeline / Tasks / Notes | ✅ | `crm_activities` / `crm_tasks` / `crm_notes` + `POST /api/v1/arc/crm/interactions` |
| **Related** — Connected records (Company/Leads/Jobs/Outcomes) | ✅ | real FKs (`company_id`/`lead.contact_id`/`job.contact_id`/`outcome.contact_id`) |
| **Related** — Linked campaigns | ✅ | last-touch attribution (`leads.attributed_campaign_id`) |
| **Related** — Channels (email/phone/website) | ✅ | `contacts.email`/`phone` + `companies.website_url` |
| **Intelligence** — Relationship graph (radial) | ✅ | renders the real FK neighborhood |
| **Intelligence** — Engagement counts | ✅ | `crm_activities` by type |
| **Intelligence** — Data quality / completeness | ✅ | derivable from null fields |
| Primary persona chip + **"wired"** tag | ✅ | `persona_mapping` |
| **Draft outreach** | ✅ | draft flow → approval gate |
| Persona **confidence** (tagged *Arc estimate*) | 🔨 | no DB column — Arc-inferred / persona-RI migration |
| **Journey stage** / **urgency** (tagged *Arc estimate*) | 🔨 | no DB columns — persona-RI migration |
| **Secondary personas** ("also matches", tagged) | 🔨 | schema stores a single persona only |
| **Relationship / Revenue-opportunity** scores (tagged *planned*) | 🔨 | persona-RI migration + score history |
| **NBA** card (recommendation / CTA / angle / proof, tagged) | ⚠️ | `next_best_actions` table EXISTS (`20260528162000`) but is **not yet joined** to the record read-model |

*The only CRM backend build is the **persona-RI migration** (typed `persona_confidence` / `journey_stage` / `relationship_score` / `revenue_opportunity_score` / secondary-persona) + joining `next_best_actions`. Everything else on these two screens is wired today.*

## Screen: Analytics — `build-analytics.html` (mockup 09)

Rebuilt far richer: a control bar (view tabs + date range + **period comparison** + filters), a trend chart with a **previous-period overlay**, a funnel, persona/source/channel breakdowns, a **per-campaign table** with drill, and an **"Arc's read"** AI panel. Audit-grounded (2026-06-25): the read-model, deltas, funnel and breakdowns are wired; per-campaign impressions/clicks/spend need an ad-platform sync; the AI read's *numbers* are wired (`read_performance`) while the *recommendation* is Arc's interpretation.

| Element | Status | Backend |
|---|---|---|
| KPI band — Leads / Booked jobs / Won revenue | ✅ | `getPerformanceReadModel` (counts from `leads`/`jobs`/`outcomes`) |
| KPI deltas + **"vs previous period"** comparison | ✅ | `sumTwoPeriods()` / `computeDelta()` (real period-over-period) |
| KPI — Reply rate | ⚠️ | `engagement_events` (event_type=reply) count exists; **no send denominator** → partial |
| KPI — Cost / job | 🔨 | needs `campaign_results.spend_cents` (ad-platform sync) |
| **Trend chart** (revenue / leads / bookings) + prev-period dashed overlay | ✅ | `getPerformanceReadModel.trend` (weekly from `created_at`); the flagged `TrendChart` → inline-SVG rewrite (drop `@mui/x-charts`) |
| **Funnel** (Leads → Booked → Won) | ✅ | `funnelStages` |
| Revenue by persona / Leads by source | ✅ | `revenueByPersona` / `leadVolumeBySource` |
| Leads by channel / ROAS by channel | ⚠️ | channel from `campaign_assets.channel` (wired); **ROAS needs spend sync** |
| Conversion by persona | ✅ | derived from `leads`/`outcomes` by persona |
| **Per-campaign table** (leads / jobs / won rev) | ✅ | attribution: `leads.attributed_campaign_id` → `jobs`/`outcomes` |
| Per-campaign **impressions / clicks / spend** (shown as "—") | 🔨 | `campaign_results` schema exists but is **empty until an ad-platform connector syncs** |
| Per-campaign **ROAS / CPL** | ⚠️ | derivable once `spend_cents` is fed |
| Campaign **drill** (mini-trend + per-campaign Arc read) | ✅/⚠️ | `read_performance` per-campaign slice; spend-dependent metrics gated |
| **"Arc's read"** — cited stats (ROAS / CPL / CTR / n) | ✅ | `read_performance` Arc tool → `/api/v1/arc/performance` → `getPerformanceBySlice` (`SliceStat`) |
| **"Arc's read"** — recommendation / next iteration | ⚠️ | Arc *interpretation* is real (an Arc run); **automated anomaly/next-move detection** is demo-only / learning-loop (🔨) |
| Activity view | ✅ | `getRecentActivity` (merged from `approval_decisions`/`agent_run_logs`/`agent_outputs`/`campaign_events`/`events`) |
| Filters (date / persona / channel / campaign) | ✅ | all real grouping dimensions |
| Export | ⚠️ | CSV export of the read-model (small add) |

**Net-new to fully wire:** (1) an **ad-platform connector** (Meta/Google/email/SMS) feeding `campaign_results` → unlocks impressions/clicks/spend/CTR/CPL/ROAS and the cost KPIs; (2) the **learning loop** (automated anomaly detection + similar-play "next move" ranking) behind "Arc's read" recommendations; (3) a send-volume denominator for true reply/open rates. The read-model, period comparison, funnel, breakdowns, attribution-based per-campaign rows, and Arc's *cited* read are wired today.

## Screen: Personas — `build-personas.html` (mockup 11)

The persona **playbook + intelligence** layer — a roster grouped by segment + a per-persona playbook. **More wired than the CRM RI fields**, because persona intelligence has dedicated tables (`persona_snapshots`, `persona_knowledge_entries`). There is already a live `/personas` route (`persona-roster.tsx` + `lib/personas/console.ts`). Audit 2026-06-25.

| Element | Status | Backend |
|---|---|---|
| Roster grouped by **segment** (acquisition / engagement / retention) + stage pill + score | ✅ | `listPersonas()` (`lib/personas/console.ts`); `persona-roster.tsx`; stage/score from `persona_snapshots` |
| Stats strip (personas / segments / avg score / need attention) | ✅ | `getPersonaIntelligenceData().stats` (`lib/persona-intelligence/read-model.ts`) |
| Persona **confidence** + 90-day score trend | ✅ | `persona_snapshots.confidence` + score history |
| **Signals** (engagement / fit / intent + drivers) | ✅ | `persona_snapshots` snapshot fields |
| **Message angle** | ✅ | `persona_knowledge_entries` (entry_type=`messaging_angle`) |
| **Recommended CTA** | ✅ | `personaDisplay.primaryAction` / `PERSONA_CTA_RULES` (`cta-rules.ts`) |
| **Proof points** | ✅ | `persona_knowledge_entries` (entry_type=`proof_point`) |
| **Objections** | ✅ | `persona_knowledge_entries` (entry_type=`fear`/`frustration`) |
| **Best channel** | ✅ | `persona_snapshots.preferred_channel` + `campaign_results.channel` |
| **Sample message** (subject + preview) | ✅ | Arc-drafted, approval-gated (draft engine) |
| **Performance** (contacts / leads / revenue / conversion) | ✅ | `leadVolumeByPersona` / `revenueByPersona` + `getPerformanceBySlice(dimension=persona)` |
| **Compare** view — scatter (score × conversion, bubble = audience share) + sortable ranked table | ✅ | same wired per-persona performance + score; client-side sort, click → opens persona |
| **Signals radar** (engagement / fit / intent) | ✅ | `persona_snapshots` snapshot fields (inline-SVG radar) |
| **Brain connections** (segments / campaigns / assets) | ✅ | persona is a `knowledge_nodes` node (`kind=persona`); `targets` / `relates_to` edges |
| **Next best move** (tagged *Arc estimate*) | ✅ | `persona_snapshots.nextBestAction` |
| Build campaign for persona → / View N contacts → | ✅ | campaign request (`persona` enum) / CRM filtered by persona |
| **Nurture cadence** (tagged *planned*) | 🔨 | no config table — net-new |
| Arc **playbook-update** drafts alert | ⚠️ | entries exist; **Arc-authored** CRUD to `persona_knowledge_entries` = build |
| **Org-defined persona** chip / New persona / Edit playbook (tagged *org-config*) | ⚠️ | `persona_definitions` table exists per-org, but `persona_mapping` enum is still enforced app-wide |
| Recommended assets | 🔨 | per-persona asset-recommendation logic — net-new (Arc) |

**Net-new to fully wire:** (1) **nurture-cadence** config; (2) **persona-classification** Arc tool (assign personas to inbound leads) + **playbook-update** writes; (3) **org-configurable personas** enforcement (enum→text validating against `persona_definitions`); (4) per-persona **recommended-assets** logic. The roster, playbook (angle/CTA/proof/objections/channel), confidence, signals, performance, and Brain links are wired today.

## Screen: Brain — `build-brain.html` (mockup 10)

**The most-wired screen in the set.** There's a live `/brain` route (`brain-shell.tsx`) backed by a real knowledge graph. The mockup mirrors its tabs (Knowledge Web / Ask Arc / Health / Needs Review / Recently Learned / All Facts). Audit 2026-06-25 — almost everything is ✅; the only caveats are real-time updates and Cytoscape physics (the gallery uses a curated inline-SVG graph instead of running Cytoscape).

| Element | Status | Backend |
|---|---|---|
| **Knowledge Web** graph (nodes by kind, sized by degree, edges) | ✅ | `getBrainGraph` / `BrainNode` + `BrainEdge` (`knowledge-graph/read-model.ts`); real impl = **Cytoscape.js** (fCoSE + Cola). Gallery uses inline-SVG curated layout |
| Node colors by kind | ✅ | exact map from `brain-graph-cytoscape.tsx` (brand_fact/persona/proof_point/…) |
| 19 node **kinds** | ✅ | `NODE_KINDS` (`domain/knowledge-graph.ts`) + 6 auto `crm_*` kinds |
| 9 edge **relations** (targets / proves / governs / learned_from / belongs_to / …) | ✅ | `EDGE_RELATIONS` |
| Click node → **inspector** (kind, summary, trust, confidence, source, connections) | ✅ | `BrainNode` fields + edge traversal |
| **Trust tier** (trusted / proposed / observed) + proposed = dashed | ✅ | `knowledge_trust_tier` enum (observed/proposed/trusted/rejected/archived) |
| **Provenance** + deep-link ("Open CRM record / campaign / Library") | ✅ | `nodeProvenance` (`domain/brain-provenance.ts`) → `refTable`/`refId` |
| Stat strip (nodes / trusted / observed / awaiting review) | ✅ | `brainSummary` (total / byKind / byTier) |
| **Coverage banner** (N of M records mirrored, behind count) | ✅ | `getBrainCrmCoverage` (CRM vs Brain node counts) |
| **Ask Arc** recall (semantic + keyword + graph, match scores, related) | ✅ | `getRecallMemory` — **pgvector + Gemini 768d embeddings (LIVE)** + keyword + `traverseFrom` depth 2 |
| **Health** (score + orphans / stale / low-confidence / coverage-gaps) | ✅ | `analyzeBrainHealth` (`domain/brain-health.ts`); score = 100 − weighted penalties |
| **Needs Review** approval queue (proposed → trusted, gated kinds) | ✅ | `GATED_NODE_KINDS` + approve writes `approved_by`/`approved_at` |
| **Recently Learned** timeline | ✅ | nodes by `created_at` + source + tier |
| **All Facts** node list + kind filter | ✅ | `listNodes` |
| Resync from CRM | ✅ | `ResyncCrmButton` → ingestion sync |
| Ingestion paths (CRM / campaign / media / performance / synthesis) | ✅ | `brain-ingestion` + `proposeAudienceSegment` |
| Real-time graph updates | 🔨 | fetch-on-load only; no subscriptions (noted, not faked) |

**Net-new:** real-time/streaming graph updates, node/edge deletion UI (soft-archive only today). Everything else — graph, recall (incl. semantic), health, coverage, approval gate, provenance — is wired. *In the app this screen renders with **Cytoscape.js** (fCoSE seed + Cola physics); the gallery uses a **force-directed inline-SVG** stand-in with the same interactions — **drag nodes, scroll-zoom, drag-to-pan, hover-spotlight, click-to-inspect** (Obsidian-style).*

## Screen: Library — `build-library.html` (mockup 12)

The media **asset store** (pairs with Studio, which pulls from it, and Brand). Backed by the wired media-library feature (`media_assets` / `media_folders` + the Arc `list_media`/`attach_media` tools) audited during the Studio work.

| Element | Status | Backend |
|---|---|---|
| **Folder tree** — nested, **collapsible**, **drag-to-reorder/nest**, recursive counts, create/rename/delete/subfolder | ✅ | `media_folders` (id/name/**parent_id**/sort_order); `ArcFolderSummary`. Built the app's way: **`@dnd-kit/sortable`** (drag/nest) + **`@radix-ui/react-collapsible`** (expand) — no `@mui/x-tree-view` exists, this composed tree *is* the component. `parent_id` = nesting; `sort_order` = drag order |
| **Asset grid** (thumbnail, kind, dims) | ✅ | `media_assets` (file_name/public_url/kind/width/height/folder_id) |
| **Provenance badge** (Real / AI / Composite / Imported / Logo / Doc) | ✅ | source/tags → `ArcMedia.source` |
| **Available-to-Arc** badge + toggle | ✅ | `media_assets.available_to_arc` (gates `list_media`) |
| **Risk flag** | ✅ | `media_assets.risk_flags` |
| Kind filter (Images / Videos / Logos / Docs) + search | ✅ | `media_assets.kind` (client over `list_media`) |
| Asset **inspector** (dims / source / tags / used-in / actions) | ✅ | `media_assets` fields |
| **Used in** campaigns → Campaign Builder | ✅ | `campaign_assets` referencing the media |
| **Edit in Studio** | ✅ | → Creative Studio (`compose_creative`) |
| **Add to campaign** | ✅ | `attach_media` → `POST /api/v1/arc/library/attach` |
| Download | ✅ | `media_assets.public_url` |
| **Upload** (device) / **New folder** | ✅ | Library upload → `media_assets`; `create_folder` |
| **Import from URL** (Canva / MJ / DALL·E) | 🔨 | no app-Library ingestion endpoint — net-new (same gap as Studio) |
| Storage meter | ⚠️ | needs a storage-usage query |

| **Overview band** (totals, by-kind, Arc-ready / needs-review / unused) | ✅ | aggregates over `media_assets` |
| **Smart collections** (Arc-ready / Needs review / Unused / Recent) | ✅ | client filters: `available_to_arc` / `risk_flags` / no `campaign_assets` ref / `created_at` |
| **Multi-select + bulk** (make-available-to-Arc / add-to-campaign / move) | ⚠️ | batched writes over `media_assets` / `attach_media` — needs a multi-asset handler |
| Grid ↔ **List view** + sort (recent / name / most-used) | ✅ | client over `list_media` |
| **Provenance lineage** (source → composite → used) | ✅ | derived from `source` / `ArcMedia.source` + `campaign_assets` |
| **Risk-flag box + Resolve** | ✅ | `media_assets.risk_flags` + an approve transition |
| **Generate a variation** / Generate with Arc | ✅ | → Studio (`compose_creative` / Higgsfield) |
| **Arc suggestion** ("unused approved assets → draft ads") | ⚠️ | the unused-asset query is real; the *suggestion* is an Arc opportunity (detector) |

**Net-new:** import-from-URL ingestion + storage-usage metering + a multi-asset bulk handler. Everything else is the wired media-library, restyled. Cross-links: asset → Studio / Campaign Builder; used-in → Campaign Builder; suggestion/generate → Studio.

---

## Screen: Brand — `build-brand.html` (mockup 13)

The customer's **brand identity** — the source of truth Arc applies to every draft. Almost entirely wired to one table (`business_profiles`); it's the upstream of Studio's `compose_creative` and the guardrail gate. Demo brand = "Stride" (B2B SaaS dev platform) to match the workspace.

| Element | State | Backing |
| --- | --- | --- |
| **Identity hero** (logo, name, legal name, tagline, industry, website, status) | ✅ | `business_profiles` (`display_name`/`legal_name`/`tagline`/`industry`/`website_url`/`logo_url`/`status`); `getBusinessProfile` |
| Replace logo | ✅ | `logo_url` / `short_mark` → Library asset |
| **Brand palette** (primary/secondary/accent/ink/paper + hex + roles) | ✅ | `business_profiles.brand_palette` → `toBrandTokens` (`creative-templates.ts:91`) |
| Click-swatch → recolor **live preview** | ✅ (UI) | demonstrates `--bactive` token flow into `compose_creative` |
| **Typography** (display / UI / mono specimens) | ✅ | `brand_palette.headingFont` / `bodyFont` |
| **Voice & tone** (tone chips, voice_guidance, preferred / banned phrases) | ✅ | `tone` / `voice_guidance` / `preferred_phrases` / `banned_phrases` |
| Banned-phrase enforcement | ✅ | feeds the campaign **guardrail** check (drafts flagged pre-approval) |
| **Proof points** / **Services** / **Guardrails** | ✅ | `proof_points` / `services` / `guardrails` |
| **Live brand preview** (palette + fonts + approved photo → ad) + aspect switch (1:1/4:5/16:9/9:16) | ✅ | `compose_creative` → `POST /api/v1/arc/media/compose`; "Open in Studio" cross-link |
| **Brand sources** (pdf/docx/md/csv → "Arc extracted N facts" → Brain) | ✅ | brand-doc ingestion (mammoth + Gemini, PR #228) → `knowledge_entries`; row → Brain deep-link |
| Upload brand doc | ✅ | brand-source upload → parse → Brain |
| Per-persona voice variants | ⚠️ | `persona_definitions` exists; persona-specific tone overrides not yet modeled |
| "How Arc uses this" note | ✅ (copy) | accurate: every draft pulls tokens + is guardrail-checked before the queue |

### Brand Intake — "Teach Arc your brand" (added after the `brand-intake-design` audit, 2026-06-26)

The headline enhancement. A **5-agent backend audit** (`wf50u3yk4`) confirmed the ingestion stack is **far more wired than assumed** — every source maps to a real operator-gated server action that runs Gemini extraction into a **review-gated** queue (proposed `knowledge_nodes`, `created_by:'arc'` → `trust_tier:'proposed'`) **and** merges a `BrandProfileUpdate` into `business_profiles`. Nothing is auto-applied. Caveats: requires `GEMINI_API_KEY` + Supabase; sources are `media_assets` (`provenance.brandSource`) — there is **no** `brand_sources` table.

| Intake source | State | Backing |
| --- | --- | --- |
| **Website** (paste URL → crawl up to 6 pages → logo, colors, fonts, voice, proof) | ✅ | `analyzeBrandDesignFromWebsiteAction` (design: `website-fetch.ts` SSRF-guarded fetch + `domain/brand-design.ts` regex palette/logo/fonts) **+** `importAndAnalyzeBrandWebsiteAction` (`url-source.ts` `discoverWebsiteSourceUrls` crawl-6 → `extractBrandKnowledgeBundleWithGemini`). One combined "analyze whole site" action = small 🔨 consolidation. Caveat: palette regex misses external-CSS/JS-rendered sites |
| **Documents** (.docx/.pdf/.md/.csv/txt, 50 MB) | ✅ | `uploadAndAnalyzeBrandSourcesAction` → `extractAssetText` (mammoth/.docx, UTF-8 text; PDF read natively by Gemini) → `learnBrandKnowledgeFromAsset` → `createNode` (proposed) + `upsertBusinessProfile` |
| **Logo & images** (Gemini vision → structured palette + short mark) | ✅ (shipped `claude/brand-logo-palette-vision`) | image bytes reach Gemini vision (`gemini-parser.callGemini` inlineData); the prompt now requests `profile.brandPalette` (primary/secondary/accent/dark/light `{label,hex}` + fonts) + `profile.shortMark`, `parseProfile` extracts them, and `mergeBrandProfileUpdate` fills `business_profiles.brand_palette` via the new pure **`mergeBrandPalette`** (`domain/brand-kit.ts` — keep-or-fill, hex-normalizing, ignores invalid). No migration (column existed). Test-first (TDD), CI-safe (Gemini mocked via `generateText`). Live extraction still needs `GEMINI_API_KEY` |
| **Manual** (brand note / direct edit) | ✅ | `ingestBrandChatNoteAction` (note → proposed nodes); direct field edits → `saveBrandKitAction` |
| **"What Arc found"** review queue (Accept / Dismiss, source-cited) | ✅ | `BrandReviewQueue` → `approveNodeAction` / `rejectNodeAction`. **Edit-before-accept** + per-profile-field diff/accept = 🔨 (`mergeBrandProfileUpdate` merges silently today; would need a `brand_field_proposals` concept) |
| **Inline-edit every field** (name, tagline, voice, palette hex, phrases, proof, guardrails, services) | ✅ | save path fully wired: `saveBrandKitAction` → `buildBusinessProfileFromForm` → `validateBusinessProfile` → `upsertBusinessProfile` (`onConflict org_id`) + `revalidatePath`. Only the click-to-edit **affordance** is new UI |
| **Re-sync source** (per-source + Re-sync all; "analyzed Xd ago" + **stale** badge) | ✅ | `syncBrandKnowledgeSourcesAction` re-learns from existing `media_assets`; staleness derived from asset `updated_at` age |
| **"How Arc will write"** voice sample + Regenerate | ⚠️ | voice inputs wired (`tone`/`voice_guidance`/`preferred`+`banned`/`proof_points` → `assembleArcContext`); an on-demand "write me a sample" call is a thin build over the runner's existing drafting |
| Edit density / motion / time_zone | 🔨 | columns exist; no form keys (preserved-from-current) |

**Net-new (prioritized):** P1 inline-edit affordance over `saveBrandKitAction` (UI only); P2 single `analyzeWholeSiteAction` (design+voice+proof in one cited proposal); P3 `brand_field_proposals` migration + `acceptProfileFieldAction` + `updateNodeBeforeApproveAction` (edit-before-accept + per-field diff); P4 `analyzeBrandImageWithGemini` + extend `mergeBrandProfileUpdate` (logo → structured palette). Cross-links: preview → Studio; each brand source → Brain; logo → Library. Demo brand "Stride".

---

## Screen: Board / Outbox — `build-outbox.html` (mockup 14)

Two **peer tab views** (confirmed by an Explore scout), both wired — they share a TabNav, not nested. The screen that makes the **never-auto-outbound** invariant visible.

| Element | State | Backing |
| --- | --- | --- |
| **Outbox** kanban (Queued → Scheduled → Sent → Delivered → Failed) | ✅ | `/outbox` · `getOutboxList` (`src/lib/dispatch/read-model.ts`) over **`campaign_dispatches`** (status: queued/scheduled/sent/delivered/failed/canceled), `OutboxConsole` |
| **"Outbound is locked"** banner + gate flow | ✅ | invariant enforced in `executeResendDispatch` (`src/lib/dispatch/execute-resend.ts`): send requires `status='queued'` **+** a linked `approval_items` row whose status ≈ approved. **No `ENABLE_CAMPAIGN_SEND` flag** — gate is approval + `connections` config |
| Dispatch card (campaign, channel, audience/recipient count, when, result note) | ✅ | `campaign_dispatches` columns (`channel`/`recipient_summary`/`audience_count`/`scheduled_for`/`dispatched_at`/`result_note`/`payload`) joined to `campaigns`+`campaign_assets` |
| Confirm send / Retry / Cancel / Mark delivered | ✅ | dispatch transitions (`persistence.ts transitionDispatch`); email send = `executeResendDispatch` (Resend, `provider_message_id`) |
| **Status KPIs** (awaiting confirm + recipients · scheduled · sent today · avg open) | ✅ | aggregates over `campaign_dispatches` (avg-open via `campaign_events` ⚠️) |
| **Pre-flight confirm drawer** (Approved ✓ · Guardrails ✓ · From-domain verified ✓ · Unsubscribe/suppression ✓ → "Send to N") + bulk **Confirm all** | ✅ / ⚠️ | the human send gate; checks map to `approval_items` (approved-by) + campaign guardrail result + `connections` (verified from-domain); suppression/unsubscribe enforcement ⚠️ (not modeled yet); send via `executeResendDispatch`, bulk = batched `transitionDispatch` |
| **Delivery metrics** (open / click / bounce → Performance Learning Loop) | ⚠️ | `delivered`/`failed` wired via `campaign_events`; **open/click rates need Resend delivery webhooks** (not yet ingested) |
| **Channel filter** (All / Email / SMS / Social) | ✅ (UI) | client filter over `campaign_dispatches.channel` |
| Payload preview + provider + **timeline** | ✅ | `payload` (subject/html/text) · `provider`/`provider_message_id` · `campaign_events` (`dispatch_queued`/`_scheduled`/`_sent`/`_delivered`/`_failed`) |
| **SMS / social** dispatch | 🔨 (shown "not wired") | channel text accepts them but there is **no** `executeSmsDispatch`/social executor; `blocked_actions:["send_sms","publish_social_post"]` |
| **Scheduled** send | ⚠️ | `scheduled_for` + `scheduleDispatchAction` record it, but **no cron executor** auto-sends — operator confirms manually |
| Per-recipient drilldown | 🔨 | `outbound_dispatches` (per-recipient, `approval_item_id`/`contact_id`/`idempotency_key`/`provider_message_id`, status incl. `blocked_pending_approval`/`blocked_compliance`) **exists but is unused** by the Outbox UI — the "close the loop" bridge from approved asset → per-contact rows isn't built |
| **Board** kanban (Queued → Running → Needs approval → Blocked → Done) + owner badges (Arc/You/System) | ✅ | `/board` · `getAgentOperationsDashboard` (`src/lib/agent-operations/read-model.ts`) over **`agent_tasks`**, grouped by `owner_kind` |
| "Needs approval" task → Review in surface | ✅ | gates on `approval_items` (needs_review/pending_approval); deep-links to Campaigns/Personas |

**Net-new:** SMS/social executors; a scheduled-send cron (`campaign_dispatches WHERE status='scheduled' AND scheduled_for<=now()` → `executeResendDispatch`); reconcile the per-recipient `outbound_dispatches` into the Outbox (the two-table debt is noted in-migration). Everything else is the wired `campaign_dispatches`/`agent_tasks` read-models, restyled. Cross-links: Board needs-approval → Campaigns/Personas.

---

## Screen: Settings — `build-settings.html` (mockup 15)

A grouped settings shell (`/settings?section=`) — confirmed by an Explore scout to be **extensively wired** (14 real sections). The mockup ships 12 in 3 groups, accessed via the rail's ⚙ cog.

| Section | State | Backing |
| --- | --- | --- |
| **Overview** (workspace-at-a-glance: connection/team/runner/usage tiles + "needs attention" deep-links) | ✅ | derived from the section read-models; tiles route to sections |
| **General** (workspace name, type, industry, support email) | ✅ | `app_settings` (key/value) via `saveGeneralSettingsAction`; `getAppSettings` |
| **Appearance** (accent / density / motion) | ✅ | `business_profiles.accent`/`density`/`motion` + `app_settings`; live `--accent` swap demoed |
| **Team** (members, roles, pending invites, invite form) | ✅ | `workspace_memberships` + `workspace_invites`; roles owner/admin/marketer/reviewer/member/viewer (`workspace-roles.ts`); `issueWorkspaceInviteCode` → `sendBrandedEmail` (Resend); `updateWorkspaceMemberRole`/`removeWorkspaceMember`; `workspace_audit_events` |
| **Workspaces** (switcher) | ✅ | `workspace_memberships` + `ACTIVE_WORKSPACE_COOKIE` via `setActiveWorkspaceAction` |
| **Connections** — a **30+ integration marketplace** (search + category chips: Social / Email & SMS / CRM / Analytics / Creative / Productivity) | ✅ live + 🔨 catalog | **Live: Gemini, Higgsfield, Resend.** Framework: `CONNECTOR_REGISTRY` (`domain/connectors.ts`, 2 entries today) + `workspace_connectors` + **Vault** creds; `connectConnectorAction`/`setConnectorEnabledAction`/`testConnectorAction`; `computeConnectorStatus`. The catalog cards (socials, Mailchimp/Klaviyo/Twilio, HubSpot/Salesforce, GA/Segment, Canva/Figma, Slack/Notion/Zapier…) connect via the **same per-workspace framework** as loaders ship (Slice B / Phase 3 OAuth). **Social posting + email sending stay approval-gated** (`blocked_actions`). Apollo removed per design |
| **Runner & tokens** (connection health, API tokens, setup bundle) | ✅ | `agent_connections` (`resolveAgentConnection`/`recordAgentSeen`) + `agent_api_tokens` (`issueAgentToken` shown-once / `revokeAgentToken` / `checkAgentBearer`); `generateAgentSetupBundleAction` |
| **Media models** — full **44-model roster** (22 image / 19 video / 3 audio) w/ category tabs + search + per-category default override; "Arc's pick" = recommended | ✅ | `HIGGSFIELD_MODELS` (`domain/higgsfield-models.ts`, validated vs live MCP — 59 incl. 3D/extra-TTS) + `resolveHiggsfieldModel(category, override)`. Generic "real **brand** media" (BSR removed) |
| **Behavior** (autonomy toggles; **send/publish/spend = locked**) | ✅ | reasoning-core config; the outbound row is non-configurable (enforced in `executeResendDispatch`) |
| **Account & security** (operator identity, gate, sign-in methods) | ✅ | operator gate (`OPERATOR_ACCESS_TOKEN`) + `/api/auth`; passkey 🔨 (stub), Google ⚠️ (route exists, not surfaced) |
| **Usage & billing** (inline summary + report link) | ⚠️ | `loadWorkspaceUsage` / `GET /api/v1/arc/usage` power the separate `/usage` page; the **inline-in-settings summary is the build gap** |
| **Notifications** | 🔨 (tagged scaffold) | panel exists; no delivery action wired |
| **System status** (services health) | ✅ | `getAppStatus` / `GET /api/auth/status` |

**Net-new:** inline usage summary in Settings; notifications delivery; passkey/Google surfaced in Account. Everything else is wired actions, restyled. Cross-links: rail ⚙ → Settings; Connections feeds Studio/Arc; Brand has its own page (this is the workspace/agent/account layer).

---

## Screen: Sign in — `build-signin.html` (mockup 16)

The operator login. Split layout: a brand panel (the "Agent does the work · Human approves · Database remembers" principle) + the form.

| Element | State | Backing |
| --- | --- | --- |
| Email + password sign-in (with validation) | ✅ | operator gate · `POST /api/auth/sign-in`; `OPERATOR_EMAIL`/`OPERATOR_PASSWORD` or Supabase auth (`ARC_AUTH_MODE`) |
| Remember me | ✅ | SSR cookie adapter · `arc-remember` cookie |
| Continue with Google | ✅ | `/api/auth/sign-in/google` (wired; dashboard-gated) |
| Use a passkey | 🔨 (tagged "soon") | route is a stub until a provider is configured |
| Forgot password | ✅ | reset link via branded email (Resend) |
| "Set up your workspace" → **Sign up** | ✅ (UI) | links to account creation |

## Screen: Sign up — `build-signup.html` (mockup 16b)

Account creation — same split layout + the real **`EtheralShadow`** shader as Sign-in. Comes **before** Onboarding (auth flow: **Sign up → Onboarding → Home**).

| Element | State | Backing |
| --- | --- | --- |
| Create account (full name, work email, phone, password + Terms) | ✅ | `/sign-up` · operator/Supabase auth user creation; validation client + server |
| Continue with Google | ✅ | `/api/auth/sign-in/google` (OAuth sign-up) |
| → Onboarding on success | ✅ | first-run `/start` after the account exists |
| "Already have an account? Sign in" | ✅ (UI) | → Sign in |

## Screen: Onboarding — `build-onboarding.html` (mockup 17)

First-run wizard (3 steps) — the **paste-website → brand** flow as the very first action, tying onboarding to the Brand intake.

| Step / element | State | Backing |
| --- | --- | --- |
| **Workspace** (name, business type, industry) | ✅ | `app_settings` + `setActiveWorkspace`; business type configures personas/signals/templates |
| **Brand** — paste website → Arc analyzes → preview (logo, palette, voice, proof, "23 facts") | ✅ | `start/analyzeWebsiteAction` → `fetchBrandSignalFromUrl` (SSRF-guarded) → preview; facts land review-gated in the Brain |
| "I'll do this later" skip | ✅ | brand can be added later in Settings → Brand |
| **Goals** — multi-select "what should Arc work on first?" (leads / win-back / launch / social / convert, ≥1) | ✅ | sets the initial opportunity-scan + first-campaign focus |
| **Ready** — what Arc does next (scan → draft → wait for yes), reflects chosen goal | ✅ (copy) | accurate to the never-auto-outbound loop |
| Enter Arc | ✅ | `confirmBrandAction` + `markBrandCaptured` → Home |

---

## The "broad for every business" foundation

The framework is universal; **breadth = pluggable signal detectors per business type.** A `business_type`/vertical chosen at onboarding configures: personas, **which signal detectors run** (weather, competitor, intent, lifecycle…), the metric set, and opportunity/campaign templates. Same components, different signals — this is what every gallery screen demonstrates via the workspace switcher.

## Backend builds roadmap (the 🔨 items, prioritized)

1. **Pluggable signal detectors** beyond cold-lead (`detectColdLeadOpportunities` is the only one today). *The breadth unlock — do first.* Each detector emits the same `OpportunityRecord` shape with richer multi-source `evidence`.
2. **Per-workspace vertical config** (`business_type` + templates) — drives detectors/personas/metrics.
3. **Audience sizing** (count + value for a persona/segment).
4. **Projection/forecast model** ("projected impact").
5. **Draft-preview pre-generation** (so opportunities show a real draft before "Create campaign").
6. **Similar-play matching** (the learning loop) over the performance read-model.
7. **Multi-step approval routing + expiry** (extends the single operator gate).

Each gallery screen gets a section here as it's designed; nothing gets wired until its row is ✅ or its 🔨 is built.

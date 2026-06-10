# Mark-First Rebuild — Design Spec

- **Date:** 2026-06-10
- **Status:** Approved for planning (pending spec review)
- **Author:** Evan Reppeto (with Claude)
- **Topic:** Rebuild the Big Shoulders Growth Engine experience around Mark (the Hermes agent), on top of the existing backend.

---

## 1. Why

The app sprawled into ~15 top-level pages — Today, Activity, CRM, Personas, Outbox, Gallery, Reports, Data Foundation, AI Studio, and more — most of them "scaffold-mode" previews that write no data. That structure was built around *nouns the business has*, not around *what the app is for*. What it is for is **Mark**: he finds leads, drafts campaigns and ads, and the operator approves. A flat nav of nine sections buries the one thing that matters.

This is a **reset of the experience, not the engine.** What the operator hates is the look, organization, and feel. What is genuinely valuable — and stays — is the backend: domain logic, the Supabase schema, the Hermes orchestrator, and the wired campaigns + vault persistence. We build a new Mark-first shell on top of the engine that already works.

## 2. Goals

- The app **opens into Mark.** Mark is the front door and the organizing principle.
- Mark **produces** (campaigns, ads, leads) and the operator **approves** — that loop is the spine.
- A **non-technical teammate** can operate the whole thing by answering Mark, not by configuring a console.
- Mark can run **autonomously** — on demand, on a schedule, and on events — under controls that are **real and enforced**, never decorative.
- The supervision layer is **agent-agnostic** so the product could later accept a different agent, without building that capability now.
- A new, **professional, distinctive** look: minimalist black & gold.

## 3. Non-goals (explicitly out of scope for this work)

- Multi-tenancy, billing, per-customer isolation.
- A plugin marketplace or public SDK for third-party agents.
- Rebuilding the domain logic, Supabase schema, or Hermes orchestrator.
- Deleting the old pages. They are **hidden but preserved on disk** for reference.
- Hard-blocking old routes (they remain reachable by direct URL; only nav entry points are removed).

## 4. Keep vs. rebuild

| Keep (the engine) | Rebuild (the experience) |
| --- | --- |
| `src/domain/` pure logic (personas, scoring, lead-ingestion, campaign-revisions, etc.) | The app shell / nav / IA |
| Supabase schema + migrations | Every page's UI |
| Hermes orchestrator (`src/lib/hermes/orchestrator`) + `/api/v1/hermes/runs` | The design language |
| Campaigns persistence (`src/lib/campaigns/{read-model,decisions,revisions}`) and `domain/campaign-revisions` | How creation, approval, and autonomy are surfaced |
| Vault notebook wiring | — |
| Operator auth (`proxy.ts`, `requireOperator()`) and API bearer tokens | — |

New code is **additive on top of the engine**; we extend the engine only where a control needs an enforcement path (Section 11) or a new durable object (directives, policy).

## 5. Design language — Obsidian & Gold

- **Palette:** warm near-black canvas (`#16161a` / `#101013`), muted antique gold accent (`#c8a24a`), warm ivory text (`#f1ede2`), hairline borders (`#2c2c33`). Status colors: green for live (`#7fb89a`), gold for "needs you," a muted slate-blue for event triggers (`#7e9cc4`).
- **Type:** serif display for Mark's voice and headlines (Fraunces / Newsreader); Inter for UI/body. Headlines feel editorial, not generic.
- **Wordmark:** **"Big Shoulders"** with **"Marketing"** as a spaced, gold, uppercase sub-line.
- **Restraint:** no emojis, no equal 3-column dashboard rows, no neon/purple "AI" aesthetic. Premium, calm, low-fatigue for long operator sessions.
- `DESIGN.md` will be updated to this palette (it currently describes Command Charcoal / Restoration Red); the "no emoji / no equal-3-col / no neon" taste rules carry over.

## 6. Information architecture

Top-level nav is **two items**: **Mark** and **Campaigns**. Everything else is hidden (preserved on disk).

- **Mark is a place, not just a chat.** It has internal views:
  - **Briefing** — the landing digest (what Mark did, what needs you, new leads).
  - **Chat** — direct Mark, interrupt him, hand off tasks.
  - **Board** — the kanban of autonomous work in flight.
  - **Directives** — Mark's standing orders, schedules, and the autonomy/guardrail settings.
- **Campaigns** — the library of everything produced, organized by approval lifecycle.

"Mark" is a **display name mapped from one place** (so a future reseller could rebrand); the underlying agent identity is generic.

## 7. Front door

- **Land in the Briefing** (Mark's home): Mark reports what he did, what needs approval, and the leads he surfaced — triaged into stacks so nothing is hunted for. An "Ask Mark…" composer sits at the bottom.
- **Working on a job uses the Split copilot:** click any item, or send Mark a new task, and drop into **chat-left / live-canvas-right**. You watch the work build and approve it in place.
- **Conversation-first is the left pane** of the split copilot — not a separate mode.

## 8. Campaigns surface

- A **library grouped by lifecycle**, not a flat table: **Awaiting your approval** (top, glowing gold, "Needs you" pill) → **Live** (green) → **Drafts in progress** (quiet grey). Filter chips: All / Awaiting / Drafts / Live / Archived.
- **Every row is visibly the agent's work** ("M" chip, "Drafted by Mark · 2h ago") — reinforcing produce-and-approve.
- Editorial styling: serif campaign names, generous rows, no equal-column grid.
- Primary action: **"＋ Ask Mark to build one."** Clicking a row opens the split copilot to review/approve.

## 9. Creation model — two doors, one room

The **campaign is the durable object.** Two dimensions are independent: *who originated it* (you or Mark) and *who is working on it right now* (you editing, or Mark drafting). There is no "Mark campaign" vs "my campaign" — just a campaign and a shared workspace.

Three ways in, one shared canvas:
1. **Mark-led** — "Ask Mark to build one." He drafts from a goal; you review.
2. **You-led, Mark-assisted** — start a brief or a blank campaign, then hand any piece to Mark (`@Mark draft the email body`, `find the audience`).
3. **You-led, fully manual** — build it yourself; Mark optional.

In the canvas you can **edit any field directly** *and* **hand any piece to Mark** ("⤷ hand to Mark"), with chat on the left to direct him. Authorship is visible inline ("you typed this" / "Mark is drafting…").

This generalizes the existing ContentEngine flow: "request revision" already *is* the operator directing Mark; we extend it to "send Mark a task on this campaign" and add an `origin: operator | mark` field.

**One approval gate** guards everything before it goes outbound, regardless of origin. When *you* authored a campaign, the gate is a one-click "Approve & launch" — not a review of your own work. The gate is "the launch button," not bureaucracy: one chokepoint, one audit trail, one state machine.

## 10. Autonomy model

**Mark has three gears (how work is triggered):**
1. **On-ask (reactive)** — you tell him in chat.
2. **On-schedule (cron)** — recurring jobs (daily lead sweep, weekly campaign, monthly refresh).
3. **On-event (triggers)** — system changes he reacts to (new lead → score/route/draft; job completed → +30d review-request campaign; partner referral → thank-you; open-rate drop → propose revision).

**Standing directives** are durable goals that any gear can serve ("keep 5 campaigns live," "find 10 emergency leads/week," "re-engage landlords lapsed 90+ days"). Mark **chains** agentically within a directive: found leads → drafts outreach → queues it.

**The Operations Board (kanban)** is where the operator watches autonomous work: **Queued → Mark working → Needs you → Scheduled/Live.** Standing directives run across the top with trigger badges and live status. Triggers are color-coded (Cron gold, Event blue, Goal green, Asked grey).

**Supervised autonomy, not unbounded.** The leash is **a net, not an approval queue**:
- **Caps, not gates** — recipients/send, outbound/day, ad-spend/day + total ceiling, CRM writes/run. Under the cap Mark proceeds; above it he escalates.
- **Kill switch** — "Pause Mark" freezes all autonomous action instantly; always one click away.
- **Staging window** — outbound holds ~15 min before sending (cancellable); CRM writes are versioned/undoable.
- **Confidence + anomaly self-pause** — Mark proceeds auto only when confident; bounce spikes / odd audience sizes / cost anomalies make him pause himself and escalate.
- **Full audit** — every autonomous action logged and attributable.

With the net in place, the board's gold column means **"Mark escalated"** (exceptions only), not "approve all my work." Routine work flows to Live on its own.

Other lanes Mark can own under the same net (future directives, same mechanism): respond to inbound leads, pace/reallocate ad budget to winners, run A/B tests and pick winners, time nurture/follow-up sequences, post-job review requests, weekly performance digests, and learning from approve/reject signals to tune future drafts.

## 11. Enforcement architecture — controls that actually control Mark

**The hard rule: every control maps to a deterministic, unit-tested policy the engine reads before acting. Nothing ships as decoration.** This is the line that prevents repeating the scaffold-mode mistake.

**Principle: Mark proposes; the app disposes.** The LLM/Hermes brain is never given the capability to directly send, spend, or write records. It can only emit an **intent**. Every intent passes through a deterministic **policy gate**:

```
Mark emits intent → Policy Gate (reads mark_policy) → execute | stage | escalate | refuse (+ plain-English reason)
```

A limit in Mark's *prompt* is a suggestion an LLM can ignore; a limit in the *gate* is enforced — the capability lives in the gate, not the brain. Concretely, following the existing "deterministic, app-owned, unit-testable" convention:

- **`mark_policy`** record — trust mode, caps, per-lane leashes, kill-switch flag. Written by the settings UI, read by the engine. (New Supabase migration.)
- **`evaluateAction(intent, policy)`** — a **pure function in `src/domain/`** returning `execute | stage | escalate | refuse` + reason. Pure and deterministic → **unit-tested in `src/domain/__tests__/`**. This is how we *prove* a cap of 2,000 holds at 2,001.
- **Hermes orchestrator** calls `evaluateAction` before every effectful tool; the kill-switch flag is checked first.
- Allowed actions write an **audit row**; escalations create rows that surface in the board's "Needs you" column and the briefing.
- **No control ships without (a) its enforcement path through the gate and (b) a test asserting it bounds behavior.**

## 12. Simplified controls for a non-technical team

- **Trust *modes*, not knobs:** **Cautious / Balanced / Trusted**, in plain English. Each mode is a named bundle of the underlying caps/leashes (set by whoever configures it). The everyday user picks how much they trust Mark.
- **Global Pause** ("Hold Mark") is the simple panic switch alongside the modes — that *is* the one-switch option, kept as the kill switch rather than a confusing standalone toggle.
- **Self-describing summary:** under the mode, a readable list — green ✓ for what Mark does alone, gold "?" for what he checks first ("Sends to up to 2,000 people, then asks you"). The settings explain themselves.
- **Advanced caps** hidden behind an "Advanced limits" link for whoever set it up.
- **Dead-simple escalation inbox:** when Mark escalates, it is one card, one plain-language reason, two big buttons ("Approve send" / "Not now"). This is the *only* screen a non-technical teammate must understand.

The Mark-first model is what makes this possible: the team doesn't operate a console — they answer Mark.

## 13. Architecture & extensibility — two horizons

- **Horizon 1 (build now):** a focused internal product for the team. Mark = the Hermes agent. Everything in this spec.
- **Horizon 2 (design-for, don't-build):** a sellable product where another developer plugs in their own agent and gets the supervision layer.

Horizon 2 is a **seam, not features.** The durable, agent-agnostic product is the **Supervision & Operations Layer**: briefing, chat, campaigns library, kanban board, approval gate, policy/guardrails engine, audit log, trust modes. None of it is Hermes-specific.

What we do now (cheap):
- Route all agent calls through an **Agent Port** — "intents in, progress/results out." The app speaks to *an agent*, never to Hermes by name. Hermes is the default adapter. (The existing `/api/v1/hermes/runs` bearer-gated API is already this seam.)
- Keep the gate / board / approvals / audit **ignorant of which agent** is behind the port.
- Load agent **endpoint + token from config** (already true via env).
- Map the name **"Mark"** and the wordmark from **one place**.

What we do NOT build now: multi-tenancy, billing, per-customer isolation, marketplace, SDK.

## 14. Data model changes (additive migrations)

1. **`mark_policy`** — trust mode, caps (recipients/send, outbound/day, ad-spend/day + total, CRM writes/run), per-lane leashes, `paused` flag. Single-row (operator-scoped) for now.
2. **`mark_directive`** — standing orders: name, trigger type (`ask | cron | event | goal`), schedule/condition, target lane, active flag, last-run.
3. **`mark_run`** — an execution of a directive or ad-hoc task: status (`queued | working | needs_you | scheduled | live | done | refused`), trigger, origin, links to produced output (campaign, leads), confidence, escalation reason.
4. **`mark_action_audit`** — every effectful action Mark attempted: intent, gate decision, reason, actor, timestamp.
5. **`campaigns`** extension — add `origin: operator | mark`.

All guarded by `isSupabaseAdminConfigured()`; the app degrades gracefully without env vars, consistent with the existing pattern. Routing/scoring/policy stay in the app layer, not Postgres.

## 15. Testing strategy

- **Policy gate** is the crown jewel of test coverage: pure `evaluateAction` unit tests in `src/domain/__tests__/` covering each cap boundary, each trust mode, the kill switch, confidence threshold, and anomaly conditions. A cap is not "done" until a test proves it holds at the boundary.
- Domain logic for directives/run-state transitions is pure and unit-tested.
- Persistence layers follow the existing wired-feature shape (vault/campaigns): `"use server"` actions gated by `requireOperator()` + `isSupabaseAdminConfigured()`, persisting through `src/lib/<feature>/`, with `revalidatePath`.
- Follow TDD: tests before implementation for every control's enforcement path.

## 16. Rollout / migration

1. **Hide old pages** (already mostly done): nav = Mark + Campaigns; old routes preserved on disk, reachable by URL.
2. Build the **new shell + design language** (Obsidian & Gold) as the app frame.
3. Build **Campaigns** redesign on the existing campaigns persistence.
4. Build **Mark** as a place: Briefing → Chat → Board → Directives.
5. Add **policy gate + mark_policy + audit** and wire the Hermes orchestrator through it (enforcement first, UI second).
6. Add **directives + triggers (cron/event)** and the board.
7. Update `DESIGN.md` and `CLAUDE.md` to reflect the new IA and palette.

Each step ships behind the wired-feature shape; no control is exposed in the UI before its enforcement path and test exist.

## 17. Decisions log

- **Reset depth:** new experience, same engine. ✔
- **Palette:** Obsidian & Gold, serif headlines, "Big Shoulders Marketing" wordmark. ✔
- **Nav:** Mark + Campaigns only; rest hidden, preserved. ✔
- **Front door:** Briefing → Split copilot. ✔
- **Creation:** two doors, one canvas, single approval gate (one-click for operator-authored). ✔
- **Autonomy default:** Full auto desired; implemented as **supervised autonomy** (caps + staging + kill switch + audit). Trust modes Cautious/Balanced/Trusted + global Pause. ✔
- **Enforcement:** hard rule — every control = deterministic, unit-tested policy; no decoration. ✔
- **Extensibility:** agent-agnostic supervision core behind an Agent Port; Hermes = default adapter; no multi-tenancy/billing/marketplace now. ✔

## 18. Open questions (for planning / later)

- Exact default cap values (placeholders in §10–12; mark "operator-set, defaults TBD" until tuned).
- Event-trigger transport: reuse `/api/v1/leads/ingest` as the first event source vs. a generic event bus.
- Cron mechanism (Supabase `pg_cron` vs. external scheduler hitting `/api/v1/hermes/runs`).
- Whether the staging window is global or per-lane.

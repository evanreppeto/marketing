# How this system works

A plain-English map of Arc's moving parts — the environments, how code ships, how
the database works, what's safe to touch, and the handful of things you must never
break. **If a question about how the system works ever stops you, the answer
should live here.** Read this first; it saves re-deriving your own setup.

> Audience: you (solo dev), a future teammate on day one, and any AI assistant
> working in this repo. Keep it current — when the system changes, change this.

---

## 1. The 30-second overview

**Arc** is a multi-tenant marketing operating system: it finds source-backed
opportunities, drafts approval-gated campaign packages, organizes creative, and
learns from results — on behalf of a workspace (BSR/Summit are demo tenants).

**Stack:** Next.js 16 + React 19 (app) · Supabase / Postgres (database + auth) ·
Vercel (hosting) · pnpm (package manager). A separate cloud agent (`apps/arc-runner`)
is the "brain" that actually runs Arc's turns.

**Code layering** (keep to it): `src/domain/` = pure business logic, no I/O →
`src/lib/<feature>/` = I/O, persistence, read-models → `src/app/<route>/` = the
views. Import shared logic from `@/domain`. Don't put I/O in `domain/`, don't put
business rules in `app/`.

---

## 2. Environments — the map (read this one twice)

Three copies of the app, **completely separate databases**. Nothing syncs between
them automatically (see §3).

| | **Production** | **Staging** | **Local sandbox** |
|---|---|---|---|
| URL | arc-studio.ai | marketing-staging-big-shoulders-restoration.vercel.app | localhost:6001 (`pnpm sandbox`) |
| Vercel project | `marketing` | `marketing-staging` | — (runs on your machine) |
| Supabase DB | **marketing-engine** (`qqbecyrhnowmooyjiztz`) | **marketing-staging** (`zheuujpxsxmisnrlsriv`) | local Supabase (Docker) |
| Data | **REAL** | fake (seeded) | fake (seeded) |
| Who can get in | real users (login) | you + team (login wall) | just you |
| Login | your real account | `owner@bsr.test` (password in the seed script / your password manager) | same seeded accounts |

**How the live site's database is confirmed:** the Vercel `marketing` project's
`NEXT_PUBLIC_SUPABASE_URL` env var points at `qqbecyrhnowmooyjiztz` = marketing-engine.
That's production. (It's stored as a "sensitive" var, so read it from the Vercel
dashboard, not an API.)

**Staging privacy note:** staging is private via the app's own **login wall**
(`ARC_AUTH_MODE=supabase`), not a Vercel-level lock — the Vercel plan can't lock
production deployments. Outsiders hit the login page and see nothing.

---

## 3. How code reaches production (the deploy flow)

- **Merge to `main` → Vercel auto-deploys BOTH `marketing` (prod) and
  `marketing-staging` (staging).** Both projects track `main`.
- **The golden rule: code flows automatically; the database does NOT.**
  - **Code** (what the app does): auto-deploys on merge, to separate copies.
  - **Data** (the actual records): never crosses environments. Prod has real
    data; staging/local have fake data. A new real customer never appears in
    staging, and nothing you do in staging/local can ever touch production.
  - **Database structure** (tables/columns): also does not auto-sync — you carry
    it across deliberately, via migrations (§4).

So: you can do anything in staging or local and it can never affect real customer
data. That isolation is the safety guarantee.

---

## 4. How the database works

Postgres, via Supabase. Managed as **migrations** — versioned files in
`supabase/migrations/`.

- **The baseline** — `supabase/migrations/00000000000000_baseline.sql` is the
  canonical, single-file schema that builds a fresh database in one pass. The 72
  older migrations are archived in `supabase/migrations-legacy/` (they had drifted
  and could no longer rebuild a fresh DB — that's why the baseline exists).
- **To change the schema** (e.g. add a column): write a NEW migration file on top
  of the baseline, then apply it to each environment in order:
  **local sandbox → staging → production.** Same file, run in each place → they
  stay in sync. Nothing structural reaches prod until *you* run it there.
- **Data is separate per database.** Seeding fake data (staging/local) uses the
  `scripts/seed-*.mjs` scripts.
- Both prod and staging have been reconciled to recognize the baseline, so future
  `supabase db push` runs cleanly.

---

## 5. The non-negotiables (your blast radius)

**The rule that never bends:** *No outbound action — send, publish, launch, spend,
contact — happens without explicit human approval.* Arc drafts and recommends;
a human approves; only then does anything reach the outside world. This is
enforced in code (Arc's API literally can't import the send/launch paths) and it
must stay that way.

**The short list of irreversible things — guard these, move carefully:**
- The **production database** (`marketing-engine`) — real customer data.
- **Real outbound keys** — Resend (email), Meta/LinkedIn/X (social). A wrong move
  here reaches real people. (Staging deliberately has these blank.)
- **Secrets** — service-role keys, API tokens, Vercel tokens.
- The **production Vercel project** and its domains.

**Everything else is reversible** — a bad commit reverts, a bad deploy rolls back,
a bad row restores. So: be slow and careful on the list above; move fast on the
99% that isn't on it.

---

## 6. How Arc works (the agent)

Arc is the marketing operator, not a chatbot. Shape of every action:
**Arc drafts → the item enters an approval gate → a human approves / declines /
requests a revision → only approved items unlock the next step.**

**How Arc chat gets answered** differs by environment:
- **Production:** the cloud runner (`apps/arc-runner`, deployed separately) is woken
  by a webhook (`ARC_RUNNER_URL`) the moment a chat is sent; it runs Arc and posts
  the reply back to `POST /api/v1/arc/messages`.
- **Staging:** a tiny serverless "fake Arc" (`arc-fake-runner`) answers with
  scripted, deterministic replies — no LLM, no cost. (So staging Arc chat is a
  demo, not real intelligence.)
- **Local:** `scripts/sandbox/fake-arc.mjs` does the same, on your machine.

---

## 7. Testing & the safety net

Keep it green; never merge a red PR.

- `pnpm test` — the unit/integration suite (~1,700 tests): domain logic, API
  routes, the approval/campaign/Arc-safety rules.
- `pnpm test:e2e:staging` — the **guardrail suite** against the live staging site:
  the login wall holds, an operator can sign in and data renders, the Opportunity
  inbox is populated, the campaign approval gate is present.
- `pnpm test:e2e` — the local screens smoke test.
- **CI** (`.github/workflows/`): `ci.yml` runs typecheck + lint + tests + build on
  every PR; `e2e-guardrails.yml` runs the guardrails against staging after merges
  to main and on a schedule.

If CI is red, that's your only teammate telling you something's wrong — fix it or
understand exactly why it's a false alarm before merging.

---

## 8. Secrets & environment variables

- Env vars live in **Vercel** (per project) — never committed to git. Production
  has the full set (Supabase + outbound + integrations); staging has a minimal,
  safe subset (Supabase + `ARC_AUTH_MODE=supabase`, with all outbound keys
  deliberately omitted).
- **Never commit:** `.env.local` (gitignored), service-role keys, API tokens,
  Vercel tokens.
- **Rotating a secret:** Supabase keys → Supabase dashboard → Settings → API;
  Vercel tokens → vercel.com/account/tokens. After rotating, update the env var in
  Vercel and redeploy.
- The two auth mechanisms (don't conflate): **human login** (operator/user, via
  Supabase auth) vs **programmatic bearer tokens** (`ARC_AGENT_API_TOKEN` env or
  the `agent_api_tokens` table) used by the runner. Multi-tenant isolation is
  enforced by Postgres row-level security (RLS).

---

## 9. Common tasks (mini-runbook)

- **Add a database field** → write a migration in `supabase/migrations/`, test on
  the local sandbox, apply to staging, then production. Never edit shipped
  migrations; add a new timestamped file.
- **Spin up a full local backend** → `pnpm sandbox:up` (once), then `pnpm sandbox`
  (app + fake Arc worker). See `SANDBOX.md`.
- **Re-seed fake data** → the `pnpm seed:*` scripts (or `scripts/sandbox/seed-all.mjs`).
- **Roll back a bad deploy** → Vercel dashboard → the project → Deployments →
  promote a previous good deployment. Or revert the commit and merge.
- **Run the tests** → `pnpm test` (units) and `pnpm test:e2e:staging` (guardrails).

---

## 10. Gotchas & open gaps (the scar tissue)

Things that already bit us — so they don't bite twice:

- **Migrations couldn't rebuild a fresh database** (they'd drifted from the live
  DB over time). Fixed by the baseline (§4) — build fresh environments from it,
  not by replaying the old files.
- **Worktrees/branches fall behind a fast-moving `main`.** This repo moves fast
  (dozens of commits a day). Rebase your branch onto `main` before merging.
- **A PR once merged with red CI.** Don't — respect the red.
- **Staging's privacy is the app login wall**, not a Vercel lock (plan limit).
- **Staging Arc chat is scripted**, not real AI (fake worker).

Known gaps worth closing eventually:
- The guardrail tests run **after** merge / on a schedule, not on each PR before
  merge (true per-PR gating needs a preview deploy per PR).
- A few cosmetic schema apply-warnings on the baseline.
- Real-AI Arc on staging (needs a model key + a runner pointed at staging).

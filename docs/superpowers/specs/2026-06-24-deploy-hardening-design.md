# Deploy Hardening — Design

**Date:** 2026-06-24
**Goal:** Make shipping safe and understood — turn the CI we just added into an enforced gate, and put the manual, easily-forgotten deploy steps in front of the operator every time. **No product-behavior change.**

## Context

The deploy *pipelines* already exist and work:
- **App → Vercel**, auto-deploying from `origin/main` (plus a cron in `vercel.json`).
- **Arc runner → Cloud Run**, auto-deployed by `apps/arc-runner/cloudbuild.yaml` on push to `main` (filtered to `apps/arc-runner/**`); manual/config deploys via `apps/arc-runner/deploy-cloud-run.sh`; documented in `docs/arc-runner-cloud-run-runbook.md`.
- CI (`.github/workflows/ci.yml`, added in PR #251) runs typecheck/lint/test/build on every PR and push to `main`.

The gaps are enforcement and documentation, confirmed by inspection:
1. **`main` is unprotected** (`gh api .../branches/main/protection` → 404). CI runs but does not block a failing PR or a direct push from reaching `main` — and `main` auto-deploys. CI is advisory, not a gate.
2. **No checklist for the manual steps.** Supabase migrations are applied to the prod DB by hand; prod has broken before from *schema drift* (code shipped without its migration). Nothing reminds the operator at merge time. There is no PR template (`.github/` contains only `workflows/`).
3. **Post-deploy smoke exists but is undocumented.** `pnpm smoke:http <base-url>` checks key pages return expected content, but it isn't part of any written deploy flow.

## Non-goals

- Automating prod migration application from CI (would require prod DB credentials as CI secrets; riskier — deferred).
- Building new deploy pipelines (they already exist).
- Any app/runner code or behavior change.
- Adding required human PR *reviewers* (this is a solo operator; requiring a second approver would block all merges).

---

## Workstream 1 — Protect `main`

Configure GitHub branch protection on `main` so the CI check must pass before merge, via `gh api` (PUT `repos/evanreppeto/marketing/branches/main/protection`). Intended settings:

- **Required status checks:** the CI job must be green. The exact check *context* string (likely `verify`, possibly `CI / verify`) will be read from PR #251's actual checks before setting — do not guess.
- **`strict: true`** — branch must be up to date with `main` before merging (prevents merging stale branches that pass CI in isolation but break on `main` — a failure mode in this repo's history).
- **Require a pull request before merging**, with `required_approving_review_count: 0` — PRs are required (so every change runs CI) but the solo operator can self-merge without a second reviewer.
- **`enforce_admins: false`** — the owner can override in a genuine emergency without being locked out. (Pragmatic for a solo maintainer; can tighten later.)
- Leave force-push and deletion protection at GitHub defaults for a protected branch (both disabled/blocked).

**Ordering:** set this *after* PR #251's CI run completes, so the check context exists and is selectable.

**Verification:** re-run `gh api .../branches/main/protection` and confirm it returns the settings (no 404); confirm the required check context matches the CI job.

---

## Workstream 2 — `DEPLOY.md` (single source of truth)

Create `DEPLOY.md` at the repo root. One page covering:

- **App (Vercel):** auto-deploys from `origin/main`; where to watch a deploy; the `vercel.json` cron; where env vars live (Vercel project settings) with a pointer to `.env.example` for the list.
- **Arc runner (Cloud Run):** auto-deploys via `cloudbuild.yaml` on push to `main` touching `apps/arc-runner/**`; config/secret changes go through `deploy-cloud-run.sh`; link `docs/arc-runner-cloud-run-runbook.md` for the full procedure. Note the runner's env/secrets live in GCP (Secret Manager), **not** Vercel.
- **Database migrations (the manual step):** new migrations land in `supabase/migrations/`, but **must be applied to the prod Supabase DB by hand** — they are not auto-applied. State the consequence plainly (code that selects a not-yet-migrated column → broken prod page) and give the apply procedure / where it's run.
- **Post-deploy smoke:** run `pnpm smoke:http <prod-base-url>` (and `pnpm health:supabase` where relevant) and what a green result looks like.
- **Rollback:** one line each — Vercel: redeploy a previous deployment; runner: the image is tagged by commit SHA, redeploy a prior tag (point to runbook).

Accuracy rule: every command/path must be real (verified against the repo). Don't invent env var names — point to `.env.example`.

---

## Workstream 3 — PR template

Create `.github/pull_request_template.md` with a short, skimmable pre-merge checklist so the manual steps surface on every PR:

- [ ] CI is green
- [ ] If this PR adds a `supabase/migrations/` file, it has been (or will be) applied to the **prod** DB
- [ ] Any new env vars are set in the right place (Vercel for the app, GCP Secret Manager for the runner)
- [ ] Smoke-checked (`pnpm smoke:http <url>`) when the change is user-facing
- A brief Summary / Test Plan stub (matching the style already used on PR #251).

---

## Verification strategy

- **W1:** `gh api` round-trip shows protection active with the correct required check; optionally confirm a deliberately-failing PR cannot be merged (UI shows merge blocked).
- **W2/W3:** docs reviewed for accuracy against the real repo; the PR template renders on the next PR. No code impact.

## Risks

- **Wrong status-check context name** → protection would require a check that never reports, blocking all merges. Mitigated by reading the real context from PR #251 before setting, and by `enforce_admins: false` (owner can still merge / fix).
- **Locking out the solo maintainer** → mitigated by `required_approving_review_count: 0` and `enforce_admins: false`.
- **Branch protection needs repo admin** → the `gh` CLI is authenticated as the repo owner (`evanreppeto`); if the API call is rejected for permissions, fall back to documenting the exact settings for the user to apply in GitHub's UI.

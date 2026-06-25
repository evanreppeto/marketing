# Deploy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing CI an enforced merge gate on `main`, and document the manual deploy steps so they can't be forgotten — with zero product-behavior change.

**Architecture:** Two new markdown files (`DEPLOY.md`, `.github/pull_request_template.md`) committed on the current branch, plus one live repo-config action (GitHub branch protection on `main` via `gh api`). The branch-protection step reads the real CI check-context name from PR #251 before setting, so it can't require a check that never reports.

**Tech Stack:** GitHub Actions, GitHub branch protection API, `gh` CLI, Markdown.

**Context for the implementer:** This repo is a pnpm monorepo. App → Vercel (auto from `main`). Arc runner → Cloud Run (auto via `apps/arc-runner/cloudbuild.yaml`; manual via `apps/arc-runner/deploy-cloud-run.sh`; runbook `docs/arc-runner-cloud-run-runbook.md`). CI is `.github/workflows/ci.yml` (job id `verify`). Supabase migrations in `supabase/migrations/` are applied to the prod DB **by hand**. The `gh` CLI is authenticated as repo owner `evanreppeto`. Work from `C:\Users\evanr\marketing\.claude\worktrees\ecstatic-banach-83b3e9`.

---

## Task 1: Create DEPLOY.md

**Files:**
- Create: `DEPLOY.md` (repo root)

- [ ] **Step 1: Confirm the real paths/commands you'll reference exist**

Run:
```bash
ls vercel.json apps/arc-runner/cloudbuild.yaml apps/arc-runner/deploy-cloud-run.sh docs/arc-runner-cloud-run-runbook.md supabase/migrations .env.example
grep -n "smoke:http\|health:supabase" package.json
```
Expected: all paths listed without error; the two scripts appear in `package.json`. If any path differs, use the real one in the doc.

- [ ] **Step 2: Write `DEPLOY.md`**

Create `DEPLOY.md` with these sections (prose may be tightened, but every command/path must be one you verified in Step 1):

```markdown
# Deploying

How this repo ships to production. Two independent deploy targets; one manual step (migrations) that must not be skipped.

## App → Vercel

- Auto-deploys from `origin/main`. Merging to `main` triggers a production deploy.
- Scheduled jobs are declared in `vercel.json` (currently the daily `/api/cron/opportunity-scan`).
- **Env vars live in the Vercel project settings** (not in this repo). See `.env.example` for the full, documented list of what the app reads.
- Watch a deploy: the Vercel dashboard for this project.

## Arc runner → Google Cloud Run

- Auto-deploys via `apps/arc-runner/cloudbuild.yaml` — a Cloud Build trigger on push to `main` filtered to `apps/arc-runner/**`. It builds an image tagged with the commit SHA and rolls it onto the service (env/secrets/scaling are preserved).
- **Config or secret changes** (new env var, new secret, scaling flags) go through `apps/arc-runner/deploy-cloud-run.sh`, not the auto-deploy.
- The runner's secrets live in **GCP Secret Manager**, NOT Vercel.
- Full procedure and one-time setup: `docs/arc-runner-cloud-run-runbook.md`.

## Database migrations (MANUAL — do not skip)

- New migrations are added as timestamped files in `supabase/migrations/`.
- **They are NOT auto-applied.** They must be applied to the production Supabase database by hand, as part of shipping the PR that introduces them.
- If you merge code that selects a column/table a migration adds, but you have not applied that migration to prod, the matching prod page breaks (schema drift). Apply the migration **before or together with** merging the code.
- Apply via the Supabase SQL editor / migration tooling against the prod project (see `docs/` for project specifics).

## Post-deploy smoke check

- After a deploy, run: `pnpm smoke:http <prod-base-url>` — it checks key pages (login, sign-up, /arc, /campaigns) return expected status and content.
- For database connectivity: `pnpm health:supabase`.
- A green run = pages load with expected content. A failure names the failing path.

## Rollback

- **App (Vercel):** redeploy a previous deployment from the Vercel dashboard.
- **Runner (Cloud Run):** images are tagged by commit SHA; redeploy a prior tag (`gcloud run deploy ... --image=...:<old-sha>`). See the runbook.
```

- [ ] **Step 3: Verify links resolve**

Run:
```bash
grep -oE '\b[A-Za-z0-9_./-]+\.(md|json|sh)\b' DEPLOY.md | sort -u | while read f; do test -e "$f" && echo "OK  $f" || echo "MISSING $f"; done
```
Expected: every referenced repo file prints `OK`. (`<prod-base-url>` and bare commands aren't files and won't appear.) Fix any `MISSING`.

- [ ] **Step 4: Commit**

```bash
git add DEPLOY.md
git commit -m "docs: add DEPLOY.md (Vercel + Cloud Run + manual migrations + smoke + rollback)"
```

---

## Task 2: Create the PR template

**Files:**
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Write the template**

Create `.github/pull_request_template.md` exactly:

```markdown
## Summary

<!-- What changed and why. 2-3 bullets. -->

## Test Plan

<!-- How you verified it. -->

## Pre-merge checklist

- [ ] CI is green
- [ ] If this PR adds a file under `supabase/migrations/`, it has been (or will be) applied to the **production** Supabase DB (see `DEPLOY.md`)
- [ ] Any new env vars are set in the right place — Vercel for the app, GCP Secret Manager for the Arc runner
- [ ] Smoke-checked with `pnpm smoke:http <url>` if the change is user-facing
```

- [ ] **Step 2: Verify it's valid and references real things**

Run:
```bash
test -f .github/pull_request_template.md && grep -q "supabase/migrations" .github/pull_request_template.md && grep -q "smoke:http" .github/pull_request_template.md && echo "template OK"
```
Expected: prints `template OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/pull_request_template.md
git commit -m "docs: add PR template with pre-merge deploy checklist"
```

---

## Task 3: Protect the `main` branch

This is a live repo-config action, not a code change. It requires repo admin (the `gh` CLI is authenticated as owner `evanreppeto`).

**Files:** none (GitHub setting via API).

- [ ] **Step 1: Read the real CI check-context name from PR #251**

Run:
```bash
gh pr checks 251 --json name,workflow 2>/dev/null || gh pr checks 251
```
Expected: a list of checks. Identify the check produced by `.github/workflows/ci.yml`. The context name is almost certainly `verify` (the job id). Note the EXACT string shown. If PR #251's CI hasn't run yet, wait for it (`gh pr checks 251 --watch`) — do not guess the name.

- [ ] **Step 2: Apply branch protection**

Using the exact context name from Step 1 (shown here as `verify` — substitute if different), run:
```bash
gh api -X PUT repos/evanreppeto/marketing/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["verify"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null
}
JSON
```
Expected: a JSON response describing the protection (HTTP 200), not an error.

**If it fails:**
- Permission error (403): report it — the account may lack admin. Do NOT force anything.
- Plan-limit error (private repo on a plan without protected branches): report the exact error and FALL BACK to documenting the intended settings in `DEPLOY.md` (a short "Branch protection (apply in GitHub UI → Settings → Branches)" note) so the user can apply them manually. Commit that doc addition.

- [ ] **Step 3: Verify protection is active**

Run:
```bash
gh api repos/evanreppeto/marketing/branches/main/protection --jq '{checks: .required_status_checks.contexts, strict: .required_status_checks.strict, prs_required: (.required_pull_request_reviews != null), enforce_admins: .enforce_admins.enabled}'
```
Expected: shows the `verify` context, `strict: true`, `prs_required: true`, `enforce_admins: false`. No 404.

- [ ] **Step 4: Record the outcome**

No commit needed for the API action itself. In your final report, state whether protection was applied via API or fell back to documentation, and paste the Step 3 verification output.

---

## Final verification

- [ ] **Step 1: Confirm both files exist and the tree is clean**

Run:
```bash
test -f DEPLOY.md && test -f .github/pull_request_template.md && echo "FILES OK"
git status --porcelain
```
Expected: `FILES OK`; clean tree (everything committed).

- [ ] **Step 2: Confirm `main` protection (or documented fallback)**

Run: `gh api repos/evanreppeto/marketing/branches/main/protection --jq '.required_status_checks.contexts' 2>&1`
Expected: lists the CI check context — OR, if the fallback path was taken, confirm `DEPLOY.md` contains the manual branch-protection instructions.

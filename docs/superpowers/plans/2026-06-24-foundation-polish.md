# Foundation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repo legible and protected — remove dead code, add CI that blocks broken code from reaching `main`, and rewrite the docs front door — with zero product-behavior changes.

**Architecture:** Three independent workstreams. (1) Delete the leftover top-level `arc-runner/` Python folder after a reference safety-check, preserving its integration contract under `docs/`. (2) Add a GitHub Actions workflow running typecheck/lint/test/build across the monorepo, made blocking only for checks confirmed green by a baseline step. (3) Rewrite `README.md` and add `ARCHITECTURE.md`.

**Tech Stack:** pnpm workspaces, Next.js 16, TypeScript, Vitest, ESLint, GitHub Actions, Node 20.

---

## Pre-flight (run once before Task 1)

This worktree may not have dependencies installed (worktrees don't share `node_modules`).

- [ ] **Step 1: Ensure dependencies are installed**

Run: `pnpm install --frozen-lockfile`
Expected: completes without modifying `pnpm-lock.yaml`. If it errors that the lockfile is out of date, STOP and report — that is itself a finding (the lockfile is broken on `main`), and the plan's CI is designed to catch exactly this.

---

## Task 0: Establish the CI baseline (do the gates pass today?)

This determines which checks CI can make **blocking**. No code changes — just run and record.

**Files:**
- Create: `docs/superpowers/plans/2026-06-24-foundation-polish-baseline.md` (scratch record of results)

- [ ] **Step 1: Run each root gate and record pass/fail**

Run each, note exit code + a one-line summary in the baseline record file:
```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

- [ ] **Step 2: Run each workspace gate and record pass/fail**

```bash
pnpm --filter ./apps/arc-runner typecheck
pnpm --filter ./apps/arc-runner test
pnpm --filter ./packages/arc-connector test
```
Note: if `--filter` by path errors, use the package names from each `package.json` (`pnpm --filter <name> <script>`).

- [ ] **Step 3: Write the baseline record**

In `docs/superpowers/plans/2026-06-24-foundation-polish-baseline.md`, list each command and PASS/FAIL. This table decides Task 2's `continue-on-error` flags: any command that FAILS today is marked non-blocking in the workflow with a `# TODO: pre-existing failure, make blocking once fixed` comment; passing commands are blocking.

- [ ] **Step 4: Commit the baseline record**

```bash
git add docs/superpowers/plans/2026-06-24-foundation-polish-baseline.md
git commit -m "docs: record CI gate baseline before adding CI"
```

---

## Task 1: Remove dead top-level Python runner

**Files:**
- Move: `arc-runner/arc.md` → `docs/arc-runner-python-legacy-contract.md`
- Delete: `arc-runner/` (whole directory)
- Delete: `com.bsr.arc-realtime.plist` (root) — the launchd file tied to the Python poller

- [ ] **Step 1: Re-confirm nothing live references the folder**

Run:
```bash
grep -rn "arc_chat_core\|arc-runner/poller\|arc-runner/mcp_server\|arc-runner/webhook\|arc-runner/realtime\|com.bsr.arc-realtime" \
  --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.js" --include="*.json" --include="*.sh" --include="*.yaml" --include="*.yml" --include="*.md" . \
  | grep -v node_modules | grep -v "docs/superpowers/" | grep -v "^./arc-runner/"
```
Expected: no output (the only historical references are inside the folder itself and in the superpowers docs). If anything else appears, STOP and report before deleting.

- [ ] **Step 2: Preserve the integration contract**

```bash
git mv arc-runner/arc.md docs/arc-runner-python-legacy-contract.md
```
Then prepend a one-line note at the top of that moved file:
```markdown
> ARCHIVED 2026-06-24: This describes the retired Python reference poller. The live runner is the TypeScript `apps/arc-runner` on Cloud Run. Kept for historical context only.
```

- [ ] **Step 3: Delete the dead folder and launch file**

```bash
git rm -r arc-runner
git rm com.bsr.arc-realtime.plist
```

- [ ] **Step 4: Verify the app still builds and tests pass**

Run: `pnpm build && pnpm test`
Expected: same result as the Task 0 baseline (no new failures introduced by the deletion).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove retired top-level Python arc-runner (live runner is apps/arc-runner)"
```

---

## Task 2: Add CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (add `packageManager` field)
- Create: `.nvmrc`

- [ ] **Step 1: Determine the pinned pnpm version**

Run: `pnpm --version`
Record the output (e.g. `9.12.0`). Use that exact version in both `package.json` and the workflow below so local and CI match.

- [ ] **Step 2: Pin Node and pnpm for reproducibility**

Create `.nvmrc` with exactly:
```
20
```

In `package.json`, add a top-level `"packageManager"` field (use the version from Step 1), placed right after `"private": true,`:
```json
  "packageManager": "pnpm@<VERSION_FROM_STEP_1>",
```

- [ ] **Step 3: Write the workflow**

Create `.github/workflows/ci.yml`. Apply the Task 0 baseline: for any gate that FAILED in the baseline, add `continue-on-error: true` to that step with the TODO comment; leave passing gates blocking (no `continue-on-error`). The template below assumes all gates pass — adjust per baseline.

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: <VERSION_FROM_STEP_1>

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck (app)
        run: pnpm typecheck

      - name: Lint (app)
        run: pnpm lint

      - name: Test (app)
        run: pnpm test

      - name: Build (app)
        run: pnpm build

      - name: Typecheck (arc-runner)
        run: pnpm --filter ./apps/arc-runner typecheck

      - name: Test (arc-runner)
        run: pnpm --filter ./apps/arc-runner test

      - name: Test (arc-connector)
        run: pnpm --filter ./packages/arc-connector test
```

- [ ] **Step 4: Validate the workflow YAML locally**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!s.includes('pnpm install --frozen-lockfile'))throw new Error('missing frozen install');console.log('workflow present, length',s.length)"`
Expected: prints the length, no throw. (Full YAML correctness is verified by GitHub actually running it in Step 6.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .nvmrc package.json
git commit -m "ci: run typecheck/lint/test/build on PRs and main"
```

- [ ] **Step 6: Verify CI runs on a real PR (done during execution handoff)**

Push the branch and open a PR. Confirm the `verify` job appears and runs each step. Then push one throwaway commit containing a deliberate type error (e.g. `const x: number = "nope";` in a scratch `.ts` file) and confirm the `Typecheck` step FAILS the job; remove that commit afterward. Confirm a clean commit passes. This proves the gate actually blocks bad code.

---

## Task 3: Rewrite README

**Files:**
- Modify: `README.md` (full rewrite)

- [ ] **Step 1: Replace README content**

Overwrite `README.md` with content describing the product as it is today. It must cover: what the product is (Arc — a marketing operating system: agent + approval-gated campaigns + vault + CRM, built on Next.js 16 + Supabase); the monorepo layout (root app, `apps/arc-runner`, `packages/arc-connector`); how each piece deploys (app → Vercel from `main`; runner → Cloud Run via its Dockerfile); local setup (`pnpm install`, copy `.env.example` → `.env.local`, `pnpm dev`); and verification (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, now also enforced by CI). Link to `ARCHITECTURE.md` and `CLAUDE.md`. Keep the non-negotiable approval-safety principle (no outbound action without human approval) visible. Do NOT reintroduce the stale "first MVP slice / six CRM objects" framing.

- [ ] **Step 2: Sanity-check links**

Run: `grep -n "ARCHITECTURE.md\|CLAUDE.md\|.env.example" README.md`
Expected: the referenced files exist (`ARCHITECTURE.md` is created in Task 4; ensure Task 4 runs before this is considered final, or that the link is intentional-forward).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README to reflect the current Arc product and monorepo layout"
```

---

## Task 4: Add ARCHITECTURE.md

**Files:**
- Create: `ARCHITECTURE.md` (root)

- [ ] **Step 1: Write the architecture map**

Create `ARCHITECTURE.md` as a one-page orientation. It must include:
- **Repo shape:** the monorepo and its three workspaces (root Next.js app; `apps/arc-runner` TypeScript runner; `packages/arc-connector` shared code) — and an explicit note that this is intentionally a monorepo, not multiple repos.
- **What each piece does** in 1–2 lines.
- **Deploy targets:** app → Vercel (auto from `origin/main`); runner → Google Cloud Run (container built from `apps/arc-runner/Dockerfile`, via `cloudbuild.yaml` / `deploy-cloud-run.sh`).
- **Data:** Supabase Postgres; migrations in `supabase/migrations/`; the app degrades gracefully without Supabase env vars.
- **Live vs scaffold:** note that some pages are wired (vault, campaigns, CRM interactions) and others are preview-only scaffold — point readers at `CLAUDE.md` for the detailed contract.
- **Layering convention:** `src/domain/` (pure) → `src/lib/<feature>/` (I/O) → `src/app/<route>/` (views).
- Links into the deeper `docs/` (e.g. `docs/arc-runner-cloud-run-runbook.md`) and `CLAUDE.md` / `DESIGN.md`.

- [ ] **Step 2: Confirm referenced paths exist**

Run: `ls supabase/migrations apps/arc-runner/Dockerfile apps/arc-runner/cloudbuild.yaml docs/arc-runner-cloud-run-runbook.md CLAUDE.md DESIGN.md`
Expected: all listed without error.

- [ ] **Step 3: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: add ARCHITECTURE.md repo map (workspaces, deploys, data, layering)"
```

---

## Final verification

- [ ] **Step 1: Full gate run matches baseline**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: same pass set as the Task 0 baseline — the cleanup introduced no regressions.

- [ ] **Step 2: Confirm dead code is gone and docs exist**

Run: `test ! -d arc-runner && test ! -f com.bsr.arc-realtime.plist && test -f ARCHITECTURE.md && test -f .github/workflows/ci.yml && echo OK`
Expected: `OK`

- [ ] **Step 3: Open the PR** (see Task 2 Step 6 for the CI-blocks-bad-code proof).

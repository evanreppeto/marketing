# Foundation Polish — Design

**Date:** 2026-06-24
**Goal:** Make the repository legible and protected so it reads and behaves like a real, scalable product — **without changing any product behavior.**

## Context

The repo is a healthy pnpm **monorepo**, not a candidate for splitting into separate repos:

- **root** — the main Next.js 16 app (marketing / growth-engine UI + APIs). Deploys to **Vercel** from `origin/main`.
- **`apps/arc-runner`** — the TypeScript Arc agent runner. Deploys to **Google Cloud Run** via its `Dockerfile`. This is the *live* runner.
- **`packages/arc-connector`** — shared code (requires Node ≥20).

Three gaps keep it from feeling professional/scale-ready. None require new repos or product changes:

1. **Dead code.** A top-level `arc-runner/` (Python) folder is leftover and confuses humans and AI agents into editing the wrong runner. The live one is `apps/arc-runner` (TypeScript).
2. **No CI.** There is no `.github/` — nothing automatically checks code before it ships. The repo's history is full of exactly the failures CI prevents (corrupted lockfile breaking the Vercel build, merges silently dropping code, type errors reaching `main`).
3. **Stale front door.** `README.md` still describes the original "CRM data foundation MVP," not the actual product (Arc agent, campaigns, vault, the marketing OS). There is no single architecture map.

## Non-goals (explicitly out of scope)

- Splitting into multiple repos.
- Any multi-tenant / "serve many customers" rearchitecture (a separate, larger initiative).
- Any product feature change, UI change, or behavior change.
- Dependency upgrades or refactors unrelated to the three workstreams below.

---

## Workstream 1 — Remove dead code

Delete the top-level `arc-runner/` Python directory and its companion macOS launch file:

- `arc-runner/` (contains `arc_chat_core.py`, `poller.py`, `mcp_server.py`, `realtime_subscriber.py`, `webhook.py`, `requirements.txt`, `arc.md`, `README.md`, tests)
- `com.bsr.arc-realtime.plist` if it is the launchd file tied to the Python poller (verify first).

**Safety check before deleting:** grep the repo (and `apps/arc-runner`, `scripts/`, `docs/`, deploy configs, `package.json`) for any reference to these files/paths. The live Cloud Run runbook and deploy scripts should reference `apps/arc-runner`, not the Python folder. Only delete after confirming nothing live points at it. Anything still-useful (e.g. the `ARC.md` integration contract) is preserved by relocating it under `docs/` rather than deleting.

**Verification:** `pnpm build` and `pnpm test` still pass after removal.

---

## Workstream 2 — Add CI (the highest-value change)

Add a GitHub Actions workflow at `.github/workflows/ci.yml`.

- **Triggers:** `pull_request` (any branch) and `push` to `main`.
- **Environment:** pin Node **20** and a fixed **pnpm** version. Use dependency caching.
- **Install:** `pnpm install --frozen-lockfile` — this alone catches the recurring lockfile-corruption-breaks-Vercel bug, because a corrupted/out-of-sync lockfile fails the job immediately instead of in production.
- **Checks (root app):** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- **Checks (workspaces):** `apps/arc-runner` `typecheck` + `test`; `packages/arc-connector` `test`.

### Baseline-first decision (important)

Before any check is made **blocking**, the implementation must run each command locally and record which pass on the repo as-is. Then:

- Commands that pass today → **required** (block the merge on failure).
- Any command that does *not* pass today → either fixed within this effort (preferred if small) or temporarily marked non-blocking (`continue-on-error`) with a documented TODO follow-up, so we never block every future PR on a pre-existing failure.

The baseline result is recorded in the implementation plan and the final summary.

### Reproducibility add-ons (small, professional)

- Add a `packageManager` field to root `package.json` and/or a `.nvmrc` pinning Node 20, so local and CI environments match.

---

## Workstream 3 — Fix the front door

- **Rewrite `README.md`** to describe what the product actually is today: the Arc marketing operating system (agent + approval-gated campaigns + vault + CRM), how it's structured (the monorepo map above), how it runs locally, and how each piece deploys (app → Vercel, runner → Cloud Run).
- **Add `ARCHITECTURE.md`** (root) — a one-page map: the three workspaces, what each does, where data lives (Supabase), how things deploy, and what is live vs. scaffold. Links to the deeper docs already in `docs/`.

These give any new reader (a developer, an investor, future-you) instant orientation.

---

## Verification strategy

- **Workstream 1:** build + tests pass after deletion; no broken references.
- **Workstream 2:** open a draft PR and confirm the workflow runs and reports each check; confirm a deliberately broken commit (e.g. a type error) is caught and a clean commit passes. Confirm `--frozen-lockfile` behaves.
- **Workstream 3:** docs reviewed for accuracy against the real structure; no code impact.

## Risks

- **Pre-existing check failures** could make CI block everything → mitigated by the baseline-first decision above.
- **Lint noise:** historically a broad lint run has surfaced large counts from generated/vendored files. The baseline step measures the real current `pnpm lint` result and the workflow gates only on what genuinely passes.
- **Deleting the wrong thing:** mitigated by the grep/reference safety check before any deletion.

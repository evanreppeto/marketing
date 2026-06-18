# Arc Runner on Cloud Run — Design

**Date:** 2026-06-18
**Status:** Approved (design) — pending spec review
**Purpose:** Go-live deployment that activates the merged second brain (SP1 brand learning, SP2 recall, SP3a traversal) in production.

## Problem

The second-brain features all live in `apps/arc-runner/` (the Claude Agent SDK
bridge). The Vercel app already serves the new `/api/v1/arc/*` routes, but **none
of it works in prod until the runner runs the latest code somewhere the app can
reach.** Vercel can't host the runner: it's a persistent HTTP webhook service
that does Arc's work *after* acking the wake (`server.ts` returns `200` then
`void handleChatMessage(...)`, which can run for minutes — video polling up to
~6 min). Serverless functions are request-scoped and would kill that work.

This deploys the runner to **Cloud Run** as an always-on service.

## Decisions (locked)

- **Host: Cloud Run.** Managed TLS + stable HTTPS URL + auto-restart + one-command
  deploys. (GKE rejected as overkill for one small service; a Compute Engine VM
  considered and viable but loses managed TLS/deploys.)
- **Claude auth: subscription OAuth token** (`CLAUDE_CODE_OAUTH_TOKEN` from
  `claude setup-token`), so it runs on the operator's Max plan, not API credits.
  Accepted caveat: the OAuth token can expire and need periodic re-tokening.
  `ANTHROPIC_API_KEY` must NOT be set (it silently overrides the OAuth token and
  bills API credits — `config.ts` warns about this).
- **CPU always allocated + `--min-instances=1`** — REQUIRED, not optional: the
  runner's background work runs after the HTTP response, which Cloud Run
  throttles/kills on the default request-scoped CPU model. Min-1 also avoids
  cold-start per wake. (A queue-based rearchitecture for scale-to-zero is a
  future fast-follow, not this project.)
- **Ingress: public, protected by HMAC.** The app HMAC-signs every wake with
  `ARC_WEBHOOK_SECRET`; the runner rejects unsigned/bad-signature requests
  (`server.ts:39-47`). No additional gateway needed for v1.

## Critical build fact (verified)

`@anthropic-ai/claude-agent-sdk` **spawns the Claude Code executable**
(`spawn(...)`, `pathToClaudeCodeExecutable`) and declares **zero npm
dependencies** — it does not bundle the CLI. So the container **must install
`@anthropic-ai/claude-code` globally** (matching the `npm i -g
@anthropic-ai/claude-code` note in `config.ts`) or the SDK fails to spawn Claude
at runtime. This works locally only because the CLI is globally installed there.

## Architecture / components

### a. `apps/arc-runner/Dockerfile` (+ `.dockerignore`)
Multi-stage, pnpm-workspace-aware:
- **Base:** `node:20-slim`; `corepack enable` for pnpm.
- **deps/build stage:** copy workspace manifests (`package.json`,
  `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `apps/arc-runner/package.json`),
  `pnpm install --filter @bsr/arc-runner...`, copy `apps/arc-runner` source,
  `pnpm --filter @bsr/arc-runner build` → `dist/`.
- **runtime stage:** copy `dist` + the runner's `node_modules`; **`npm i -g
  @anthropic-ai/claude-code@<pinned>`**; non-root user; `CMD ["node",
  "dist/index.js"]`. The runner reads `process.env.PORT` (Cloud Run injects 8080
  — already handled by `config.ts`).
- `.dockerignore`: `**/node_modules`, `.next`, `.git`, `docs`, test files, etc.

### b. Cloud Run service config
`gcloud run deploy arc-runner` with:
- `--source apps/arc-runner` (Cloud Build builds the Dockerfile) — or build +
  push to Artifact Registry then `--image`.
- `--region <region>` (operator's choice; e.g. `us-central1`).
- `--no-cpu-throttling` (CPU always allocated) + `--min-instances=1`.
- `--max-instances=3`, `--concurrency=4`, `--timeout=900`.
- `--allow-unauthenticated` (public ingress; HMAC protects the webhook).
- `--port` left to default (Cloud Run sets `PORT`).

### c. Secrets & env
- **Secret Manager** (mounted via `--set-secrets`): `CLAUDE_CODE_OAUTH_TOKEN`,
  `ARC_AGENT_API_TOKEN`, `ARC_WEBHOOK_SECRET`.
- **Plain env** (`--set-env-vars`): `APP_API_BASE_URL=<prod Vercel URL>`,
  `ARC_MODEL=claude-haiku-4-5`. Explicitly ensure `ANTHROPIC_API_KEY` is unset.

### d. Repeatable deploy script
`apps/arc-runner/deploy-cloud-run.sh` — the exact `gcloud` invocation with all
flags above, parameterized by `PROJECT`, `REGION`, `SERVICE`, so redeploys are
one command. (No CI/CD auto-deploy in v1 — fast-follow.)

## Go-live sequence (the payoff)

1. Create the three secrets in Secret Manager.
2. `bash apps/arc-runner/deploy-cloud-run.sh` → capture the Cloud Run HTTPS URL.
3. `curl https://<url>/health` → `{"ok":true,"service":"arc-runner"}`.
4. In Vercel: set `ARC_RUNNER_URL=https://<url>/webhooks/growth-chat` and matching
   `ARC_WEBHOOK_SECRET` / `ARC_AGENT_API_TOKEN`; confirm the agent row exists
   (Settings → Agent drawer "Runner endpoint" check, or `pnpm diagnose:arc`).
5. Apply the tenancy migration `20260618120000_product_tenancy_foundation.sql` to
   prod; run `pnpm seed:brand-kit-bsr` against prod (upserts BSR profile
   `status: active`).
6. Smoke test: `ping` → a real `/arc` chat reflecting BSR's voice (SP1) + recall
   with relationship sub-lines (SP2/SP3a).

## Testing / verification

- **Container build smoke test:** build the image locally, run it with a dummy
  env, hit `/health` (200) and POST a `{"type":"ping"}` wake → `{"status":"pong"}`
  — proving the image boots and the server responds before touching prod.
- **Claude-spawn check:** the smoke test must confirm the SDK can locate the
  globally-installed `claude` binary (a real chat wake, or a documented check),
  since a missing CLI is a silent runtime failure.
- No app/unit test changes — this project adds deploy artifacts only, no app code.

## Risks (surfaced)

- **OAuth token expiry** — document the re-token procedure (`claude setup-token`
  → update the Secret Manager secret → redeploy/restart).
- **`claude-code` CLI availability in-container** — verified required; Dockerfile
  installs it; smoke test confirms the spawn path.
- **Constant cost** — `--min-instances=1` + CPU-always-on means one instance runs
  24/7 (small, but not scale-to-zero).

## Out of scope (fast-follows)

- Queue-based rearchitecture (Cloud Tasks / Pub-Sub) to allow scale-to-zero.
- Multi-tenant API-key auth.
- CI/CD auto-deploy of the runner on merge to `main`.
- Cloud Run IAM / static-IP hardening beyond HMAC.

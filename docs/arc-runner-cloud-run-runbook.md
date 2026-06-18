# Arc Runner — Cloud Run Go-Live Runbook

Activates the merged second brain (brand learning, recall, graph traversal) in
prod by running `apps/arc-runner` on Cloud Run. All steps are operator actions in
your GCP + Vercel + Supabase environments.

## 0. One-time GCP setup
- `gcloud auth login` and `gcloud config set project <PROJECT>`.
- Enable APIs: `gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com`.

## 1. Create secrets (Secret Manager)
Use your real values. `ARC_AGENT_API_TOKEN` and `ARC_WEBHOOK_SECRET` must MATCH the
Vercel app's values. Get the Claude token from `claude setup-token` (after
`npm i -g @anthropic-ai/claude-code` and logging in with your Max plan).

    printf '%s' "<sk-ant-oat01-...>"      | gcloud secrets create arc-claude-oauth-token --data-file=-
    printf '%s' "<ARC_AGENT_API_TOKEN>"   | gcloud secrets create arc-agent-api-token   --data-file=-
    printf '%s' "<ARC_WEBHOOK_SECRET>"    | gcloud secrets create arc-webhook-secret     --data-file=-

(Grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor`
if prompted.)

## 2. Deploy
    GCP_PROJECT=<PROJECT> APP_API_BASE_URL=https://<prod-app> bash apps/arc-runner/deploy-cloud-run.sh

Capture the printed service URL. Confirm health:
    curl -s https://<service-url>/health      # -> {"ok":true,"service":"arc-runner"}

## 3. Wire the app (Vercel env)
- `ARC_RUNNER_URL = https://<service-url>/webhooks/growth-chat`
- `ARC_WEBHOOK_SECRET` = (same as the secret above)
- `ARC_AGENT_API_TOKEN` = (same as the secret above)
Redeploy the Vercel app so the env takes effect. Then verify the agent is wired:
Settings -> Agent drawer shows "Runner endpoint" ✓, or run `pnpm diagnose:arc`.

## 4. Database (prod = tegdgejiyxurgvgheshi, applied manually)
- Apply migration `supabase/migrations/20260618120000_product_tenancy_foundation.sql` to prod.
  (The second-brain features add no migration — they reuse existing tables.)
- Onboard BSR: with `.env.local` pointed at PROD Supabase creds, run
  `pnpm seed:brand-kit-bsr`. This upserts BSR's profile as `status: active`, so
  the runner's brand context drives Arc immediately.

## 5. Smoke test (exercises all three features)
- `pnpm diagnose:arc` — env flags + ARC_RUNNER_URL correct.
- Bearer-check live routes (replace $TOK / host):
    curl -s -X POST https://<app>/api/v1/arc/ping -H "authorization: Bearer $TOK"
    curl -s https://<app>/api/v1/arc/brand/context -H "authorization: Bearer $TOK"        # BSR profile, not neutral
    curl -s -X POST https://<app>/api/v1/arc/brain/recall -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d '{"message":"flood"}'
- In /arc: send a chat -> reply reflects BSR's voice (SP1); a fresh chat recalls a
  fact recorded elsewhere (SP2) with relationship sub-lines if nodes are linked (SP3a).

## Re-tokening (subscription OAuth expiry)
The `CLAUDE_CODE_OAUTH_TOKEN` can expire. When Arc stops responding with an auth
error in the Cloud Run logs:
    claude setup-token                       # produces a fresh sk-ant-oat01-...
    printf '%s' "<new-token>" | gcloud secrets versions add arc-claude-oauth-token --data-file=-
    gcloud run services update arc-runner --region <REGION>   # picks up :latest
(If you ever prefer no expiry, switch the secret to an ANTHROPIC_API_KEY-based
deploy — bills API credits instead of your Max plan.)

## Cost note
`--min-instances 1` + `--no-cpu-throttling` keep one instance warm 24/7 (required
so Arc's post-ack background work isn't killed). Expect a small constant cost
rather than scale-to-zero.

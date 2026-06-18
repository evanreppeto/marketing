#!/usr/bin/env bash
# Deploy the Arc runner to Cloud Run. Run from the repo root:
#   GCP_PROJECT=my-proj APP_API_BASE_URL=https://app.example bash apps/arc-runner/deploy-cloud-run.sh
#
# Prerequisites (one-time, see docs/arc-runner-cloud-run-runbook.md):
#   - gcloud auth + project set; Cloud Run + Cloud Build + Secret Manager APIs enabled
#   - Secret Manager secrets created: arc-claude-oauth-token, arc-agent-api-token, arc-webhook-secret
set -euo pipefail

PROJECT="${GCP_PROJECT:?set GCP_PROJECT to your GCP project id}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${SERVICE_NAME:-arc-runner}"
APP_URL="${APP_API_BASE_URL:?set APP_API_BASE_URL to the prod app base URL}"
MODEL="${ARC_MODEL:-claude-haiku-4-5}"

SECRET_OAUTH="${SECRET_OAUTH:-arc-claude-oauth-token}"
SECRET_API_TOKEN="${SECRET_API_TOKEN:-arc-agent-api-token}"
SECRET_WEBHOOK="${SECRET_WEBHOOK:-arc-webhook-secret}"

gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source apps/arc-runner \
  --no-cpu-throttling \
  --min-instances 1 \
  --max-instances 3 \
  --concurrency 4 \
  --timeout 900 \
  --allow-unauthenticated \
  --set-env-vars "APP_API_BASE_URL=${APP_URL},ARC_MODEL=${MODEL}" \
  --set-secrets "CLAUDE_CODE_OAUTH_TOKEN=${SECRET_OAUTH}:latest,ARC_AGENT_API_TOKEN=${SECRET_API_TOKEN}:latest,ARC_WEBHOOK_SECRET=${SECRET_WEBHOOK}:latest"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo ""
echo "Deployed: $URL"
echo "Next: set Vercel ARC_RUNNER_URL=${URL}/webhooks/growth-chat (and matching ARC_WEBHOOK_SECRET + ARC_AGENT_API_TOKEN)."

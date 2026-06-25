# Deploy

How the two deployable surfaces ship, plus the manual steps that are easy to forget.

## App → Vercel

The Next.js app auto-deploys from `origin/main` — merging to `main` triggers a Vercel build and deploy. No manual step.

- Scheduled jobs are declared in [`vercel.json`](vercel.json). Current cron: `/api/cron/opportunity-scan` (daily at `0 13 * * *`).
- Env vars live in the Vercel project settings (not in the repo). See [`.env.example`](.env.example) for the full list of variables the app expects.

## Arc runner → Cloud Run

The Arc runner (`apps/arc-runner/`) deploys to Google Cloud Run.

- **Auto-deploy**: a Cloud Build trigger runs [`apps/arc-runner/cloudbuild.yaml`](apps/arc-runner/cloudbuild.yaml) on push to `main`, filtered to changes under `apps/arc-runner/**`.
- **Config / secret changes** (or a manual deploy): run [`apps/arc-runner/deploy-cloud-run.sh`](apps/arc-runner/deploy-cloud-run.sh).
- **Secrets** live in GCP Secret Manager, not in the repo.
- Full procedure and operational details: [`docs/arc-runner-cloud-run-runbook.md`](docs/arc-runner-cloud-run-runbook.md).

## Database migrations (MANUAL — do not skip)

Migrations are timestamped SQL files in [`supabase/migrations/`](supabase/migrations). They are **NOT** auto-applied on deploy.

Apply any new migration to the **production** Supabase DB **before or together with** merging the code that depends on it. Merging code that reads a column/table the prod DB doesn't have yet causes schema drift and breaks prod.

## Post-deploy smoke check

After a deploy, confirm the surfaces are healthy:

```bash
pnpm smoke:http <prod-base-url>   # expected pages load (HTTP checks)
pnpm health:supabase              # Supabase connectivity / health
```

Green on both = expected pages load and the DB is reachable.

## Rollback

- **App (Vercel)**: redeploy a previous deployment from the Vercel dashboard.
- **Arc runner (Cloud Run)**: images are tagged by commit SHA — redeploy a prior tag. See [`docs/arc-runner-cloud-run-runbook.md`](docs/arc-runner-cloud-run-runbook.md).

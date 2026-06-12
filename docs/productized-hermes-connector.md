# Productized Hermes Connection Model

## Decision

The Growth Engine app should be hosted for each customer workspace. Users should not download and run the app on a personal computer for the default product path.

Hermes should connect to that hosted workspace from wherever the Hermes agent runs: a laptop, server, Vercel project, Render service, Fly app, or another agent runtime.

## Customer Experience

1. A customer gets a workspace URL:

```text
https://acme.growthengine.com
```

or, in an early product version:

```text
https://app.growthengine.com/acme
```

2. The customer opens Settings -> Agent.
3. The app shows the workspace URL and a short guided Agent Profile setup.
4. The customer fills in company context and keeps the recommended help areas selected.
5. The customer clicks Generate setup bundle. The app creates a random workspace-scoped token, a random webhook signing secret, a ready-to-paste Hermes prompt, a verification message, and a `.env.growth-engine` snippet.
6. The customer copies the generated prompt into Hermes. The token, webhook secret, Agent Profile, and selected skills are already filled in.
7. Optional: the customer runs a connector command in the Hermes project when they want repeatable setup:

```bash
npx @growth-engine/hermes init \
  --app https://acme.growthengine.com \
  --token sk_live_... \
  --secret whsec_...
```

8. The connector writes Hermes-side environment variables:

```env
GROWTH_APP_BASE_URL=https://acme.growthengine.com
GROWTH_APP_AGENT_TOKEN=sk_live_...
HERMES_WEBHOOK_SECRET=...
```

9. Hermes polls and replies through `/api/v1/hermes/*`; the app optionally wakes Hermes through its configured webhook URL.

## Why This Is The Easiest Product Path

- The app is reachable from any device because it is hosted.
- Customers do not need to install the app.
- Prompt Mode works before any package is published.
- Token and webhook secrets are randomized by the app, so users do not invent unsafe shared secrets.
- The Agent Profile gives Hermes useful company, audience, voice, and risk context before the first task without asking users to write a long prompt.
- The connector package is small and lives inside the Hermes runtime, where agent code already runs.
- Tokens are scoped to a workspace, so the same hosted app can later support many workspaces.
- The existing `agent_connections.workspace_id` and `agent_api_tokens.workspace_id` seams can evolve from `"default"` to real tenant IDs.

## Product Phases

### Phase 1: Hosted Single Workspace

Use the current Vercel app and singleton workspace. Settings -> Agent shows the hosted URL, short Agent Profile setup, a small recommended help checklist, and a setup bundle generator that issues the token, rotates the webhook secret, and returns the Hermes prompt plus env file. Optional image/design tool recommendations sit at the end for later enhancement. Manual token and webhook controls remain available as fallback controls.

### Phase 2: Connector Package

Publish `@growth-engine/hermes` with:

- `init` command.
- Polling client.
- Reply client.
- Health ping.
- Webhook signature verification helper.
- Retry and error reporting defaults.

Before npm publishing, the same connector can be installed locally from this repo:

```powershell
pnpm add C:\Users\evanr\marketing\packages\hermes-connector
```

### Phase 3: Multi-Tenant Hosted App

Add real workspaces, workspace slugs, token-to-workspace resolution, and RLS policies. URLs can become subdomains or path-based workspaces.

### Phase 4: Optional Self-Host

Offer `create-growth-engine-app` or a Deploy to Vercel flow for advanced users who require their own infrastructure.

## Non-Goal For The Default Path

Do not make normal customers run the Growth Engine app locally. Local app installs are useful for development and self-hosting, but they are not the easiest customer onboarding path.

# Attach Your Arc Agent Now

This is the easiest baseline before `@growth-engine/arc` is published to npm.

Start with the setup bundle in Settings -> Agent. It creates the token, webhook secret, prompt, verification message,
and Arc env file together. Use the package only when you want the setup to be repeatable in code.

## 1. Get Your Hosted App URL

Use the Vercel URL for this app:

```text
https://your-growth-engine.vercel.app
```

In local development, use:

```text
http://127.0.0.1:3000
```

## 2. Generate The Setup Bundle

In the app, open:

```text
Settings -> Agent
```

Click:

```text
Generate setup bundle
```

Before clicking, fill out the short Agent Profile:

- Company name.
- Service area.
- What you want marketed.
- Best customers.
- Why people should choose you.

Then keep the recommended help areas selected, or uncheck anything that does not fit yet. Advanced instructions and
image/design tools can be added later.

The app creates:

- A random workspace-scoped inbound API token.
- A random webhook signing secret.
- A Arc setup prompt with both secrets, the Agent Profile, and selected marketing skills already filled in.
- A verification message Arc can run after setup.
- A `.env.growth-engine` snippet for Arc runtimes that prefer env files.

Optional image and design tools are listed at the end of Settings -> Agent. They are not required for the first
connection; give them to Arc later when you want help preparing visuals.

Copy the token now. The app stores only the token hash, so the plaintext token is shown once.

If bundle generation is not available yet, generate an inbound API token manually and copy it once.

If you are still using env-only mode, use the value from:

```env
ARC_AGENT_API_TOKEN=...
```

## 3. Prompt Mode

In Settings -> Agent, copy the generated Arc setup prompt.

Paste it into your Arc agent. If you used the setup bundle, the token and webhook secret are already filled in.
If you are using the manual fallback, replace:

```text
PASTE_AGENT_TOKEN_HERE
PASTE_SHARED_WEBHOOK_SECRET_HERE
```

The prompt tells Arc to:

- Verify `GET /api/v1/arc/ping`.
- Poll `GET /api/v1/arc/messages?limit=20`.
- Reply through `POST /api/v1/arc/messages`.
- Report progress through `/api/v1/arc/messages/{agentTaskId}/steps`.
- Never approve, publish, send, launch, dispatch, or unlock public-facing work.

## 4. Ask Arc To Verify

Copy the generated verification message from Settings -> Agent and paste it into Arc.

Arc should:

1. Call `GET /api/v1/arc/ping`.
2. Poll `GET /api/v1/arc/messages?limit=20`.
3. Report the HTTP status, response body, and whether the bearer token loaded.

This proves the inbound Arc-to-app path before you worry about webhooks.

## 5. Optional: Add The Wake Webhook

Polling is enough for the baseline. Once that works, configure the Arc webhook URL and shared signing secret in Settings -> Agent, then click Test connection.

The webhook makes the app wake Arc immediately when a Arc message arrives.

## 6. Send One Arc Message

Open Arc, send a short test message, and confirm Arc replies in the thread.

## 7. Optional: Install The Local Connector Into Arc

From the Arc agent project on this machine:

```powershell
pnpm add C:\Users\evanr\marketing\packages\arc-connector
```

Then initialize Arc-side env:

```powershell
pnpm exec growth-arc init `
  --app https://your-growth-engine.vercel.app `
  --token sk_live_... `
  --secret whsec_...
```

That writes:

```text
.env.growth-engine
```

## 8. Use The Client In Arc

```js
import { createGrowthEngineClient } from "@growth-engine/arc";

const growth = createGrowthEngineClient({
  baseUrl: process.env.GROWTH_APP_BASE_URL,
  token: process.env.GROWTH_APP_AGENT_TOKEN,
});

await growth.ping();

const inbox = await growth.listMessages({ limit: 20 });
for (const message of inbox.messages ?? []) {
  await growth.reply({
    agentTaskId: message.agentTaskId,
    body: "Arc received this message.",
  });
}
```

## 9. Verify

Run the Arc worker and send a message in Arc. The app should either wake the Arc webhook or Arc should pick up queued messages through polling.

Once this works locally, publishing `@growth-engine/arc` turns the install step into:

```powershell
pnpm add @growth-engine/arc
```

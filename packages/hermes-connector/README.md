# `@growth-engine/hermes`

Connector helpers for attaching a Hermes agent to a hosted Growth Engine workspace.

## Initialize Hermes

```bash
npx @growth-engine/hermes init \
  --app https://acme.growthengine.com \
  --token sk_live_... \
  --secret shared-hmac-secret
```

The command writes `.env.growth-engine`:

```env
GROWTH_APP_BASE_URL=https://acme.growthengine.com
GROWTH_APP_AGENT_TOKEN=sk_live_...
HERMES_WEBHOOK_SECRET=shared-hmac-secret
```

## Use In A Hermes Worker

```js
import { createGrowthEngineClient } from "@growth-engine/hermes";

const growth = createGrowthEngineClient({
  baseUrl: process.env.GROWTH_APP_BASE_URL,
  token: process.env.GROWTH_APP_AGENT_TOKEN,
});

await growth.ping();

const inbox = await growth.listMessages({ limit: 20 });
for (const message of inbox.messages ?? []) {
  await growth.reply({
    agentTaskId: message.agentTaskId,
    body: "Hermes received this message.",
  });
}
```

## Verify App Wake Signatures

```js
import { verifyWebhookSignature } from "@growth-engine/hermes";

const valid = verifyWebhookSignature({
  rawBody,
  signature: request.headers["x-webhook-signature"],
  secret: process.env.HERMES_WEBHOOK_SECRET,
});
```

import { createHmac, timingSafeEqual } from "node:crypto";

export class GrowthEngineError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "GrowthEngineError";
    this.status = status;
    this.body = body;
  }
}

export function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("baseUrl is required.");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function authHeaders(token, extra = {}) {
  const cleanToken = String(token ?? "").trim();
  if (!cleanToken) throw new Error("token is required.");
  return {
    authorization: `Bearer ${cleanToken}`,
    ...extra,
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new GrowthEngineError(`Growth Engine request failed with HTTP ${response.status}.`, {
      status: response.status,
      body,
    });
  }
  return body;
}

export function createGrowthEngineClient({ baseUrl, token, fetch: fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  const root = normalizeBaseUrl(baseUrl);

  async function request(path, { method = "GET", body } = {}) {
    const headers = authHeaders(token, body === undefined ? {} : { "content-type": "application/json" });
    const response = await fetchImpl(`${root}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseJsonResponse(response);
  }

  return {
    baseUrl: root,
    ping: () => request("/api/v1/hermes/ping"),
    listMessages: ({ limit = 20 } = {}) => request(`/api/v1/hermes/messages?limit=${encodeURIComponent(String(limit))}`),
    reply: ({ agentTaskId, body, status = "complete", metadata = {} }) =>
      request("/api/v1/hermes/messages", {
        method: "POST",
        body: { agentTaskId, body, status, metadata },
      }),
    reportSteps: ({ agentTaskId, steps, body }) =>
      request(`/api/v1/hermes/messages/${encodeURIComponent(agentTaskId)}/steps`, {
        method: "POST",
        body: body === undefined ? { steps } : { steps, body },
      }),
  };
}

export function createEnvTemplate({ baseUrl, token, webhookSecret = "" }) {
  const root = normalizeBaseUrl(baseUrl);
  const cleanToken = String(token ?? "").trim();
  if (!cleanToken) throw new Error("token is required.");
  return [
    "# Growth Engine hosted workspace connection",
    `GROWTH_APP_BASE_URL=${root}`,
    `GROWTH_APP_AGENT_TOKEN=${cleanToken}`,
    `HERMES_WEBHOOK_SECRET=${String(webhookSecret ?? "").trim()}`,
    "",
  ].join("\n");
}

export function verifyWebhookSignature({ rawBody, signature, secret }) {
  const cleanSecret = String(secret ?? "").trim();
  const cleanSignature = String(signature ?? "").trim();
  if (!cleanSecret || !cleanSignature) return false;

  const expected = createHmac("sha256", cleanSecret).update(String(rawBody ?? "")).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(cleanSignature, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

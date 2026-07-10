import { describe, expect, it } from "vitest";

import { findConnector } from "@/domain";

import { detectWeatherOpportunities, weatherSignalConnector, webhookChannelConnector } from "../builtin";
import { dispatchWebhook } from "../builtin/webhook-channel";
import {
  getChannel,
  getSignalSource,
  listChannels,
  listSignalSources,
  registerSignalSource,
  type SignalSourceConnector,
} from "../registry";

describe("connector runtime registry", () => {
  it("self-registers the built-in stub connectors on import", () => {
    // Importing ../builtin ran the register* side effects.
    expect(getSignalSource("weather-signals")).toBe(weatherSignalConnector);
    expect(getChannel("webhook-dispatch")).toBe(webhookChannelConnector);
    expect(listSignalSources().map((c) => c.key)).toContain("weather-signals");
    expect(listChannels().map((c) => c.key)).toContain("webhook-dispatch");
  });

  it("returns null for an unregistered key", () => {
    expect(getSignalSource("does-not-exist")).toBeNull();
    expect(getChannel("does-not-exist")).toBeNull();
  });

  it("every registered signal source maps to a signal_source catalog entry", () => {
    for (const source of listSignalSources()) {
      const entry = findConnector(source.key);
      expect(entry?.kind).toBe("signal_source");
    }
  });

  it("every registered channel maps to a channel catalog entry", () => {
    for (const channel of listChannels()) {
      const entry = findConnector(channel.key);
      expect(entry?.kind).toBe("channel");
    }
  });

  it("register overwrites by key (idempotent self-registration is safe)", () => {
    const replacement: SignalSourceConnector = { key: "weather-signals", detect: () => [] };
    registerSignalSource(replacement);
    expect(getSignalSource("weather-signals")).toBe(replacement);
    // restore for other tests
    registerSignalSource(weatherSignalConnector);
    expect(getSignalSource("weather-signals")).toBe(weatherSignalConnector);
  });
});

describe("weather-signals stub — detect() candidates", () => {
  it("emits one read-only weather_event candidate per configured location", () => {
    const candidates = detectWeatherOpportunities({ config: { locations: ["Chicago", "Naperville"] } });
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.subjectId)).toEqual(["weather:chicago", "weather:naperville"]);
    for (const c of candidates) {
      expect(c.kind).toBe("weather_event");
      expect(c.recommendedCampaignType).toBe("storm_response");
      expect(c.confidence).toBeGreaterThan(0);
    }
  });

  it("returns [] when no locations are configured (no signal, no candidates)", () => {
    expect(detectWeatherOpportunities({ config: {} })).toEqual([]);
    expect(detectWeatherOpportunities({ config: { locations: [] } })).toEqual([]);
    expect(detectWeatherOpportunities({ config: { locations: "not-an-array" } })).toEqual([]);
  });

  it("uses a stable subjectId so re-scans dedup (same location → same subject)", () => {
    const a = detectWeatherOpportunities({ config: { locations: ["Chicago"] } });
    const b = detectWeatherOpportunities({ config: { locations: ["chicago"] } });
    expect(a[0].subjectId).toBe(b[0].subjectId);
  });
});

describe("webhook-dispatch stub — dispatch() never sends without approval", () => {
  const base = { client: {} as never, orgId: "o", workspaceId: "w", credential: null, payload: { body: "hi" } };

  it("refuses to dispatch without an approvalId", async () => {
    const res = await dispatchWebhook({ ...base, approvalId: "", config: { endpoint: "https://x" } });
    expect(res.ok).toBe(false);
  });

  it("refuses when no endpoint is configured", async () => {
    const res = await dispatchWebhook({ ...base, approvalId: "appr-1", config: {} });
    expect(res.ok).toBe(false);
  });

  it("with an approval + endpoint, returns a dry-run ref (stub does not actually send)", async () => {
    const res = await dispatchWebhook({ ...base, approvalId: "appr-1", config: { endpoint: "https://x/hook" } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.providerRef).toContain("dry-run");
  });
});

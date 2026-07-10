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

describe("weather-signals — detect() maps NWS alerts to candidates (injected source, no network)", () => {
  const NOW = "2026-06-17T18:00:00.000Z";
  // A fixture WeatherEventSource stands in for the live NWS feed so this stays
  // deterministic and network-free (the real NWS client is covered in nws.test.ts).
  const source = {
    listActiveEvents: async () => [
      { id: "urn:oid:warn-1", eventType: "Flash Flood Warning", area: "Cook, IL", severity: "warning" as const },
      { id: "urn:oid:advis-1", eventType: "Wind Advisory", area: "Kane, IL", severity: "advisory" as const },
    ],
  };

  it("emits one read-only weather_event candidate per active alert, keyed by CAP alert id", async () => {
    const candidates = await detectWeatherOpportunities({ config: { states: ["IL"] }, now: NOW, source });
    expect(candidates.map((c) => c.subjectId)).toEqual(["urn:oid:warn-1", "urn:oid:advis-1"]);
    for (const c of candidates) {
      expect(c.kind).toBe("weather_event");
      expect(c.recommendedCampaignType).toBe("storm_response");
      expect(c.confidence).toBeGreaterThan(0);
    }
    // Severity drives urgency: warning = high, advisory = low.
    expect(candidates[0].urgency).toBe("high");
    expect(candidates[1].urgency).toBe("low");
  });

  it("returns [] when the source reports no active alerts (no signal, no candidates)", async () => {
    const empty = { listActiveEvents: async () => [] };
    expect(await detectWeatherOpportunities({ config: { states: ["IL"] }, now: NOW, source: empty })).toEqual([]);
  });

  it("uses the CAP alert id as subjectId so re-scans dedup on the same alert", async () => {
    const a = await detectWeatherOpportunities({ config: {}, now: NOW, source });
    const b = await detectWeatherOpportunities({ config: {}, now: NOW, source });
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

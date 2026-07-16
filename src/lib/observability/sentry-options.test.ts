import { describe, expect, it } from "vitest";

import { buildSentryOptions, type SentryEnvInput } from "./sentry-options";

const env = (over: SentryEnvInput = {}) => over;

describe("buildSentryOptions", () => {
  it("is disabled with no DSN — Sentry must stay inert in dev, demo, and the env-less CI build", () => {
    const options = buildSentryOptions(env({}));
    expect(options.enabled).toBe(false);
    expect(options.dsn).toBeUndefined();
  });

  it("treats a blank/whitespace DSN as absent rather than enabling with a broken value", () => {
    expect(buildSentryOptions(env({ dsn: "   " })).enabled).toBe(false);
  });

  it("enables and trims once a DSN is configured", () => {
    const options = buildSentryOptions(env({ dsn: "  https://abc@o1.ingest.sentry.io/2  " }));
    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe("https://abc@o1.ingest.sentry.io/2");
  });

  it("never sends default PII — this is a CRM; headers carry the operator session and URLs carry record ids", () => {
    expect(buildSentryOptions(env({ dsn: "https://x@o1.ingest.sentry.io/2" })).sendDefaultPii).toBe(false);
    expect(buildSentryOptions(env({})).sendDefaultPii).toBe(false);
  });

  it("samples traces low by default, and honours a valid override", () => {
    expect(buildSentryOptions(env({})).tracesSampleRate).toBe(0.1);
    expect(buildSentryOptions(env({ tracesSampleRate: "0" })).tracesSampleRate).toBe(0);
    expect(buildSentryOptions(env({ tracesSampleRate: "1" })).tracesSampleRate).toBe(1);
  });

  it("falls back to the default rather than a nonsense sample rate", () => {
    // A bad value must not silently become 0 (tracing off) or NaN. Number("") is 0.
    for (const raw of ["", "   ", "abc", "-1", "2"]) {
      expect(buildSentryOptions(env({ tracesSampleRate: raw })).tracesSampleRate).toBe(0.1);
    }
  });

  it("tags events with the environment and the deploy SHA so a trace points at a real line", () => {
    const options = buildSentryOptions(env({ vercelEnv: "production", vercelSha: "abc123" }));
    expect(options.environment).toBe("production");
    expect(options.release).toBe("abc123");
  });

  it("prefers explicit overrides over Vercel's own values", () => {
    const options = buildSentryOptions(env({ environment: "staging", vercelEnv: "production", release: "v9", vercelSha: "abc123" }));
    expect(options.environment).toBe("staging");
    expect(options.release).toBe("v9");
  });

  it("defaults the environment to development when nothing is set", () => {
    expect(buildSentryOptions(env({})).environment).toBe("development");
    expect(buildSentryOptions(env({})).release).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";

import { buildRunnerSentryOptions } from "./observability";

const env = (over: Record<string, string | undefined> = {}) => over as NodeJS.ProcessEnv;

describe("buildRunnerSentryOptions", () => {
  it("is disabled with no DSN — the runner must stay inert in dev and tests", () => {
    const options = buildRunnerSentryOptions(env({}));
    expect(options.enabled).toBe(false);
    expect(options.dsn).toBeUndefined();
  });

  it("treats a blank DSN as absent rather than enabling with a broken value", () => {
    expect(buildRunnerSentryOptions(env({ SENTRY_DSN: "   " })).enabled).toBe(false);
  });

  it("enables and trims once a DSN is configured", () => {
    const options = buildRunnerSentryOptions(env({ SENTRY_DSN: " https://k@o1.ingest.sentry.io/9 " }));
    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe("https://k@o1.ingest.sentry.io/9");
  });

  it("never sends default PII — runs carry CRM content and the reply body itself", () => {
    expect(buildRunnerSentryOptions(env({ SENTRY_DSN: "https://k@o1.ingest.sentry.io/9" })).sendDefaultPii).toBe(false);
    expect(buildRunnerSentryOptions(env({})).sendDefaultPii).toBe(false);
  });

  it("reads environment and release from Cloud Run's own injected vars", () => {
    const options = buildRunnerSentryOptions(env({ K_SERVICE: "arc-runner", K_REVISION: "arc-runner-00042-abc" }));
    expect(options.environment).toBe("production");
    expect(options.release).toBe("arc-runner-00042-abc");
  });

  it("defaults to development off Cloud Run, and lets the env be overridden", () => {
    expect(buildRunnerSentryOptions(env({})).environment).toBe("development");
    expect(buildRunnerSentryOptions(env({ SENTRY_ENVIRONMENT: "staging", K_SERVICE: "arc-runner" })).environment).toBe("staging");
  });

  it("samples traces low by default and honours a valid override", () => {
    expect(buildRunnerSentryOptions(env({})).tracesSampleRate).toBe(0.1);
    expect(buildRunnerSentryOptions(env({ SENTRY_TRACES_SAMPLE_RATE: "0" })).tracesSampleRate).toBe(0);
    expect(buildRunnerSentryOptions(env({ SENTRY_TRACES_SAMPLE_RATE: "1" })).tracesSampleRate).toBe(1);
  });

  it("falls back rather than accept a nonsense sample rate", () => {
    // Number("") is 0 — a blank-but-present var must not silently disable tracing.
    for (const raw of ["", "   ", "abc", "-1", "2"]) {
      expect(buildRunnerSentryOptions(env({ SENTRY_TRACES_SAMPLE_RATE: raw })).tracesSampleRate).toBe(0.1);
    }
  });
});

import { describe, expect, it } from "vitest";

import {
  buildResendEmailPayload,
  computeConnectionStatus,
  CONNECTION_REGISTRY,
  resolveDispatchIdempotencyKey,
} from "../connections";

describe("CONNECTION_REGISTRY", () => {
  it("includes resend as an email connection backed by RESEND_API_KEY", () => {
    const resend = CONNECTION_REGISTRY.find((entry) => entry.provider === "resend");
    expect(resend).toMatchObject({ provider: "resend", kind: "email", envVar: "RESEND_API_KEY" });
  });

  it("includes the four social providers with kind=social and no env var", () => {
    const social = CONNECTION_REGISTRY.filter((entry) => entry.kind === "social");
    expect(social.map((entry) => entry.provider).sort()).toEqual(["facebook", "instagram", "linkedin", "x"]);
    expect(social.every((entry) => entry.envVar === null)).toBe(true);
  });

  it("has a unique provider per entry", () => {
    const providers = CONNECTION_REGISTRY.map((entry) => entry.provider);
    expect(new Set(providers).size).toBe(providers.length);
  });
});

describe("computeConnectionStatus", () => {
  it("is not_configured when the env secret is absent (even if enabled)", () => {
    expect(computeConnectionStatus({ envPresent: false, enabled: true, lastTestOk: true })).toBe("not_configured");
  });

  it("is disabled when configured but the operator switch is off", () => {
    expect(computeConnectionStatus({ envPresent: true, enabled: false, lastTestOk: true })).toBe("disabled");
  });

  it("is error when enabled but the last test failed", () => {
    expect(computeConnectionStatus({ envPresent: true, enabled: true, lastTestOk: false })).toBe("error");
  });

  it("is connected when enabled and the last test passed", () => {
    expect(computeConnectionStatus({ envPresent: true, enabled: true, lastTestOk: true })).toBe("connected");
  });

  it("is connected when enabled and untested (lastTestOk null)", () => {
    expect(computeConnectionStatus({ envPresent: true, enabled: true, lastTestOk: null })).toBe("connected");
  });
});

describe("buildResendEmailPayload", () => {
  it("normalizes a single recipient to an array and passes through html", () => {
    const payload = buildResendEmailPayload({
      from: "Mark <mark@bigshoulders.com>",
      to: "lead@example.com",
      subject: "Roof inspection",
      html: "<p>Hello</p>",
    });
    expect(payload).toEqual({
      from: "Mark <mark@bigshoulders.com>",
      to: ["lead@example.com"],
      subject: "Roof inspection",
      html: "<p>Hello</p>",
    });
  });

  it("keeps an array of recipients and includes text when given", () => {
    const payload = buildResendEmailPayload({
      from: "a@b.com",
      to: ["x@y.com", "z@y.com"],
      subject: "Hi",
      text: "plain",
    });
    expect(payload.to).toEqual(["x@y.com", "z@y.com"]);
    expect(payload.text).toBe("plain");
    expect(payload).not.toHaveProperty("html");
  });

  it("throws when from is missing", () => {
    expect(() => buildResendEmailPayload({ from: "  ", to: "x@y.com", subject: "s", html: "<p/>" })).toThrow(/from/i);
  });

  it("throws when there are no recipients", () => {
    expect(() => buildResendEmailPayload({ from: "a@b.com", to: [], subject: "s", html: "<p/>" })).toThrow(/recipient/i);
  });

  it("throws when subject is empty", () => {
    expect(() => buildResendEmailPayload({ from: "a@b.com", to: "x@y.com", subject: "", html: "<p/>" })).toThrow(/subject/i);
  });

  it("throws when neither html nor text is provided", () => {
    expect(() => buildResendEmailPayload({ from: "a@b.com", to: "x@y.com", subject: "s" })).toThrow(/html|text|body/i);
  });
});

describe("resolveDispatchIdempotencyKey", () => {
  it("is stable for the same provider, channel, and approval item", () => {
    const parts = { provider: "resend", channel: "email", approvalItemId: "appr-1" };
    expect(resolveDispatchIdempotencyKey(parts)).toBe(resolveDispatchIdempotencyKey(parts));
  });

  it("differs when the approval item differs", () => {
    const a = resolveDispatchIdempotencyKey({ provider: "resend", channel: "email", approvalItemId: "appr-1" });
    const b = resolveDispatchIdempotencyKey({ provider: "resend", channel: "email", approvalItemId: "appr-2" });
    expect(a).not.toBe(b);
  });
});

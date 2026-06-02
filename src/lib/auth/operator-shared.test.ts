import { afterEach, describe, expect, it } from "vitest";

import {
  getConfiguredOperatorCredentials,
  getConfiguredOperatorToken,
  getSafeOperatorReturnPath,
  isOperatorGateEnabled,
  isValidOperatorCredentials,
  isValidOperatorValue,
} from "./operator-shared";

afterEach(() => {
  delete process.env.OPERATOR_ACCESS_TOKEN;
  delete process.env.OPERATOR_EMAIL;
  delete process.env.OPERATOR_PASSWORD;
});

describe("operator access gate", () => {
  it("stays disabled until an operator token is configured", () => {
    expect(getConfiguredOperatorToken()).toBeUndefined();
    expect(isOperatorGateEnabled()).toBe(false);
    expect(isValidOperatorValue("anything")).toBe(false);
  });

  it("accepts only the configured token", () => {
    process.env.OPERATOR_ACCESS_TOKEN = "local-secret";

    expect(getConfiguredOperatorToken()).toBe("local-secret");
    expect(isOperatorGateEnabled()).toBe(true);
    expect(isValidOperatorValue("wrong")).toBe(false);
    expect(isValidOperatorValue("local-secret")).toBe(true);
  });

  it("accepts only the configured operator email and password", () => {
    process.env.OPERATOR_EMAIL = "Evan@BigShoulders.local ";
    process.env.OPERATOR_PASSWORD = "correct-password";

    expect(getConfiguredOperatorCredentials()).toEqual({
      email: "evan@bigshoulders.local",
      password: "correct-password",
    });
    expect(isValidOperatorCredentials("evan@bigshoulders.local", "wrong")).toBe(false);
    expect(isValidOperatorCredentials("evan@bigshoulders.local", "correct-password")).toBe(true);
    expect(isValidOperatorCredentials(" EVAN@BIGSHOULDERS.LOCAL ", "correct-password")).toBe(true);
  });
});

describe("getSafeOperatorReturnPath", () => {
  it("preserves same-site paths with search params", () => {
    expect(getSafeOperatorReturnPath("/crm/leads?stage=new")).toBe("/crm/leads?stage=new");
  });

  it("falls back for external, protocol-relative, and auth-page returns", () => {
    expect(getSafeOperatorReturnPath("https://example.com/crm")).toBe("/");
    expect(getSafeOperatorReturnPath("//example.com/crm")).toBe("/");
    expect(getSafeOperatorReturnPath("/login?from=/crm")).toBe("/");
    expect(getSafeOperatorReturnPath("/sign-in")).toBe("/");
    expect(getSafeOperatorReturnPath(undefined)).toBe("/");
  });
});

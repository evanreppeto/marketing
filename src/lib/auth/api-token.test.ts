import { afterEach, describe, expect, it } from "vitest";

import { checkBearerToken } from "./api-token";

const ENV = "TEST_API_TOKEN";

function req(authorization?: string) {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === "authorization" ? (authorization ?? null) : null),
    },
  };
}

afterEach(() => {
  delete process.env[ENV];
});

describe("checkBearerToken (required, default — agent endpoints)", () => {
  it("refuses with 503 when no token is configured", () => {
    const result = checkBearerToken(req("Bearer anything"), ENV);
    expect(result).toEqual({ ok: false, status: 503, reason: "not_configured" });
  });

  it("rejects with 401 when the token is wrong", () => {
    process.env[ENV] = "secret";
    expect(checkBearerToken(req("Bearer nope"), ENV)).toEqual({ ok: false, status: 401, reason: "unauthorized" });
  });

  it("rejects with 401 when the header is missing", () => {
    process.env[ENV] = "secret";
    expect(checkBearerToken(req(undefined), ENV)).toEqual({ ok: false, status: 401, reason: "unauthorized" });
  });

  it("accepts a matching bearer token", () => {
    process.env[ENV] = "secret";
    expect(checkBearerToken(req("Bearer secret"), ENV)).toEqual({ ok: true });
  });
});

describe("checkBearerToken (required: false — public-ish intake)", () => {
  it("allows the request when no token is configured (back-compat)", () => {
    expect(checkBearerToken(req(undefined), ENV, { required: false })).toEqual({ ok: true });
  });

  it("enforces the token once it IS configured", () => {
    process.env[ENV] = "secret";
    expect(checkBearerToken(req("Bearer nope"), ENV, { required: false })).toEqual({
      ok: false,
      status: 401,
      reason: "unauthorized",
    });
    expect(checkBearerToken(req("Bearer secret"), ENV, { required: false })).toEqual({ ok: true });
  });
});

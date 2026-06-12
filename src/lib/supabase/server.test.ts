import { describe, expect, it, vi } from "vitest";

import { createResilientFetch } from "./server";

const REQUEST = "https://example.supabase.co/rest/v1/app_settings" as unknown as Parameters<typeof fetch>[0];

describe("createResilientFetch circuit breaker", () => {
  it("calls through to the base fetch on success and keeps the breaker closed", async () => {
    const base = vi.fn(async () => new Response("ok"));
    const wrapped = createResilientFetch(base, { timeoutMs: 2500, cooldownMs: 30_000, now: () => 0 });

    await wrapped(REQUEST);
    await wrapped(REQUEST);

    expect(base).toHaveBeenCalledTimes(2);
  });

  it("surfaces connection failures as AbortError so postgrest-js does not retry", async () => {
    const base = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const wrapped = createResilientFetch(base, { timeoutMs: 2500, cooldownMs: 30_000, now: () => 0 });

    // postgrest-js only retries when the rejection is NOT an AbortError, so the
    // wrapper must rename the failure to short-circuit the 7s retry backoff.
    await expect(wrapped(REQUEST)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("trips after a connection failure and short-circuits later calls without hitting the network", async () => {
    let clock = 0;
    const base = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const wrapped = createResilientFetch(base, { timeoutMs: 2500, cooldownMs: 30_000, now: () => clock });

    // First call probes the network, fails, and opens the breaker.
    await expect(wrapped(REQUEST)).rejects.toThrow();
    expect(base).toHaveBeenCalledTimes(1);

    // Subsequent calls within the cooldown fail fast WITHOUT calling base fetch.
    clock = 1_000;
    await expect(wrapped(REQUEST)).rejects.toThrow();
    await expect(wrapped(REQUEST)).rejects.toThrow();
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("probes again once the cooldown elapses and recovers on success", async () => {
    let clock = 0;
    let shouldFail = true;
    const base = vi.fn(async () => {
      if (shouldFail) throw new TypeError("fetch failed");
      return new Response("ok");
    });
    const wrapped = createResilientFetch(base, { timeoutMs: 2500, cooldownMs: 30_000, now: () => clock });

    await expect(wrapped(REQUEST)).rejects.toThrow();
    expect(base).toHaveBeenCalledTimes(1);

    // Still within cooldown: short-circuited.
    clock = 10_000;
    await expect(wrapped(REQUEST)).rejects.toThrow();
    expect(base).toHaveBeenCalledTimes(1);

    // Cooldown elapsed: probe again. Supabase is back, so the breaker closes.
    clock = 30_001;
    shouldFail = false;
    await expect(wrapped(REQUEST)).resolves.toBeInstanceOf(Response);
    expect(base).toHaveBeenCalledTimes(2);

    // Breaker closed: traffic flows normally again.
    await expect(wrapped(REQUEST)).resolves.toBeInstanceOf(Response);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("does not trip the breaker when the caller aborts the request", async () => {
    let clock = 0;
    const base = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      // A caller-aborted request rejects; an un-aborted one succeeds.
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return new Response("ok");
    });
    const wrapped = createResilientFetch(base as typeof fetch, { timeoutMs: 2500, cooldownMs: 30_000, now: () => clock });

    const controller = new AbortController();
    controller.abort();
    await expect(wrapped(REQUEST, { signal: controller.signal })).rejects.toBeTruthy();
    expect(base).toHaveBeenCalledTimes(1);

    // A caller-initiated abort must NOT open the breaker — the next call still probes.
    clock = 1_000;
    await expect(wrapped(REQUEST)).resolves.toBeInstanceOf(Response);
    expect(base).toHaveBeenCalledTimes(2);
  });
});

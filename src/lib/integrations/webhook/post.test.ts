import { describe, expect, it, vi } from "vitest";

import { postWebhook } from "./post";

describe("postWebhook", () => {
  it("rejects a non-https endpoint without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const res = await postWebhook("http://insecure.example/hook", { type: "t" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an empty endpoint", async () => {
    expect((await postWebhook("", { type: "t" })).ok).toBe(false);
  });

  it("is ok on any 2xx and reports the status", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, status: 204 }) as Response);
    const res = await postWebhook("https://hooks.example/x", { type: "arc.test" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toEqual({ ok: true, status: 204 });
  });

  it("surfaces a non-2xx as an error", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({ ok: false, status: 500 }) as Response);
    const res = await postWebhook("https://hooks.example/x", { type: "t" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("500");
  });

  it("never throws on a transport failure", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => { throw new Error("ECONNREFUSED"); });
    const res = await postWebhook("https://hooks.example/x", { type: "t" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.ok).toBe(false);
  });

  it("posts a JSON body carrying the payload type", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, status: 200 }) as Response);
    await postWebhook("https://hooks.example/x", { type: "arc.approved_send", body: "hi" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ type: "arc.approved_send", body: "hi" });
  });
});

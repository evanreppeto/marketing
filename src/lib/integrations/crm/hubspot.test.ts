import { describe, expect, it, vi } from "vitest";

import { checkHubspotConnection, hubspotCrmImportSource } from "./hubspot";

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("hubspotCrmImportSource", () => {
  it("maps results and follows the paging cursor", async () => {
    const pages: Record<string, unknown> = {
      "": { results: [{ id: "1", properties: { email: "a@b.co" } }], paging: { next: { after: "cursor-2" } } },
      "cursor-2": { results: [{ id: "2", properties: { email: "c@d.co" } }] },
    };
    const fetchImpl = vi.fn(async (url: string) => {
      const after = new URL(url).searchParams.get("after") ?? "";
      return jsonResponse(200, pages[after]);
    }) as unknown as typeof fetch;

    const source = hubspotCrmImportSource("tok", { fetchImpl });
    const p1 = await source.listContacts();
    expect(p1.contacts.map((c) => c.id)).toEqual(["1"]);
    expect(p1.nextCursor).toBe("cursor-2");

    const p2 = await source.listContacts(p1.nextCursor ?? undefined);
    expect(p2.contacts.map((c) => c.id)).toEqual(["2"]);
    expect(p2.nextCursor).toBeNull();
  });

  it("sends the bearer token and requests the mapped properties", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { results: [] })) as unknown as typeof fetch;
    await hubspotCrmImportSource("secret-token", { fetchImpl }).listContacts();
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/crm/v3/objects/contacts");
    expect(new URL(String(url)).searchParams.get("properties")).toContain("email");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer secret-token" });
  });

  it("throws on a non-2xx page so a partial import is not silently accepted", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, {})) as unknown as typeof fetch;
    await expect(hubspotCrmImportSource("tok", { fetchImpl }).listContacts()).rejects.toThrow(/429/);
  });
});

describe("checkHubspotConnection", () => {
  it("reports ok + contact count from the search total", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { total: 5 })) as unknown as typeof fetch;
    expect(await checkHubspotConnection("tok", { fetchImpl })).toEqual({ ok: true, count: 5 });
  });

  it("reports a rejected token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, {})) as unknown as typeof fetch;
    const res = await checkHubspotConnection("tok", { fetchImpl });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("401");
  });

  it("never throws on a network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await checkHubspotConnection("tok", { fetchImpl })).toMatchObject({ ok: false });
  });
});

import { describe, expect, it, vi } from "vitest";

import { checkMailchimpConnection, mailchimpDataCenter, mailchimpImportSource, mailchimpMemberToContact } from "./mailchimp";

describe("mailchimpDataCenter", () => {
  it("extracts the datacenter suffix", () => {
    expect(mailchimpDataCenter("abc123def456-us21")).toBe("us21");
    expect(mailchimpDataCenter("key-us6")).toBe("us6");
  });
  it("returns null for a key with no datacenter", () => {
    expect(mailchimpDataCenter("nodashkey")).toBeNull();
    expect(mailchimpDataCenter("abc-")).toBeNull(); // empty suffix
    expect(mailchimpDataCenter("abc-notadc")).toBeNull(); // no trailing digits
  });
});

describe("mailchimpMemberToContact", () => {
  it("maps merge fields + email to the engine's contact shape, namespaced id", () => {
    const c = mailchimpMemberToContact({
      id: "abc123",
      email_address: "jordan@acme.com",
      merge_fields: { FNAME: "Jordan", LNAME: "Vega", PHONE: "312-555-1000", COMPANY: "Acme", ADDRESS: { city: "Chicago", state: "IL", zip: "60601" } },
    });
    expect(c).toEqual({
      id: "mailchimp:abc123",
      properties: { firstname: "Jordan", lastname: "Vega", email: "jordan@acme.com", phone: "312-555-1000", company: "Acme", city: "Chicago", state: "IL", zip: "60601" },
    });
  });

  it("falls back to the email as external id when member.id is missing", () => {
    expect(mailchimpMemberToContact({ email_address: "X@Y.com", merge_fields: { FNAME: "X" } })?.id).toBe("mailchimp:email:x@y.com");
  });

  it("returns null for a member with no email/name/phone", () => {
    expect(mailchimpMemberToContact({ id: "x", merge_fields: { COMPANY: "Acme" } })).toBeNull();
  });
});

describe("mailchimpImportSource", () => {
  const key = "abc-us21";

  it("fetches a page of members from the datacenter host with the key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ members: [{ id: "m1", email_address: "a@b.com", merge_fields: { FNAME: "A" } }], total_items: 1 }), { status: 200 }));
    const src = mailchimpImportSource(key, "list-1", { fetchImpl: fetchImpl as unknown as typeof fetch });
    const page = await src.listContacts();
    expect(page.contacts).toEqual([{ id: "mailchimp:m1", properties: { firstname: "A", email: "a@b.com" } }]);
    expect(page.nextCursor).toBeNull(); // fewer than a full page → last page
    const calls = fetchImpl.mock.calls as unknown as Array<[string, { headers: Record<string, string> }]>;
    expect(calls[0][0]).toContain("https://us21.api.mailchimp.com/3.0/lists/list-1/members");
    expect(calls[0][1].headers.Authorization).toBe(`Bearer ${key}`);
  });

  it("throws on a non-2xx so the engine records a failure instead of a partial import", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    const src = mailchimpImportSource(key, "list-1", { fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(src.listContacts()).rejects.toThrow(/401/);
  });

  it("rejects an invalid key (no datacenter)", async () => {
    const src = mailchimpImportSource("nodash", "list-1", { fetchImpl: (async () => new Response("{}")) as unknown as typeof fetch });
    await expect(src.listContacts()).rejects.toThrow(/Invalid Mailchimp API key/);
  });
});

describe("checkMailchimpConnection", () => {
  it("returns the member count on success", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ total_items: 4200 }), { status: 200 }));
    const res = await checkMailchimpConnection("abc-us21", "list-1", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toEqual({ ok: true, count: 4200 });
  });
  it("reports a bad key without calling out", async () => {
    const res = await checkMailchimpConnection("nodash", "list-1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Invalid API key/);
  });
});

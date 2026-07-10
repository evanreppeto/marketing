import { describe, expect, it } from "vitest";

import { type Contact } from "../contacts";
import { resolveCampaignAudience, type CampaignAudienceTarget } from "../audience-resolution";

function contact(overrides: Partial<Contact> & { id: string }): Contact {
  // Base defaults, then spread overrides so an explicit null (email/phone/…) wins
  // over the default rather than falling through a `??`.
  const base: Contact = {
    id: overrides.id,
    companyId: null,
    persona: "persona_homeowner_emergency",
    status: "active",
    firstName: "Pat",
    lastName: "Rivera",
    fullName: "Pat Rivera",
    email: "pat@example.com",
    phone: "312-555-0100",
    title: null,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

const PERSONA = "persona_homeowner_emergency";
const target: CampaignAudienceTarget = { persona: PERSONA };

describe("resolveCampaignAudience", () => {
  it("includes active persona-matched contacts with a valid email and excludes other personas", () => {
    const contacts = [
      contact({ id: "a", persona: PERSONA, email: "a@example.com" }),
      contact({ id: "b", persona: "persona_property_manager", email: "b@example.com" }),
      contact({ id: "c", persona: PERSONA, email: "c@example.com" }),
    ];
    const res = resolveCampaignAudience(target, contacts, "email");
    expect(res.recipients.map((r) => r.contactId)).toEqual(["a", "c"]);
    expect(res.eligibleCount).toBe(2);
    expect(res.suppressedCount).toBe(0);
  });

  it("suppresses do_not_contact / inactive / archived with reason tags", () => {
    const contacts = [
      contact({ id: "dnc", status: "do_not_contact" }),
      contact({ id: "ina", status: "inactive" }),
      contact({ id: "arc", status: "archived" }),
      contact({ id: "ok", status: "active" }),
    ];
    const res = resolveCampaignAudience(target, contacts, "email");
    expect(res.recipients.map((r) => r.contactId)).toEqual(["ok"]);
    expect(res.suppressed).toEqual([
      { contactId: "dnc", reason: "status_do_not_contact" },
      { contactId: "ina", reason: "status_inactive" },
      { contactId: "arc", reason: "status_archived" },
    ]);
  });

  it("suppresses missing and malformed emails", () => {
    const contacts = [
      contact({ id: "none", email: null }),
      contact({ id: "blank", email: "   " }),
      contact({ id: "bad", email: "not-an-email" }),
      contact({ id: "good", email: "good@example.com" }),
    ];
    const res = resolveCampaignAudience(target, contacts, "email");
    expect(res.recipients.map((r) => r.contactId)).toEqual(["good"]);
    expect(res.suppressed).toEqual([
      { contactId: "none", reason: "missing_email" },
      { contactId: "blank", reason: "missing_email" },
      { contactId: "bad", reason: "invalid_email" },
    ]);
  });

  it("de-duplicates by normalized email, keeping the first occurrence", () => {
    const contacts = [
      contact({ id: "first", email: "Dup@Example.com" }),
      contact({ id: "second", email: "dup@example.com" }),
    ];
    const res = resolveCampaignAudience(target, contacts, "email");
    expect(res.recipients.map((r) => r.contactId)).toEqual(["first"]);
    expect(res.recipients[0].address).toBe("dup@example.com");
    expect(res.suppressed).toEqual([{ contactId: "second", reason: "duplicate" }]);
  });

  it("targets a single contact when contactId is set, ignoring persona/company", () => {
    const contacts = [
      contact({ id: "target", persona: "persona_insurance_agent", email: "t@example.com" }),
      contact({ id: "other", persona: PERSONA, email: "o@example.com" }),
    ];
    const res = resolveCampaignAudience({ persona: PERSONA, contactId: "target" }, contacts, "email");
    expect(res.recipients.map((r) => r.contactId)).toEqual(["target"]);
  });

  it("still suppresses a directly-targeted contact that is opted out", () => {
    const contacts = [contact({ id: "target", status: "do_not_contact" })];
    const res = resolveCampaignAudience({ persona: PERSONA, contactId: "target" }, contacts, "email");
    expect(res.recipients).toEqual([]);
    expect(res.suppressed).toEqual([{ contactId: "target", reason: "status_do_not_contact" }]);
  });

  it("narrows the persona audience to a company when companyId is set", () => {
    const contacts = [
      contact({ id: "in", persona: PERSONA, companyId: "co-1", email: "in@example.com" }),
      contact({ id: "out", persona: PERSONA, companyId: "co-2", email: "out@example.com" }),
    ];
    const res = resolveCampaignAudience({ persona: PERSONA, companyId: "co-1" }, contacts, "email");
    expect(res.recipients.map((r) => r.contactId)).toEqual(["in"]);
  });

  it("resolves by phone for the sms channel and de-dupes formatting variants", () => {
    const contacts = [
      contact({ id: "p1", email: null, phone: "(312) 555-0100" }),
      contact({ id: "p2", email: null, phone: "312-555-0100" }),
      contact({ id: "p3", email: null, phone: null }),
    ];
    const res = resolveCampaignAudience(target, contacts, "sms");
    expect(res.recipients.map((r) => r.contactId)).toEqual(["p1"]);
    expect(res.suppressed).toEqual([
      { contactId: "p2", reason: "duplicate" },
      { contactId: "p3", reason: "missing_phone" },
    ]);
  });

  it("produces a human summary and stable counts", () => {
    const contacts = [
      contact({ id: "ok", email: "ok@example.com" }),
      contact({ id: "dnc", status: "do_not_contact" }),
    ];
    const res = resolveCampaignAudience(target, contacts, "email");
    expect(res.summary).toBe("1 recipient · 1 suppressed");

    const clean = resolveCampaignAudience(target, [contact({ id: "a" }), contact({ id: "b", email: "b@example.com" })], "email");
    expect(clean.summary).toBe("2 recipients");
  });
});

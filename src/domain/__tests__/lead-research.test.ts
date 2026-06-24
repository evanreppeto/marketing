import { describe, expect, it } from "vitest";

import { parseLeadResearchInput } from "@/domain";

const valid = {
  persona: "persona_plumbing_partner",
  company: { name: "Acme Plumbing", website_url: "https://acme.example" },
  contacts: [{ first_name: "Dana", last_name: "Lee", title: "Owner", email: "Dana@Acme.example", phone: "(312) 555-0144" }],
  evidence: [{ url: "https://acme.example/about", note: "team page" }],
  confidence: 0.8,
};

describe("parseLeadResearchInput", () => {
  it("accepts a well-formed research lead and normalizes fields", () => {
    const result = parseLeadResearchInput(valid);
    if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
    expect(result.value.persona).toBe("persona_plumbing_partner");
    expect(result.value.company.name).toBe("Acme Plumbing");
    expect(result.value.contacts[0].email).toBe("dana@acme.example"); // lowercased
    expect(result.value.contacts[0].title).toBe("Owner");
    expect(result.value.confidence).toBe(0.8);
  });

  it("rejects unassigned_persona", () => {
    const result = parseLeadResearchInput({ ...valid, persona: "unassigned_persona" });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown persona", () => {
    const result = parseLeadResearchInput({ ...valid, persona: "persona_made_up" });
    expect(result.ok).toBe(false);
  });

  it("requires at least one source of evidence", () => {
    const result = parseLeadResearchInput({ ...valid, evidence: [] });
    expect(result.ok).toBe(false);
  });

  it("requires the company to have a name", () => {
    const result = parseLeadResearchInput({ ...valid, company: { name: "  " } });
    expect(result.ok).toBe(false);
  });

  it("requires each contact to have at least a name, email, or phone", () => {
    const result = parseLeadResearchInput({ ...valid, contacts: [{ title: "Owner" }] });
    expect(result.ok).toBe(false);
  });

  it("drops a malformed email to null rather than fabricating", () => {
    const result = parseLeadResearchInput({
      ...valid,
      contacts: [{ first_name: "Dana", email: "not-an-email" }],
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.contacts[0].email).toBeNull();
    expect(result.value.contacts[0].firstName).toBe("Dana");
  });
});

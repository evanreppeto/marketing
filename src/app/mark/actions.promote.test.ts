import { describe, expect, it } from "vitest";

import { validatePromoteTarget } from "./actions";

describe("validatePromoteTarget", () => {
  it("accepts an existing campaign", () => {
    expect(validatePromoteTarget({ mode: "existing", campaignId: "c1" }).ok).toBe(true);
  });
  it("rejects existing with no id", () => {
    expect(validatePromoteTarget({ mode: "existing", campaignId: "" }).ok).toBe(false);
  });
  it("accepts a valid new campaign", () => {
    expect(validatePromoteTarget({ mode: "new", name: "X", persona: "persona_landlord", restorationFocus: "flood" }).ok).toBe(true);
  });
  it("rejects new with invalid persona", () => {
    expect(validatePromoteTarget({ mode: "new", name: "X", persona: "nope", restorationFocus: "flood" }).ok).toBe(false);
  });
  it("rejects new with invalid focus", () => {
    expect(validatePromoteTarget({ mode: "new", name: "X", persona: "persona_landlord", restorationFocus: "nope" }).ok).toBe(false);
  });
  it("rejects new with empty name", () => {
    expect(validatePromoteTarget({ mode: "new", name: "  ", persona: "persona_landlord", restorationFocus: "flood" }).ok).toBe(false);
  });
});

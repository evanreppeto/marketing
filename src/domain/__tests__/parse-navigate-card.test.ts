import { describe, expect, it } from "vitest";

import { parseActions } from "@/domain";

describe("parseActions — navigate kind", () => {
  it("parses a valid navigate card with appState", () => {
    const [card] = parseActions([
      {
        kind: "navigate",
        title: "Open the 3 matching leads in CRM",
        appState: { href: "/crm/leads?persona=landlord", filters: ["persona: landlord", "last touch > 60d"] },
      },
    ]);
    expect(card.kind).toBe("navigate");
    expect(card.appState).toEqual({ href: "/crm/leads?persona=landlord", filters: ["persona: landlord", "last touch > 60d"] });
  });

  it("drops a navigate card with an external href", () => {
    expect(
      parseActions([{ kind: "navigate", title: "Bad", appState: { href: "https://evil.example.com", filters: [] } }]),
    ).toEqual([]);
  });

  it("drops a navigate card with no appState", () => {
    expect(parseActions([{ kind: "navigate", title: "No destination" }])).toEqual([]);
  });

  it("still parses result/draft cards unchanged", () => {
    const out = parseActions([{ kind: "result", title: "Found", rows: [] }]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("result");
  });
});

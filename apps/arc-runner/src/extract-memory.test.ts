import { describe, expect, it } from "vitest";

import { buildExtractionPrompt, parseDurableFacts } from "./extract-memory";

describe("buildExtractionPrompt", () => {
  it("renders turns oldest-first with roles", () => {
    const p = buildExtractionPrompt([
      { role: "operator", body: "We only ever target storm-damage homeowners." },
      { role: "arc", body: "Understood." },
    ]);
    expect(p).toContain("Operator: We only ever target storm-damage homeowners.");
    expect(p).toContain("Arc: Understood.");
  });
});

describe("parseDurableFacts", () => {
  it("parses a clean JSON array", () => {
    const facts = parseDurableFacts('[{"label":"Target segment","fact":"Focus on storm-damage homeowners."}]');
    expect(facts).toEqual([{ label: "Target segment", fact: "Focus on storm-damage homeowners." }]);
  });

  it("tolerates surrounding prose and extracts the array", () => {
    const facts = parseDurableFacts('Here are the facts: [{"label":"A","fact":"B"}] hope that helps');
    expect(facts).toEqual([{ label: "A", fact: "B" }]);
  });

  it("drops entries missing label or fact, and caps at 5", () => {
    const many = JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ label: `L${i}`, fact: `F${i}` })));
    expect(parseDurableFacts(many)).toHaveLength(5);
    expect(parseDurableFacts('[{"label":"only"},{"fact":"only"},{"label":"ok","fact":"ok"}]')).toEqual([{ label: "ok", fact: "ok" }]);
  });

  it("returns [] for junk / empty / non-array", () => {
    for (const raw of ["", "no json here", "{}", "null", "[]"]) {
      expect(parseDurableFacts(raw)).toEqual([]);
    }
  });
});

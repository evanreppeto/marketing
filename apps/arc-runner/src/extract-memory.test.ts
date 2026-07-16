import { describe, expect, it } from "vitest";

import {
  buildExtractionPrompt,
  learningKeyFor,
  parseDurableFacts,
  selectPromotionWindow,
} from "./extract-memory";
import type { ArcHistoryTurn } from "./types";

describe("buildExtractionPrompt", () => {
  it("renders turns oldest-first with roles", () => {
    const p = buildExtractionPrompt([
      { role: "operator", body: "We only ever target storm-damage homeowners." },
      { role: "arc", body: "Understood." },
    ]);
    expect(p).toContain("Operator: We only ever target storm-damage homeowners.");
    expect(p).toContain("Arc: Understood.");
  });

  it("includes the rolling summary as context when there is one", () => {
    const p = buildExtractionPrompt([{ role: "operator", body: "And the same for mold." }], "Operator set storm-only targeting.");
    expect(p).toContain("Operator set storm-only targeting.");
    expect(p).toContain("Operator: And the same for mold.");
  });

  it("omits the summary section entirely when absent or blank", () => {
    for (const summary of [undefined, null, "   "]) {
      expect(buildExtractionPrompt([{ role: "operator", body: "hi" }], summary)).not.toContain("EARLIER IN THIS CONVERSATION");
    }
  });
});

describe("selectPromotionWindow", () => {
  const turn = (i: number): ArcHistoryTurn => ({ role: i % 2 === 0 ? "operator" : "arc", body: `turn ${i}` });

  it("keeps the most recent turns, newest last", () => {
    const window = selectPromotionWindow(Array.from({ length: 20 }, (_, i) => turn(i)));
    expect(window).toHaveLength(8);
    expect(window.at(-1)?.body).toBe("turn 19");
    expect(window.at(0)?.body).toBe("turn 12");
  });

  it("keeps a short conversation whole — the case the old overflow trigger never fired on", () => {
    const short = [turn(0), turn(1)];
    expect(selectPromotionWindow(short)).toEqual(short);
  });

  it("drops empty and whitespace-only turns", () => {
    const window = selectPromotionWindow([turn(0), { role: "arc", body: "   " }, { role: "arc", body: "" }, turn(3)]);
    expect(window.map((t) => t.body)).toEqual(["turn 0", "turn 3"]);
  });
});

describe("learningKeyFor", () => {
  it("is stable and identical for the same label, so a re-learn upserts one node", () => {
    expect(learningKeyFor("Target segment")).toBe(learningKeyFor("Target segment"));
    expect(learningKeyFor("Target segment")).toBe("chat-learning:target-segment");
  });

  it("normalizes case and punctuation", () => {
    expect(learningKeyFor("  Target Segment!  ")).toBe("chat-learning:target-segment");
  });

  it("distinguishes different facts", () => {
    expect(learningKeyFor("Target segment")).not.toBe(learningKeyFor("Preferred tone"));
  });

  it("returns null for a label that slugs to nothing, rather than keying on empty", () => {
    for (const junk of ["!!!", "   ", "---"]) expect(learningKeyFor(junk)).toBeNull();
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

import { describe, expect, it } from "vitest";

import { parseQuestions } from "../arc-chat";

describe("parseQuestions", () => {
  it("returns [] for non-arrays / garbage", () => {
    expect(parseQuestions(undefined)).toEqual([]);
    expect(parseQuestions(null)).toEqual([]);
    expect(parseQuestions("x")).toEqual([]);
  });

  it("drops entries without a prompt or any way to answer", () => {
    expect(parseQuestions([{ options: ["a"] }])).toEqual([]); // no prompt
    expect(parseQuestions([{ prompt: "Pick one" }])).toEqual([]); // no options, no free text
  });

  it("parses a single-select question and defaults id when absent", () => {
    const out = parseQuestions([{ prompt: "Which persona?", options: ["Homeowner", "Landlord"] }]);
    expect(out).toEqual([{ id: "q0", prompt: "Which persona?", options: ["Homeowner", "Landlord"], multi: false, allowText: false }]);
  });

  it("keeps multi + allowText flags and a free-text-only question", () => {
    const out = parseQuestions([
      { id: "channels", prompt: "Which channels?", options: ["Email", "SMS"], multi: true, allowText: true },
      { prompt: "Anything else?", allowText: true },
    ]);
    expect(out[0]).toMatchObject({ id: "channels", multi: true, allowText: true });
    expect(out[1]).toMatchObject({ prompt: "Anything else?", options: [], allowText: true });
  });

  it("caps options at 8 and questions at 4", () => {
    const manyOptions = Array.from({ length: 12 }, (_, i) => `o${i}`);
    const out = parseQuestions([{ prompt: "P", options: manyOptions }]);
    expect(out[0].options).toHaveLength(8);

    const manyQuestions = Array.from({ length: 6 }, (_, i) => ({ prompt: `q${i}`, options: ["a"] }));
    expect(parseQuestions(manyQuestions)).toHaveLength(4);
  });
});

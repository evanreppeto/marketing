import { describe, expect, it, vi } from "vitest";

import { jsonResult, runTool, textResult } from "./helpers";

/** A lead-sized row (~600 chars), the payload weight that triggered the bug. */
function row(i: number) {
  return {
    id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    company_id: "20000000-0000-4000-8000-000000000001",
    persona: "persona_homeowner_emergency",
    status: "qualified",
    source: "website",
    loss_summary: `Basement flooding at site ${i}. `.repeat(8),
    loss_signals: ["standing water", "sump failure"],
    lead_score: 80,
    received_at: "2026-07-16T09:00:00.000Z",
  };
}

describe("textResult", () => {
  it("wraps a string as an SDK text content block", () => {
    expect(textResult("hello")).toEqual({ content: [{ type: "text", text: "hello" }] });
  });
  it("truncates very long text to 8000 chars", () => {
    const out = textResult("x".repeat(9000));
    expect(out.content[0].text.length).toBe(8000);
  });
  it("announces the cut instead of slicing silently", () => {
    // A silent slice is indistinguishable from a complete result to the model.
    const out = textResult("x".repeat(9000));
    expect(out.content[0].text).toContain("TRUNCATED");
  });
});

describe("jsonResult", () => {
  it("passes a payload within budget through untouched", () => {
    const out = jsonResult({ leads: [row(1)], total: 1 });
    expect(JSON.parse(out.content[0].text)).toEqual({ leads: [row(1)], total: 1 });
  });

  it("keeps an over-budget payload parseable as JSON", () => {
    // The core defect: slicing 200 rows of JSON text left `[{...},{"id":"abc`,
    // which reads as a complete list. Truncation must never produce broken JSON.
    const out = jsonResult({ leads: Array.from({ length: 200 }, (_, i) => row(i)), total: 200 });

    expect(() => JSON.parse(out.content[0].text)).not.toThrow();
    expect(out.content[0].text.length).toBeLessThanOrEqual(8000);
  });

  it("drops whole elements and says how many went", () => {
    const out = jsonResult({ leads: Array.from({ length: 200 }, (_, i) => row(i)), total: 200 });
    const parsed = JSON.parse(out.content[0].text);

    expect(parsed.leads.length).toBeLessThan(200);
    expect(parsed._truncated.returned).toBe(parsed.leads.length);
    expect(parsed._truncated.dropped).toBe(200 - parsed.leads.length);
    expect(parsed._truncated.note).toMatch(/partial/i);
  });

  it("preserves the total when the rows beside it are trimmed", () => {
    // `total` is the answer to "how many leads do we have?". It sits after the
    // list in key order, so a tail-slice would have eaten it.
    const out = jsonResult({ leads: Array.from({ length: 200 }, (_, i) => row(i)), total: 200 });

    expect(JSON.parse(out.content[0].text).total).toBe(200);
  });

  it("keeps as many elements as fit rather than a token few", () => {
    const out = jsonResult({ leads: Array.from({ length: 200 }, (_, i) => row(i)), total: 200 });
    const parsed = JSON.parse(out.content[0].text);

    expect(parsed.leads.length).toBeGreaterThan(0);
    // One more row would breach the budget — the trim finds the largest prefix.
    const oneMore = JSON.stringify({ ...parsed, leads: [...parsed.leads, row(999)] });
    expect(oneMore.length).toBeGreaterThan(8000);
  });

  it("wraps a bare over-budget array so the marker has somewhere to live", () => {
    const out = jsonResult(Array.from({ length: 200 }, (_, i) => row(i)));
    const parsed = JSON.parse(out.content[0].text);

    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed._truncated.dropped).toBeGreaterThan(0);
  });

  it("announces a cut when there is no list to trim", () => {
    const out = jsonResult({ note: "x".repeat(9000) });

    expect(out.content[0].text).toContain("TRUNCATED");
    expect(out.content[0].text.length).toBe(8000);
  });
});

describe("runTool", () => {
  it("emits running then done and returns the fn result as JSON text", async () => {
    const steps: Array<[string, string]> = [];
    const step = vi.fn(async (label: string, status: "running" | "done") => {
      steps.push([label, status]);
    });
    const out = await runTool(step, "Searching leads", async () => ({ leads: [1, 2] }));
    expect(steps).toEqual([
      ["Searching leads", "running"],
      ["Searching leads", "done"],
    ]);
    expect(JSON.parse(out.content[0].text)).toEqual({ leads: [1, 2] });
  });

  it("still marks done and returns an error message when the fn throws", async () => {
    const step = vi.fn(async () => {});
    const out = await runTool(step, "Searching leads", async () => {
      throw new Error("boom");
    });
    expect(step).toHaveBeenLastCalledWith("Searching leads", "done");
    expect(out.content[0].text).toContain("Searching leads failed: boom");
  });
});

import { describe, expect, it, vi } from "vitest";

import { runTool, textResult } from "./helpers";

describe("textResult", () => {
  it("wraps a string as an SDK text content block", () => {
    expect(textResult("hello")).toEqual({ content: [{ type: "text", text: "hello" }] });
  });
  it("truncates very long text to 8000 chars", () => {
    const out = textResult("x".repeat(9000));
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

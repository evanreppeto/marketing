import { describe, expect, it } from "vitest";

import type { ArcMention, ArcQuestion } from "../types";
import { askOperatorTool, citeSourcesTool, suggestFollowupsTool } from "./reply-meta";

function loose(
  tool:
    | ReturnType<typeof suggestFollowupsTool>
    | ReturnType<typeof citeSourcesTool>
    | ReturnType<typeof askOperatorTool>,
) {
  return (args: Record<string, unknown>) =>
    (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>)(args);
}

describe("suggest_followups", () => {
  it("collects up to 4 follow-up prompts, trimming and dropping empties", async () => {
    const out: string[] = [];
    const tool = suggestFollowupsTool((s) => out.push(s));
    expect(tool.name).toBe("suggest_followups");
    await loose(tool)({ prompts: [" a ", "b", "", "c", "d", "e"] });
    expect(out).toEqual(["a", "b", "c", "d"]); // capped at 4, trimmed, empties dropped
  });
});

describe("cite_sources", () => {
  it("collects sources as mentions", async () => {
    const out: ArcMention[] = [];
    const tool = citeSourcesTool((m) => out.push(m));
    expect(tool.name).toBe("cite_sources");
    await loose(tool)({
      sources: [{ type: "lead", id: "L1", label: "Dana Kasprak", href: "/crm/leads/L1" }],
    });
    expect(out).toEqual<ArcMention[]>([{ type: "lead", id: "L1", label: "Dana Kasprak", href: "/crm/leads/L1" }]);
  });
});

describe("ask_operator", () => {
  it("collects a structured question with options + flags", async () => {
    const out: ArcQuestion[] = [];
    const tool = askOperatorTool((q) => out.push(q));
    expect(tool.name).toBe("ask_operator");
    await loose(tool)({ prompt: "Which channels?", options: [" Email ", "SMS", ""], multi: true, allow_text: true });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ prompt: "Which channels?", options: ["Email", "SMS"], multi: true, allowText: true });
    expect(out[0].id).toBeTruthy();
  });

  it("ignores a question with no options and no free text", async () => {
    const out: ArcQuestion[] = [];
    const tool = askOperatorTool((q) => out.push(q));
    const res = await loose(tool)({ prompt: "Pick one" });
    expect(out).toHaveLength(0);
    expect(res.content[0].text).toMatch(/needs at least one option/i);
  });
});

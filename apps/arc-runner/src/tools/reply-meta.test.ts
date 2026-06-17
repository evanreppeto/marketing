import { describe, expect, it } from "vitest";

import type { ArcMention } from "../types";
import { citeSourcesTool, suggestFollowupsTool } from "./reply-meta";

function loose(tool: ReturnType<typeof suggestFollowupsTool> | ReturnType<typeof citeSourcesTool>) {
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

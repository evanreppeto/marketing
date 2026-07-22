import { describe, expect, it } from "vitest";

import { assembleReplyBody } from "./arc";

describe("assembleReplyBody", () => {
  it("keeps what the model said BEFORE its last tool call", () => {
    // The regression: `result` is only the final message's text. A turn that
    // answers, calls a tool, then closes with next steps reported ONLY the next
    // steps — prod showed an operator four follow-up bullets and no lead count.
    const body = assembleReplyBody(
      ["Total leads: 200. Qualified: 52.", "**Suggested next steps:**\n- Break the 52 down by persona"],
      "**Suggested next steps:**\n- Break the 52 down by persona",
    );

    expect(body).toContain("Total leads: 200");
    expect(body).toContain("Suggested next steps");
  });

  it("separates messages so the last word of one doesn't run into the next", () => {
    const body = assembleReplyBody(["I will look it up.", "The total is 200."], "The total is 200.");
    expect(body).toBe("I will look it up.\n\nThe total is 200.");
    expect(body).not.toContain("up.The");
  });

  it("drops an earlier confirmation that substantially repeats the final answer", () => {
    const body = assembleReplyBody(
      [
        "The CRM contains exactly 200 total leads from search_leads limit=0. No records were created, edited, or sent.",
        "Confirmed: 200 total leads in the CRM via search_leads limit=0. Nothing was created, edited, or sent.",
      ],
      "Confirmed: 200 total leads in the CRM via search_leads limit=0. Nothing was created, edited, or sent.",
    );

    expect(body).toBe("Confirmed: 200 total leads in the CRM via search_leads limit=0. Nothing was created, edited, or sent.");
  });

  it("is unchanged for the common single-message turn", () => {
    const body = assembleReplyBody(["Just the one answer."], "Just the one answer.");
    expect(body).toBe("Just the one answer.");
  });

  it("falls back to result when the turn emitted no assistant text", () => {
    expect(assembleReplyBody([], "fallback text")).toBe("fallback text");
  });

  it("ignores whitespace-only messages rather than padding the reply with blank lines", () => {
    expect(assembleReplyBody(["   ", "Real answer."], "Real answer.")).toBe("Real answer.");
  });

  it("returns empty when there is nothing at all, so the caller can mark the reply failed", () => {
    expect(assembleReplyBody([], "")).toBe("");
  });
});

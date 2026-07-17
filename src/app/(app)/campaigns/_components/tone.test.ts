import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { needsOperatorApproval, type CampaignTone } from "./tone";

const ALL_TONES: CampaignTone[] = ["live", "review", "revise", "approved", "draft", "archived"];

describe("needsOperatorApproval", () => {
  it("counts the packages actually sitting on the operator's desk", () => {
    expect(needsOperatorApproval("review")).toBe(true);
    // Blocked / revision-requested is still the operator's move, and it is what
    // the "Needs approval" tab has always included.
    expect(needsOperatorApproval("revise")).toBe(true);
  });

  it("does not count packages that need nothing from the operator", () => {
    // "approved" is the one that made the old footer absurd: it announced a
    // package as "awaiting your approval" after the operator had approved it.
    for (const tone of ["live", "approved", "draft", "archived"] as CampaignTone[]) {
      expect(needsOperatorApproval(tone), tone).toBe(false);
    }
  });

  it("has an answer for every tone", () => {
    for (const tone of ALL_TONES) expect(typeof needsOperatorApproval(tone)).toBe("boolean");
  });
});

/**
 * The footer is a summary of the tab it sits under. They disagreed in production —
 * tab "Needs approval 4" above "Arc has 9 packages awaiting your approval" — because
 * each derived the count its own way, and the footer's way was a regex over the
 * rendered next-action label.
 *
 * A behavioural test can't easily assert "these two numbers match" across a server
 * page and a client board, so this pins the structural fix instead: both read the
 * one predicate, and neither reconstructs the rule itself.
 */
describe("the tab and its footer count the same thing", () => {
  const read = (p: string) => readFileSync(join(__dirname, p), "utf8");
  const BOARD = read("campaigns-board.tsx");
  const PAGE = read("../page.tsx");

  it("the board's tab count uses the shared predicate", () => {
    expect(BOARD).toMatch(/needs:\s*by\(needsOperatorApproval\)/);
    expect(BOARD).toMatch(/tab === "needs"\) return needsOperatorApproval\(tone\)/);
  });

  it("the page's footer uses the shared predicate", () => {
    expect(PAGE).toMatch(/needsOperatorApproval\(r\.tone\)/);
  });

  it("neither counts approvals by matching a rendered label", () => {
    // The original: rows.reduce(... /Approve/.test(r.next) ...). Reword the label
    // "Approve 1 piece" and the count silently becomes 0.
    for (const [name, src] of [["board", BOARD], ["page", PAGE]] as const) {
      expect(/\/Approve\/\.test/.test(src), name).toBe(false);
    }
  });

  it("neither re-derives the tone rule inline", () => {
    // `tone === "review" || tone === "revise"` written out again anywhere is the
    // drift starting over.
    for (const [name, src] of [["board", BOARD], ["page", PAGE]] as const) {
      expect(/=== "review"\s*\|\|\s*\w+ === "revise"/.test(src), name).toBe(false);
    }
  });
});

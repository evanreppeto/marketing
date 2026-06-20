import { describe, expect, it } from "vitest";
import { buildPersonaPanelRows } from "./brand-personas";
import { PERSONA_CTA_RULES, personaSlug } from "@/lib/persona-intelligence/cta-rules";

const liveRow = (over: Record<string, unknown>) => ({
  key: "", persona: "X", segment: "Seg", stage: "Aware", intent: "", accelerator: "",
  nextAction: "Do thing", contentNeed: "", score: 72, blocker: "", offer: "", crmPath: "",
  tone: "green", ...over,
});

describe("buildPersonaPanelRows", () => {
  it("returns [] when persona memory is unavailable", () => {
    expect(buildPersonaPanelRows({ status: "unavailable", message: "no db" })).toEqual([]);
  });

  it("returns one row per canonical persona", () => {
    const rows = buildPersonaPanelRows({ status: "live", stats: [], personas: [], contentSignals: [], guardrailSignals: [] } as never);
    expect(rows).toHaveLength(PERSONA_CTA_RULES.length);
    expect(rows.every((r) => r.hasLive === false)).toBe(true);
  });

  it("overlays live tracker data by persona slug", () => {
    const first = PERSONA_CTA_RULES[0];
    const slug = personaSlug(first.persona);
    const data = { status: "live", stats: [], personas: [liveRow({ key: slug, persona: "Decision Maker", segment: "Homeowners", stage: "Evaluating", score: 81, tone: "green", nextAction: "Send proof" })], contentSignals: [], guardrailSignals: [] };
    const rows = buildPersonaPanelRows(data as never);
    const hit = rows.find((r) => r.key === slug)!;
    expect(hit).toMatchObject({ hasLive: true, label: "Decision Maker", segment: "Homeowners", stage: "Evaluating", score: 81, tone: "green", nextAction: "Send proof" });
    // personas without a live row still appear, marked not-live
    expect(rows.filter((r) => r.hasLive)).toHaveLength(1);
  });
});

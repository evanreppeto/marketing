import { describe, expect, it } from "vitest";

import { ARC_SYSTEM_PROMPT } from "./prompt";

describe("ARC_SYSTEM_PROMPT", () => {
  it("keeps the non-negotiable outbound lock", () => {
    expect(ARC_SYSTEM_PROMPT).toContain("never send, publish, launch, spend");
    expect(ARC_SYSTEM_PROMPT.toLowerCase()).toContain("human in the loop");
  });

  it("teaches an explicit reasoning loop", () => {
    expect(ARC_SYSTEM_PROMPT).toContain("HOW YOU THINK");
    expect(ARC_SYSTEM_PROMPT.toLowerCase()).toContain("next best action");
    expect(ARC_SYSTEM_PROMPT.toLowerCase()).toContain("self-check");
  });

  it("sets the grounding / anti-hallucination discipline", () => {
    expect(ARC_SYSTEM_PROMPT).toContain("GROUND EVERY CLAIM");
    expect(ARC_SYSTEM_PROMPT).toContain("I don't have data on");
    expect(ARC_SYSTEM_PROMPT.toLowerCase()).toContain("confidence");
  });

  it("sets a proactive operator posture", () => {
    expect(ARC_SYSTEM_PROMPT).toContain("PROACTIVE");
  });

  it("preserves the load-bearing tool + output mechanics", () => {
    for (const token of [
      "create_campaign_draft",
      "emit_card",
      "cite_sources",
      "suggest_followups",
      "record_brain_note",
      "create_lead",
      "update_record",
      "generate_image",
      "analyze_website",
      "propose_brand_profile",
    ]) {
      expect(ARC_SYSTEM_PROMPT).toContain(token);
    }
  });
});

import { describe, expect, it } from "vitest";

import { buildReasoning } from "./read-model";

// buildReasoning only reads a handful of fields; cast minimal fixtures to the
// row shapes to keep the test focused on the distillation logic.
function campaign(reasoning: unknown, audit: unknown = {}) {
  return { reasoning_payload: reasoning, audit_payload: audit } as never;
}

function asset(toolSource: string | null, promptInputs: unknown = {}) {
  return { tool_source: toolSource, prompt_inputs: promptInputs } as never;
}

describe("buildReasoning", () => {
  it("distills why/action/flags/tools/prompt-inputs from Mark's payloads", () => {
    const result = buildReasoning(
      campaign(
        {
          why_hermes_created_it: "Referral persona with water-loss signals.",
          recommended_action: "Approve the first-touch outreach asset.",
          guardrail_flags: ["Human review required", "Outbound locked until approved"],
        },
        { provider: "local_deterministic" },
      ),
      [
        asset("Hermes Orchestrator", { persona: "persona_plumbing_partner", channel: "email", target_id: "x" }),
        asset("Hermes Orchestrator"),
      ],
    );

    expect(result.whyBuilt).toContain("Referral persona");
    expect(result.recommendedAction).toContain("Approve");
    expect(result.guardrailFlags).toHaveLength(2);
    // tool_source dedupes; audit provider is humanized and included
    expect(result.toolsUsed).toEqual(["Hermes Orchestrator", "Local Deterministic"]);
    // readable scalar prompt inputs only, *_id keys filtered out
    expect(result.promptInputs.map((p) => p.label)).toEqual(["Persona", "Channel"]);
  });

  it("falls back gracefully when nothing is recorded", () => {
    const result = buildReasoning(campaign({}, {}), [asset(null)]);
    expect(result.whyBuilt).toMatch(/not recorded reasoning/i);
    expect(result.guardrailFlags).toEqual([]);
    expect(result.toolsUsed).toEqual([]);
    expect(result.promptInputs).toEqual([]);
  });
});

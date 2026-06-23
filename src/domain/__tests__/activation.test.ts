import { describe, expect, it } from "vitest";

import { buildActivationChecklist, type ActivationSignals } from "../activation";

const NONE: ActivationSignals = {
  brandCaptured: false,
  dismissed: false,
  hasMedia: false,
  hasCampaign: false,
  hasTeammate: false,
};

describe("buildActivationChecklist", () => {
  it("returns the four steps in a stable order, all not done for a fresh org", () => {
    const result = buildActivationChecklist(NONE);
    expect(result.steps.map((s) => s.key)).toEqual(["brand", "media", "campaign", "team"]);
    expect(result.steps.every((s) => !s.done)).toBe(true);
  });

  it("maps each signal to its step's done flag", () => {
    const result = buildActivationChecklist({
      brandCaptured: true,
      dismissed: false,
      hasMedia: true,
      hasCampaign: false,
      hasTeammate: true,
    });
    const done = Object.fromEntries(result.steps.map((s) => [s.key, s.done]));
    expect(done).toEqual({ brand: true, media: true, campaign: false, team: true });
  });

  it("treats brand capture as the core completion gate", () => {
    expect(buildActivationChecklist(NONE).coreDone).toBe(false);
    expect(buildActivationChecklist({ ...NONE, brandCaptured: true }).coreDone).toBe(true);
  });

  it("shows the checklist until everything is done or it is dismissed", () => {
    expect(buildActivationChecklist(NONE).showChecklist).toBe(true);
    expect(buildActivationChecklist({ ...NONE, dismissed: true }).showChecklist).toBe(false);
    expect(
      buildActivationChecklist({
        brandCaptured: true,
        dismissed: false,
        hasMedia: true,
        hasCampaign: true,
        hasTeammate: true,
      }).showChecklist,
    ).toBe(false);
  });
});

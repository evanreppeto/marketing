/**
 * First-run activation logic. Pure and deterministic — computes the setup checklist
 * a new workspace owner sees from a set of signals gathered by the lib layer.
 * "Core" completion is brand capture; the other steps are encouragements.
 */

export type ActivationSignals = {
  brandCaptured: boolean;
  dismissed: boolean;
  hasMedia: boolean;
  hasCampaign: boolean;
  hasTeammate: boolean;
};

export type ActivationStepKey = "brand" | "media" | "campaign" | "team";

export type ActivationStep = {
  key: ActivationStepKey;
  done: boolean;
};

export type ActivationChecklist = {
  steps: ActivationStep[];
  coreDone: boolean;
  showChecklist: boolean;
};

export function buildActivationChecklist(signals: ActivationSignals): ActivationChecklist {
  const steps: ActivationStep[] = [
    { key: "brand", done: signals.brandCaptured },
    { key: "media", done: signals.hasMedia },
    { key: "campaign", done: signals.hasCampaign },
    { key: "team", done: signals.hasTeammate },
  ];

  const coreDone = signals.brandCaptured;
  const allDone = steps.every((step) => step.done);
  const showChecklist = !signals.dismissed && !allDone;

  return { steps, coreDone, showChecklist };
}

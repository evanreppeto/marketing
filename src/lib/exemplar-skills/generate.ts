/**
 * Generate an exemplar skill for one workspace: read its campaign history,
 * select the exemplars, render the SKILL.md.
 *
 * Every failure mode is a returned value, never a throw — "not enough proven
 * copy yet" is an ordinary, expected answer here (most workspaces will hit it
 * before they've worked their approval queue), and the operator needs to read
 * the reason. Callers must surface `message` rather than treating a non-`ok`
 * result as an empty success.
 */

import {
  renderExemplarSkill,
  selectExemplars,
  type CampaignAssetType,
  type EvidenceTier,
  type RenderedExemplarSkill,
} from "@/domain";

import { getExemplarCandidates } from "./read-model";

export type GenerateExemplarSkillInput = {
  orgId: string | null | undefined;
  /** Workspace display name — appears in the skill's name and description. */
  workspaceName: string;
  assetType?: CampaignAssetType;
  persona?: string;
  /** ISO timestamp stamped into the skill. Injected so the result is reproducible in tests. */
  generatedAt: string;
  /** Pre-read candidates, for callers that already hold them. Skips the query. */
  candidates?: Awaited<ReturnType<typeof getExemplarCandidates>>;
};

export type GenerateExemplarSkillResult =
  | {
      ok: true;
      skill: RenderedExemplarSkill;
      tier: EvidenceTier;
      /** Asset ids the skill was built from — the provenance a reviewer audits. */
      sourceAssetIds: string[];
      counterExampleAssetIds: string[];
      exemplarCount: number;
    }
  | {
      ok: false;
      /** `unavailable` = infrastructure/tenancy; `insufficient` = real data shortfall. */
      reason: "unavailable" | "insufficient";
      message: string;
    };

export async function generateExemplarSkill(
  input: GenerateExemplarSkillInput,
): Promise<GenerateExemplarSkillResult> {
  const data = input.candidates ?? (await getExemplarCandidates(input.orgId));
  if (data.status === "unavailable") {
    return { ok: false, reason: "unavailable", message: data.message };
  }

  const selection = selectExemplars({
    candidates: data.candidates,
    assetType: input.assetType,
    persona: input.persona,
  });

  if (!selection.ok) {
    return { ok: false, reason: "insufficient", message: selection.detail };
  }

  const skill = renderExemplarSkill({
    selection,
    workspaceName: input.workspaceName,
    assetType: input.assetType,
    persona: input.persona,
    generatedAt: input.generatedAt,
  });

  return {
    ok: true,
    skill,
    tier: selection.tier,
    sourceAssetIds: selection.exemplars.map((exemplar) => exemplar.candidate.assetId),
    counterExampleAssetIds: selection.counterExamples.map((counter) => counter.candidate.assetId),
    exemplarCount: selection.exemplars.length,
  };
}

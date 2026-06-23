export const ARC_SKILL_IDS = {
  companyResearch: "company-research",
  opportunityDiscovery: "opportunity-discovery",
  approvalGatedDrafting: "approval-gated-drafting",
} as const;

export type ArcSkillId = (typeof ARC_SKILL_IDS)[keyof typeof ARC_SKILL_IDS];

const COMMAND_SKILLS: Record<string, ArcSkillId> = {
  "find-leads": ARC_SKILL_IDS.opportunityDiscovery,
  opportunities: ARC_SKILL_IDS.opportunityDiscovery,
  score: ARC_SKILL_IDS.opportunityDiscovery,
  persona: ARC_SKILL_IDS.companyResearch,
  "draft-campaign": ARC_SKILL_IDS.approvalGatedDrafting,
  "draft-email": ARC_SKILL_IDS.approvalGatedDrafting,
  "follow-up": ARC_SKILL_IDS.approvalGatedDrafting,
  assets: ARC_SKILL_IDS.companyResearch,
  performance: ARC_SKILL_IDS.opportunityDiscovery,
  signals: ARC_SKILL_IDS.companyResearch,
  "whats-pending": ARC_SKILL_IDS.companyResearch,
  summarize: ARC_SKILL_IDS.companyResearch,
};

export function skillIdForArcCommand(command: string | null | undefined): ArcSkillId | null {
  const id = typeof command === "string" ? command.trim().replace(/^\//, "") : "";
  if (!id) return null;
  return COMMAND_SKILLS[id] ?? null;
}

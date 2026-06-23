export type ArcSkillApprovalPolicy = "read_only" | "propose_only" | "approval_gated_drafts";

export type ArcSkill = {
  id: string;
  name: string;
  description: string;
  businessAgnostic: true;
  approvalPolicy: ArcSkillApprovalPolicy;
  allowedTools: readonly string[];
  instructions: readonly string[];
  outputContract: readonly string[];
};

export const ARC_SKILLS: readonly ArcSkill[] = [
  {
    id: "company-research",
    name: "Company research",
    description: "Research a company, market, or prospect using public and workspace sources.",
    businessAgnostic: true,
    approvalPolicy: "propose_only",
    allowedTools: ["research_web", "emit_card", "cite_sources", "suggest_followups", "ask_operator"],
    instructions: [
      "Use this skill when the operator wants source-backed research about a company, category, market, or prospect.",
      "Stay neutral to the workspace's industry. Let the business context and operator goal define what matters.",
      "Do not create or edit CRM records, drafts, media, or opportunities from this skill alone.",
    ],
    outputContract: [
      "Return source-backed findings with citations.",
      "Separate confirmed facts from inferences.",
      "Name open questions that would require operator judgment or another skill.",
    ],
  },
  {
    id: "opportunity-discovery",
    name: "Opportunity discovery",
    description: "Survey internal context plus research signals and propose reviewable opportunities.",
    businessAgnostic: true,
    approvalPolicy: "propose_only",
    allowedTools: [
      "search_companies",
      "search_contacts",
      "search_leads",
      "search_jobs",
      "search_outcomes",
      "search_properties",
      "query_brain",
      "list_opportunities",
      "read_persona_intelligence",
      "read_recent_activity",
      "read_performance",
      "get_app_map",
      "get_workspace_settings",
      "research_web",
      "propose_opportunity",
      "emit_card",
      "cite_sources",
      "suggest_followups",
      "ask_operator",
    ],
    instructions: [
      "Use this skill to turn workspace context and source-backed research into pending opportunities.",
      "Treat every proposed opportunity as review-only until a human approves the next step.",
      "Prefer a few high-confidence proposals over broad unranked lists.",
    ],
    outputContract: [
      "Each opportunity must include the signal, audience, recommended action, confidence, and evidence.",
      "Cite the internal record or public source behind each material claim.",
      "Do not draft campaigns, generate media, update CRM records, send, publish, launch, or spend.",
    ],
  },
  {
    id: "approval-gated-drafting",
    name: "Approval-gated drafting",
    description: "Create draft work products from approved context without publishing or sending.",
    businessAgnostic: true,
    approvalPolicy: "approval_gated_drafts",
    allowedTools: [
      "query_brain",
      "list_campaigns",
      "get_campaign",
      "list_approvals",
      "list_media",
      "attach_media",
      "list_brand_documents",
      "read_brand_document",
      "get_app_map",
      "get_workspace_settings",
      "create_campaign_draft",
      "generate_image",
      "generate_video",
      "analyze_website",
      "propose_brand_profile",
      "emit_card",
      "cite_sources",
      "suggest_followups",
      "ask_operator",
    ],
    instructions: [
      "Use this skill when the operator explicitly wants draft work products.",
      "Drafts must stay approval-gated and tied to the current workspace context.",
      "Use the workspace's brand, media, and campaign context instead of inventing facts.",
    ],
    outputContract: [
      "Every created work product must be pending human approval.",
      "Explain the source context and assumptions behind the draft.",
      "Do not approve, send, publish, launch, unlock dispatch, or spend.",
    ],
  },
];

const SKILLS_BY_ID = new Map(ARC_SKILLS.map((skill) => [skill.id, skill]));

export function resolveArcSkill(skillId: string | null | undefined): ArcSkill | null {
  const id = typeof skillId === "string" ? skillId.trim() : "";
  if (!id) return null;
  const skill = SKILLS_BY_ID.get(id);
  if (!skill) {
    throw new Error(`Unknown Arc skill: ${id}`);
  }
  return skill;
}

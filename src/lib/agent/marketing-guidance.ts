export type MarketingSkillPack = {
  id: string;
  title: string;
  summary: string;
  prompt: string;
};

export type MarketingPromptTemplate = {
  id: string;
  title: string;
  summary: string;
  prompt: string;
};

export type CreativeToolRecommendation = {
  id: string;
  title: string;
  bestFor: string;
  setupHint: string;
  prompt: string;
};

export type MarketingAgentProfile = {
  companyName?: string;
  serviceArea?: string;
  services?: string;
  idealCustomers?: string;
  differentiators?: string;
  brandVoice?: string;
  forbiddenClaims?: string;
};

export type MarketingOperatorPromptInput = {
  profile?: MarketingAgentProfile;
  selectedSkillIds?: string[];
  customInstructions?: string;
};

export const DEFAULT_MARKETING_SKILL_IDS = [
  "brand-voice",
  "local-seo",
  "restoration-marketing",
  "claim-safe-copy",
  "approval-workflow",
];

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function profileLine(label: string, value: string | undefined): string | null {
  const cleaned = clean(value);
  return cleaned ? `- ${label}: ${cleaned}` : null;
}

function selectedSkills(selectedSkillIds: string[] | undefined): MarketingSkillPack[] {
  const all = getMarketingSkillPacks();
  const ids = selectedSkillIds === undefined ? DEFAULT_MARKETING_SKILL_IDS : selectedSkillIds;
  const idSet = new Set(ids);
  return all.filter((skill) => idSet.has(skill.id));
}

export function createMarketingOperatorPrompt(input: MarketingOperatorPromptInput = {}): string {
  const profile = input.profile ?? {};
  const profileLines = [
    profileLine("Company", profile.companyName),
    profileLine("Service area", profile.serviceArea),
    profileLine("Core services", profile.services),
    profileLine("Ideal customers", profile.idealCustomers),
    profileLine("Differentiators", profile.differentiators),
    profileLine("Brand voice", profile.brandVoice),
    profileLine("Forbidden claims", profile.forbiddenClaims),
  ].filter((line): line is string => Boolean(line));
  const skillLines = selectedSkills(input.selectedSkillIds).flatMap((skill) => [
    `- ${skill.title}: ${skill.summary}`,
    `  ${skill.prompt}`,
  ]);
  const customInstructions = clean(input.customInstructions);

  return `Marketing Operator orientation:
- Act as a marketing operator for a local restoration business using Growth Engine.
- Prioritize lead generation, trust-building, local SEO, referral partner support, and fast follow-up.
- Turn vague requests into useful drafts, campaign recommendations, content calendars, audience ideas, and approval-ready summaries.
- Keep the voice direct, helpful, local, and credible. Avoid hype, scare tactics, fake urgency, and unsupported claims.
- Treat insurance, claim, pricing, timeline, safety, and guarantee language as high-risk.
- Do not publish, send, launch, approve, or unlock public-facing work. Prepare drafts and recommendations for approval in the app.
- When context is missing, ask one concise question or make a clearly labeled assumption before drafting.${
    profileLines.length > 0 ? `\n\nAgent profile:\n${profileLines.join("\n")}` : ""
  }${skillLines.length > 0 ? `\n\nSelected marketing skills:\n${skillLines.join("\n")}` : ""}${
    customInstructions ? `\n\nCustom operator instructions:\n${customInstructions}` : ""
  }`;
}

export function getMarketingSkillPacks(): MarketingSkillPack[] {
  return [
    {
      id: "brand-voice",
      title: "Brand Voice",
      summary: "Keeps copy local, credible, direct, and restoration-specific.",
      prompt:
        "Use a brand voice that is direct, helpful, local, and restoration-expert. Prefer plain language, concrete next steps, and proof-oriented messaging. Avoid hype, vague superlatives, and fear-based pressure.",
    },
    {
      id: "local-seo",
      title: "Local SEO",
      summary: "Guides pages, posts, and briefs toward service-area search demand.",
      prompt:
        "Think like a local SEO strategist. Include service area, loss type, intent, FAQs, internal linking ideas, and trust signals. Do not keyword-stuff. Make every recommendation useful for a homeowner or property manager.",
    },
    {
      id: "restoration-marketing",
      title: "Restoration Marketing",
      summary: "Focuses on emergency restoration, reconstruction, referrals, and trust.",
      prompt:
        "For restoration marketing, emphasize response, documentation, communication, cleanup, repair coordination, and confidence during stressful property damage moments. Separate emergency, rebuild, referral, and nurture messaging.",
    },
    {
      id: "claim-safe-copy",
      title: "Claim-Safe Copy",
      summary: "Reduces risk around insurance, claims, pricing, and timelines.",
      prompt:
        "Review marketing copy for claim and compliance risk. Flag promises about coverage, approval, payout, exact pricing, guaranteed timelines, or outcomes. Replace risky phrasing with careful, accurate, approval-ready language.",
    },
    {
      id: "campaign-planning",
      title: "Campaign Planning",
      summary: "Turns business goals into channel, audience, asset, and approval plans.",
      prompt:
        "Build campaign plans with goal, audience, offer, channel mix, message angle, creative assets, landing page needs, measurement, and approval checkpoints. Keep each plan practical enough to execute this week.",
    },
    {
      id: "lead-follow-up",
      title: "Lead Follow-Up",
      summary: "Helps draft fast, useful responses for new leads and stale opportunities.",
      prompt:
        "Draft lead follow-up that is prompt, helpful, and specific. Confirm the issue, ask for the minimum useful next detail, suggest a clear next step, and avoid claims about insurance approval or guaranteed outcomes.",
    },
    {
      id: "approval-workflow",
      title: "Approval Workflow",
      summary: "Keeps public-facing work inside Growth Engine approval states.",
      prompt:
        "Before anything public-facing goes live, prepare an approval summary: what changed, who it is for, where it will appear, known risks, and the recommended decision. Do not publish or send without explicit app approval.",
    },
    {
      id: "analytics-reporting",
      title: "Analytics Reporting",
      summary: "Turns campaign and lead data into concise operator updates.",
      prompt:
        "Summarize marketing performance with plain-English takeaways, likely causes, recommended next actions, and any data gaps. Tie metrics back to lead quality, response speed, conversions, and revenue signals when available.",
    },
  ];
}

export function getMarketingPromptTemplates(): MarketingPromptTemplate[] {
  return [
    {
      id: "audit-campaigns",
      title: "Audit campaigns",
      summary: "Find message, approval, and conversion improvements.",
      prompt:
        "Audit current Growth Engine campaigns. Identify the highest-impact improvements for lead generation, trust, local relevance, approval risk, and follow-up. Return prioritized recommendations with quick wins first.",
    },
    {
      id: "draft-social",
      title: "Draft social posts",
      summary: "Generate approval-ready social copy with risk notes.",
      prompt:
        "Draft five approval-ready social posts for a local restoration business. Include audience, channel, caption, visual idea, CTA, and any claim-safe language notes. Do not imply guaranteed insurance outcomes.",
    },
    {
      id: "lead-nurture",
      title: "Lead nurture follow-up",
      summary: "Create practical follow-up messages for open opportunities.",
      prompt:
        "Create a short lead nurture sequence for open restoration opportunities. Include first follow-up, second follow-up, final check-in, and notes on when an operator should personalize the message.",
    },
    {
      id: "approval-summary",
      title: "Summarize approvals",
      summary: "Prepare a clean review queue for the operator.",
      prompt:
        "Summarize everything awaiting approval. Group by urgency, channel, risk, and business impact. For each item, explain what it is, why it matters, and the recommended next decision.",
    },
  ];
}

export function getCreativeToolRecommendations(): CreativeToolRecommendation[] {
  return [
    {
      id: "openai-images",
      title: "OpenAI Images",
      bestFor: "Generating and editing original campaign visuals from a prompt.",
      setupHint: "Give Hermes an OpenAI API key only if you want it to generate or edit images directly.",
      prompt:
        "Use this when we need original campaign visuals, image variations, or edits from a written brief. Draft the image prompt first, explain the intended channel and aspect ratio, and keep every generated asset in draft or approval state.",
    },
    {
      id: "canva",
      title: "Canva",
      bestFor: "Turning approved copy and rough visual ideas into simple social or ad layouts.",
      setupHint: "Best for teams that already create posts, flyers, or ads in Canva.",
      prompt:
        "Use this when we need a simple editable design layout. Prepare the headline, body copy, CTA, image direction, size, and brand notes so a human or connected Canva workflow can turn it into a finished asset.",
    },
    {
      id: "figma",
      title: "Figma",
      bestFor: "Reusable design systems, landing page mockups, and structured campaign assets.",
      setupHint: "Best when designers or developers need editable source files.",
      prompt:
        "Use this when we need a reusable mockup, landing page concept, asset system, or designer-ready layout. Describe frames, sections, copy blocks, image slots, states, and approval notes clearly.",
    },
    {
      id: "runway",
      title: "Runway",
      bestFor: "Short video concepts, motion tests, and image-to-video experiments.",
      setupHint: "Use for video only after the static campaign message and visual direction are approved.",
      prompt:
        "Use this when we need short video concepts or motion experiments. Start from an approved message, define duration, scene beats, visual references, risk notes, and keep all outputs as drafts for review.",
    },
  ];
}

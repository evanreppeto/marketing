import {
  type HermesPartnerCampaignRequest,
} from "./contracts";
import { checkHermesGeneratedCopy, type HermesGuardrailResult } from "./guardrails";

export type HermesDraftPackage = {
  campaignName: string;
  assetTitle: string;
  promptInput: string;
  promptInputs: Record<string, unknown>;
  draftOutput: string;
  audienceSummary: string;
  offerSummary: string;
  personaSummary: string;
  recommendedAction: string;
  reasoningPayload: Record<string, unknown>;
  guardrails: HermesGuardrailResult;
};

export function createPartnerCampaignDraft(request: HermesPartnerCampaignRequest): HermesDraftPackage {
  const companyName = request.company.name;
  const firstName = request.contact.firstName;
  const campaignName =
    request.campaign.name ?? `${humanizePersona(request.persona)} Referral Outreach - ${companyName}`;
  const audienceSummary =
    request.campaign.audienceSummary ??
    `${companyName} decision makers who may encounter active water damage before a restoration team is involved.`;
  const offerSummary =
    request.campaign.offerSummary ??
    "A simple water-loss handoff lane with mitigation, documentation, and rebuild coordination support.";
  const draftOutput = buildDraftOutput({ request, firstName, offerSummary });
  const guardrails = checkHermesGeneratedCopy({
    draftOutput,
    lossSignals: request.lead.lossSignals,
    restorationFocus: request.restorationFocus,
  });

  return {
    campaignName,
    assetTitle: `${titleizeChannel(request.channel)} partner outreach draft`,
    promptInput: [
      `Objective: ${request.objective}`,
      `Persona: ${request.persona}`,
      `Channel: ${request.channel}`,
      `Tone: ${request.campaign.tone}`,
      `CTA: ${request.campaign.cta}`,
      `Guardrail: coverage-neutral, no claim approval or payout promises`,
    ].join("\n"),
    promptInputs: {
      objective: request.objective,
      persona: request.persona,
      channel: request.channel,
      tone: request.campaign.tone,
      cta: request.campaign.cta,
      restoration_focus: request.restorationFocus,
      target_company: companyName,
      target_contact: `${request.contact.firstName} ${request.contact.lastName}`,
      guardrail_summary: "coverage-neutral language required",
    },
    draftOutput,
    audienceSummary,
    offerSummary,
    personaSummary: `${companyName} is a ${humanizePersona(request.persona)} candidate with water-loss handoff potential.`,
    recommendedAction:
      "Review the lead fit and edit/approve the draft if the message matches BSR's partner voice.",
    reasoningPayload: {
      why_hermes_created_it:
        "The request targets a referral persona with water-loss source-stop signals and requires an approval-gated campaign draft.",
      source_data: {
        evidence_urls: request.lead.evidenceUrls,
        service_area_zips: request.company.serviceAreaZips,
        lead_score: request.lead.leadScore,
        partner_score: request.lead.partnerScore,
      },
      recommended_action:
        "Approve lead and edit/approve the first-touch outreach asset if the source data is acceptable.",
      guardrail_flags: guardrails.flags,
    },
    guardrails,
  };
}

function buildDraftOutput(input: {
  request: HermesPartnerCampaignRequest;
  firstName: string;
  offerSummary: string;
}) {
  const { request, firstName, offerSummary } = input;

  if (request.channel === "sms") {
    return [
      `Hi ${firstName}, this is Big Shoulders Restoration.`,
      "When your team stops the source of a water issue, we can help with mitigation, documentation, and rebuild coordination.",
      `Would it be useful to ${request.campaign.cta.toLowerCase()}?`,
    ].join(" ");
  }

  if (request.channel === "call_script") {
    return [
      `Opening: Hi ${firstName}, this is Big Shoulders Restoration calling about a simple water-loss handoff process for your plumbing customers.`,
      "",
      "Context: When your team stops the source, our team can support mitigation, documentation, and rebuild coordination while respecting the customer relationship you already earned.",
      "",
      `Ask: Would it be useful to ${request.campaign.cta.toLowerCase()}?`,
    ].join("\n");
  }

  return [
    "Subject: Fast water-loss handoff for your plumbing customers",
    "",
    `Hi ${firstName},`,
    "",
    "When your team stops the source of a water issue, Big Shoulders Restoration can help with mitigation, documentation, and rebuild coordination that protects the customer relationship you already earned.",
    "",
    offerSummary,
    "",
    `Would it be useful to ${request.campaign.cta.toLowerCase()}?`,
    "",
    "Best,",
    "Big Shoulders Restoration",
  ].join("\n");
}

function titleizeChannel(channel: string) {
  return channel.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizePersona(persona: string) {
  return persona.replace(/^persona_/, "").replaceAll("_", " ");
}

import {
  type ArcPartnerCampaignRequest,
} from "./contracts";
import { checkArcGeneratedCopy, type ArcGuardrailResult } from "./guardrails";
import { humanizePersonaLabel, type ArcBusinessContext } from "@/domain";

export type ArcDraftPackage = {
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
  guardrails: ArcGuardrailResult;
};

export function createPartnerCampaignDraft(
  request: ArcPartnerCampaignRequest,
  context: ArcBusinessContext,
): ArcDraftPackage {
  const companyName = request.company.name;
  const firstName = request.contact.firstName;
  const businessName = context.businessName;
  const servicesPhrase =
    context.services.length > 0 ? context.services.join(", ") : "the services you need";
  const campaignName =
    request.campaign.name ?? `${humanizePersona(request.persona)} Referral Outreach - ${companyName}`;
  const audienceSummary =
    request.campaign.audienceSummary ??
    `${companyName} decision makers who may need ${servicesPhrase}.`;
  const offerSummary =
    request.campaign.offerSummary ?? `A simple handoff lane with ${servicesPhrase}.`;
  const approvedBrainFacts = context.brainFacts.slice(0, 8);
  const draftOutput = buildDraftOutput({ request, firstName, businessName, offerSummary, servicesPhrase });
  const guardrails = checkArcGeneratedCopy({
    draftOutput,
    bannedPhrases: context.bannedPhrases,
    complianceNotes: context.guardrails.complianceNotes,
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
      `Guardrail: no disallowed claims`,
      approvedBrainFacts.length > 0 ? `Approved Brain facts:\n${approvedBrainFacts.join("\n")}` : "",
    ].join("\n"),
    promptInputs: {
      objective: request.objective,
      persona: request.persona,
      channel: request.channel,
      tone: request.campaign.tone,
      cta: request.campaign.cta,
      target_company: companyName,
      target_contact: `${request.contact.firstName} ${request.contact.lastName}`,
      guardrail_summary: "compliance-checked",
      approved_brain_facts: approvedBrainFacts,
    },
    draftOutput,
    audienceSummary,
    offerSummary,
    personaSummary: `${companyName} is a ${humanizePersona(request.persona)} candidate for ${businessName}.`,
    recommendedAction:
      `Review the lead fit and edit/approve the draft if the message matches ${businessName}'s voice.`,
    reasoningPayload: {
      why_arc_created_it:
        "The request targets a referral persona with source-stop signals and requires an approval-gated campaign draft.",
      source_data: {
        evidence_urls: request.lead.evidenceUrls,
        service_area_zips: request.company.serviceAreaZips,
        lead_score: request.lead.leadScore,
        partner_score: request.lead.partnerScore,
        approved_brain_facts: approvedBrainFacts,
      },
      recommended_action:
        "Approve lead and edit/approve the first-touch outreach asset if the source data is acceptable.",
      guardrail_flags: guardrails.flags,
    },
    guardrails,
  };
}

function buildDraftOutput(input: {
  request: ArcPartnerCampaignRequest;
  firstName: string;
  businessName: string;
  offerSummary: string;
  servicesPhrase: string;
}) {
  const { request, firstName, businessName, offerSummary, servicesPhrase } = input;
  const cta = request.campaign.cta.toLowerCase();

  if (request.channel === "sms") {
    return [
      `Hi ${firstName}, this is ${businessName}.`,
      `When your customers need help, we can support with ${servicesPhrase}.`,
      `Would it be useful to ${cta}?`,
    ].join(" ");
  }

  if (request.channel === "call_script") {
    return [
      `Opening: Hi ${firstName}, this is ${businessName} calling about a simple handoff process for your customers.`,
      "",
      `Context: When your customers need ${servicesPhrase}, our team can help while respecting the relationship you already earned.`,
      "",
      `Ask: Would it be useful to ${cta}?`,
    ].join("\n");
  }

  return [
    `Subject: A simple handoff lane with ${businessName}`,
    "",
    `Hi ${firstName},`,
    "",
    `When your customers need help, ${businessName} can support with ${servicesPhrase} — protecting the relationship you already earned.`,
    "",
    offerSummary,
    "",
    `Would it be useful to ${cta}?`,
    "",
    "Best,",
    businessName,
  ].join("\n");
}

function titleizeChannel(channel: string) {
  return channel.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizePersona(persona: string) {
  return humanizePersonaLabel(persona);
}

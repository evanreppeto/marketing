import { OFFICIAL_PERSONA_MAPPINGS, type OfficialPersonaMapping } from "@/domain";

export type PersonaCtaRule = {
  persona: OfficialPersonaMapping;
  label: string;
  segment: "Homeowner" | "Professional" | "Partner";
  primaryCta: string;
  secondaryCta: string;
  landingRule: string;
  messageAngle: string;
  guardrail: string;
};

const RULES: Record<OfficialPersonaMapping, Omit<PersonaCtaRule, "persona">> = {
  persona_homeowner_emergency: {
    label: "Emergency homeowner",
    segment: "Homeowner",
    primaryCta: "Call Now",
    secondaryCta: "Upload Photos",
    landingRule: "Route to urgent mitigation intake. Do not promise coverage, payout, or guaranteed response outcome.",
    messageAngle: "Fast water-loss clarity, mitigation documentation, and next-step support.",
    guardrail: "No insurance approval promises or guaranteed dry-out/claim results.",
  },
  persona_homeowner_preventative: {
    label: "Preventative homeowner",
    segment: "Homeowner",
    primaryCta: "Request Inspection",
    secondaryCta: "Upload Photos",
    landingRule: "Route to risk review and documentation request. Keep urgency measured unless evidence supports emergency language.",
    messageAngle: "Prevent future water damage with documentation-first restoration planning.",
    guardrail: "Do not overstate risk or imply a loss exists without evidence.",
  },
  persona_homeowner_rebuild: {
    label: "Rebuild homeowner",
    segment: "Homeowner",
    primaryCta: "Request Rebuild Review",
    secondaryCta: "Upload Photos",
    landingRule: "Route to rebuild scope review after mitigation context is known.",
    messageAngle: "Clear rebuild planning after mitigation, documentation, and scope review.",
    guardrail: "Do not position unrelated remodeling as restoration unless the record supports it.",
  },
  persona_landlord: {
    label: "Landlord",
    segment: "Professional",
    primaryCta: "Request Building Review",
    secondaryCta: "Send Property Details",
    landingRule: "Route to property and tenant-impact context. Capture unit count, urgency, access, and documentation needs.",
    messageAngle: "Tenant-aware mitigation, documentation, and rebuild coordination.",
    guardrail: "Avoid tenant displacement claims or guaranteed timeline language.",
  },
  persona_hoa_board: {
    label: "HOA board",
    segment: "Professional",
    primaryCta: "Request Building Review",
    secondaryCta: "Request Vendor Packet",
    landingRule: "Route to board/vendor review with documentation, insurance-neutral language, and decision timeline.",
    messageAngle: "Board-ready restoration documentation and common-area coordination.",
    guardrail: "Do not imply claim approval or board approval outcomes.",
  },
  persona_property_manager: {
    label: "Property manager",
    segment: "Professional",
    primaryCta: "Request Vendor Packet",
    secondaryCta: "Request Building Review",
    landingRule: "Route to vendor packet, COI/W9-style readiness, service area, and response process review.",
    messageAngle: "Reliable mitigation documentation, tenant-safe handoff, and property-ready coordination.",
    guardrail: "Do not guarantee availability, response time, or insurance outcomes.",
  },
  persona_insurance_agent: {
    label: "Insurance agent",
    segment: "Professional",
    primaryCta: "Refer a Client",
    secondaryCta: "Request Documentation Process",
    landingRule: "Route to referral handoff and documentation process. Keep claim language neutral.",
    messageAngle: "Clean restoration documentation and an easy client handoff after a loss.",
    guardrail: "No coverage, payout, claim approval, or carrier advice promises.",
  },
  persona_listing_agent: {
    label: "Listing agent",
    segment: "Professional",
    primaryCta: "Request Property Review",
    secondaryCta: "Upload Photos",
    landingRule: "Route to property-condition and transaction timeline review.",
    messageAngle: "Documentation-first restoration review for property sale readiness.",
    guardrail: "Do not promise sale outcomes or inspection clearance.",
  },
  persona_buyers_agent: {
    label: "Buyer's agent",
    segment: "Professional",
    primaryCta: "Request Property Review",
    secondaryCta: "Upload Photos",
    landingRule: "Route to buyer-side concern review and documentation collection.",
    messageAngle: "Clear restoration context before a buyer decision.",
    guardrail: "Do not replace inspection, legal, or insurance advice.",
  },
  persona_plumbing_partner: {
    label: "Plumbing / sewer partner",
    segment: "Partner",
    primaryCta: "Become a Partner",
    secondaryCta: "Refer a Water Loss",
    landingRule: "Route to partner intake. Confirm service area, handoff process, and water-loss restoration fit.",
    messageAngle: "When the source is stopped, BSR can handle mitigation, documentation, and rebuild handoff.",
    guardrail: "Do not imply referral exclusivity, compensation, or guaranteed job conversion.",
  },
  persona_hvac_roof_electrical_partner: {
    label: "HVAC / roof / electrical partner",
    segment: "Partner",
    primaryCta: "Become a Partner",
    secondaryCta: "Refer a Restoration Need",
    landingRule: "Route to partner intake with strict restoration-fit review.",
    messageAngle: "Partner handoff for restoration needs connected to mitigation, documentation, and rebuild.",
    guardrail: "Avoid unsupported hail/wind/roof-only assumptions unless the record explicitly supports restoration scope.",
  },
  persona_gc_remodeler_partner: {
    label: "GC / remodeler partner",
    segment: "Partner",
    primaryCta: "Become a Partner",
    secondaryCta: "Discuss Rebuild Handoff",
    landingRule: "Route to rebuild partner intake and scope-bound collaboration review.",
    messageAngle: "Restoration-to-rebuild handoff with clear documentation and role boundaries.",
    guardrail: "Do not blur restoration work with unrelated remodeling claims.",
  },
};

export const PERSONA_CTA_RULES: PersonaCtaRule[] = OFFICIAL_PERSONA_MAPPINGS.map((persona) => ({
  persona,
  ...RULES[persona],
}));

export function getPersonaCtaRule(personaOrSlug: string): PersonaCtaRule | null {
  const normalized = personaOrSlug.startsWith("persona_") ? personaOrSlug : `persona_${personaOrSlug.replaceAll("-", "_")}`;
  return PERSONA_CTA_RULES.find((rule) => rule.persona === normalized) ?? null;
}

export function personaSlug(persona: string) {
  return persona.replace(/^persona_/, "").replaceAll("_", "-");
}

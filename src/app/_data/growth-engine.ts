import { type OfficialPersonaMapping } from "@/domain";

export const navItems = [
  { label: "Mark", href: "/mark", icon: "agents" },
  { label: "Campaigns", href: "/campaigns", icon: "approval" },
];

// Static metadata for the six CRM objects (labels, routes, field names). All
// record data — counts, rows, relationships, activity — comes from the live
// Supabase read model; nothing here fabricates records.
export const crmObjects = [
  {
    key: "companies",
    label: "Companies",
    href: "/crm/companies",
    description: "Organizations, accounts, partners, vendors, and target companies.",
    primaryField: "Company",
    secondaryField: "Type",
  },
  {
    key: "contacts",
    label: "Contacts",
    href: "/crm/contacts",
    description: "People, decision-makers, influencers, customers, and collaborators.",
    primaryField: "Contact",
    secondaryField: "Relationship",
  },
  {
    key: "properties",
    label: "Assets",
    href: "/crm/properties",
    description: "Places, accounts, assets, portfolios, or any record tied to a location.",
    primaryField: "Asset",
    secondaryField: "Owner / contact",
  },
  {
    key: "leads",
    label: "Leads",
    href: "/crm/leads",
    description: "Incoming demand, referrals, prospects, scores, source, and routing.",
    primaryField: "Lead",
    secondaryField: "Signal",
  },
  {
    key: "jobs",
    label: "Projects",
    href: "/crm/jobs",
    description: "Opportunities, projects, work items, and downstream delivery records.",
    primaryField: "Project",
    secondaryField: "Stage",
  },
  {
    key: "outcomes",
    label: "Outcomes",
    href: "/crm/outcomes",
    description: "Closed revenue, margin, attribution, and conversion results.",
    primaryField: "Outcome",
    secondaryField: "Attribution",
  },
];

export const personaDisplay: Record<
  OfficialPersonaMapping,
  {
    label: string;
    group: "Homeowner" | "Professional" | "Partner";
    description: string;
    primaryAction: string;
  }
> = {
  persona_homeowner_emergency: {
    label: "Urgent Customer",
    group: "Homeowner",
    description: "Time-sensitive person who needs a fast response or clear next step.",
    primaryAction: "Call now",
  },
  persona_homeowner_preventative: {
    label: "Researching Customer",
    group: "Homeowner",
    description: "Person comparing options, collecting information, or planning ahead.",
    primaryAction: "Schedule consult",
  },
  persona_homeowner_rebuild: {
    label: "Project Customer",
    group: "Homeowner",
    description: "Person with a larger project, conversion, or implementation need.",
    primaryAction: "Request project consult",
  },
  persona_landlord: {
    label: "Landlord",
    group: "Professional",
    description: "Owner/operator balancing customers, tenants, assets, and income.",
    primaryAction: "Coordinate response",
  },
  persona_hoa_board: {
    label: "HOA Board Member",
    group: "Professional",
    description: "Committee or board stakeholder needing clear documentation.",
    primaryAction: "Request decision-ready documents",
  },
  persona_property_manager: {
    label: "Property Manager",
    group: "Professional",
    description: "Portfolio operator balancing stakeholders, vendors, and service quality.",
    primaryAction: "Request partner packet",
  },
  persona_insurance_agent: {
    label: "Insurance Agent",
    group: "Professional",
    description: "Referral influencer who needs simple, reliable client support.",
    primaryAction: "Refer a client",
  },
  persona_listing_agent: {
    label: "Listing Agent",
    group: "Professional",
    description: "Seller-side agent trying to keep a deal or project moving.",
    primaryAction: "Send summary",
  },
  persona_buyers_agent: {
    label: "Buyer Agent",
    group: "Professional",
    description: "Buyer-side agent evaluating concerns, risk, or project fit.",
    primaryAction: "Request fast review",
  },
  persona_plumbing_partner: {
    label: "Service Partner",
    group: "Partner",
    description: "Partner who identifies a customer need and makes a handoff.",
    primaryAction: "Refer customer",
  },
  persona_hvac_roof_electrical_partner: {
    label: "Trade Partner",
    group: "Partner",
    description: "Specialist partner who can create qualified referral demand.",
    primaryAction: "Set up partnership",
  },
  persona_gc_remodeler_partner: {
    label: "Project Partner",
    group: "Partner",
    description: "Partner who may bring the business into a larger project or account.",
    primaryAction: "Start partner flow",
  },
};

import { type OfficialPersonaMapping } from "@/domain";

export const navItems = [
  { label: "Today", href: "/", icon: "today" },
  { label: "Activity", href: "/approvals", icon: "approval" },
  { label: "Campaigns", href: "/campaigns", icon: "approval" },
  { label: "Outbox", href: "/outbox", icon: "approval" },
  { label: "Gallery", href: "/gallery", icon: "approval" },
  { label: "CRM", href: "/crm", icon: "crm" },
  { label: "Personas", href: "/persona-intelligence", icon: "persona" },
  { label: "Mark", href: "/mark", icon: "agents" },
  { label: "Settings", href: "/settings", icon: "sliders" },
];

// Static metadata for the six CRM objects (labels, routes, field names). All
// record data — counts, rows, relationships, activity — comes from the live
// Supabase read model; nothing here fabricates records.
export const crmObjects = [
  {
    key: "companies",
    label: "Companies",
    href: "/crm/companies",
    description: "Referral partners, agencies, managers, and organizations.",
    primaryField: "Company",
    secondaryField: "Type",
  },
  {
    key: "contacts",
    label: "Contacts",
    href: "/crm/contacts",
    description: "Owners, agents, managers, vendors, and decision-makers.",
    primaryField: "Contact",
    secondaryField: "Relationship",
  },
  {
    key: "properties",
    label: "Properties",
    href: "/crm/properties",
    description: "Homes, buildings, portfolios, and loss locations.",
    primaryField: "Property",
    secondaryField: "Owner / contact",
  },
  {
    key: "leads",
    label: "Leads",
    href: "/crm/leads",
    description: "Validated opportunities, scores, source, and routing decision.",
    primaryField: "Lead",
    secondaryField: "Signal",
  },
  {
    key: "jobs",
    label: "Jobs",
    href: "/crm/jobs",
    description: "Scheduled, active, and completed restoration work.",
    primaryField: "Job",
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
    label: "Emergency Homeowner",
    group: "Homeowner",
    description: "Active water, fire, sewage, or mold concern needing immediate help.",
    primaryAction: "Call now",
  },
  persona_homeowner_preventative: {
    label: "Inspection Homeowner",
    group: "Homeowner",
    description: "Potential moisture or mold issue before it becomes an emergency.",
    primaryAction: "Schedule inspection",
  },
  persona_homeowner_rebuild: {
    label: "Rebuild Homeowner",
    group: "Homeowner",
    description: "Post-loss rebuild or major restoration planning.",
    primaryAction: "Request rebuild consult",
  },
  persona_landlord: {
    label: "Landlord",
    group: "Professional",
    description: "Rental owner protecting occupancy, tenants, and income.",
    primaryAction: "Coordinate property response",
  },
  persona_hoa_board: {
    label: "HOA Board Member",
    group: "Professional",
    description: "Association decision-maker needing clear documentation.",
    primaryAction: "Request board-ready documents",
  },
  persona_property_manager: {
    label: "Property Manager",
    group: "Professional",
    description: "Portfolio operator balancing residents, owners, and urgent vendors.",
    primaryAction: "Request vendor packet",
  },
  persona_insurance_agent: {
    label: "Insurance Agent",
    group: "Professional",
    description: "Referral influencer who needs coverage-neutral client support.",
    primaryAction: "Refer a client",
  },
  persona_listing_agent: {
    label: "Listing Agent",
    group: "Professional",
    description: "Seller-side agent trying to keep inspection issues from slowing a deal.",
    primaryAction: "Send inspection report",
  },
  persona_buyers_agent: {
    label: "Buyer Agent",
    group: "Professional",
    description: "Buyer-side agent evaluating damage, mold, or repair concerns.",
    primaryAction: "Request fast review",
  },
  persona_plumbing_partner: {
    label: "Plumbing Partner",
    group: "Partner",
    description: "Trade partner who stops the source and hands off property damage.",
    primaryAction: "Refer customer",
  },
  persona_hvac_roof_electrical_partner: {
    label: "HVAC / Roofing / Electrical Partner",
    group: "Partner",
    description: "Mechanical, roof, or electrical partner spotting related damage.",
    primaryAction: "Set up partnership",
  },
  persona_gc_remodeler_partner: {
    label: "GC / Remodeler Partner",
    group: "Partner",
    description: "Contractor or remodeler needing restoration support inside a project.",
    primaryAction: "Bring us into a project",
  },
};

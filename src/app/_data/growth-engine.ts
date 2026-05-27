import {
  OFFICIAL_PERSONA_MAPPINGS,
  TARGET_LOSS_KEYWORDS,
  type OfficialPersonaMapping,
  calculateScores,
  classifyLossSignals,
} from "@/domain";

export const navItems = [
  { label: "Data Foundation", href: "/data-foundation", icon: "database" },
  { label: "CRM", href: "/crm", icon: "crm" },
  { label: "Lead Intake", href: "/lead-ingestion", icon: "intake" },
  { label: "Customer Types", href: "/customer-types", icon: "people" },
  { label: "Loss Routing", href: "/loss-routing", icon: "routing" },
  { label: "Priority Rules", href: "/score-rules", icon: "sliders" },
  { label: "Reports", href: "/reports", icon: "reports" },
];

export const coreObjects = [
  { name: "Companies", count: 42, note: "Partner businesses and agencies", status: "Ready" },
  { name: "People", count: 118, note: "Owners, agents, managers, and trade contacts", status: "Ready" },
  { name: "Properties", count: 67, note: "Homes, buildings, and loss locations", status: "Ready" },
  { name: "Leads", count: 19, note: "Incoming opportunities ready for review", status: "Ready" },
  { name: "Jobs", count: 8, note: "Active or completed restoration work", status: "Ready" },
  { name: "Results", count: 5, note: "Closed revenue and attribution records", status: "Ready" },
];

export const crmObjects = [
  {
    key: "companies",
    label: "Companies",
    href: "/crm/companies",
    count: 42,
    description: "Referral partners, agencies, managers, and organizations.",
    relationships: "96 contacts · 38 properties · 14 jobs",
    lastActivity: "Today",
    primaryField: "Company",
    secondaryField: "Type",
    sampleRows: [
      { id: "north-branch-insurance", name: "North Branch Insurance", detail: "Insurance agency", status: "Active", owner: "Robby", updated: "Today" },
      { id: "pulaski-property-group", name: "Pulaski Property Group", detail: "Property manager", status: "Review", owner: "Ops", updated: "Yesterday" },
      { id: "apex-plumbing-co", name: "Apex Plumbing Co.", detail: "Trade partner", status: "Active", owner: "Robby", updated: "2 days ago" },
    ],
  },
  {
    key: "contacts",
    label: "Contacts",
    href: "/crm/contacts",
    count: 118,
    description: "Owners, agents, managers, vendors, and decision-makers.",
    relationships: "42 companies · 67 properties · 19 leads",
    lastActivity: "2 min ago",
    primaryField: "Contact",
    secondaryField: "Relationship",
    sampleRows: [
      { id: "marlene-vega", name: "Marlene Vega", detail: "Emergency homeowner", status: "Ready", owner: "Intake", updated: "Today" },
      { id: "emilia-davi", name: "Emilia Davi", detail: "Insurance agent", status: "Active", owner: "Robby", updated: "Today" },
      { id: "leona-price", name: "Leona Price", detail: "Homeowner", status: "Review", owner: "Ops", updated: "Yesterday" },
    ],
  },
  {
    key: "properties",
    label: "Properties",
    href: "/crm/properties",
    count: 67,
    description: "Homes, buildings, portfolios, and loss locations.",
    relationships: "51 contacts · 28 companies · 12 jobs",
    lastActivity: "12 min ago",
    primaryField: "Property",
    secondaryField: "Owner / contact",
    sampleRows: [
      { id: "1234-w-addison-st", name: "1234 W Addison St", detail: "Marlene Vega", status: "Ready", owner: "Intake", updated: "Today" },
      { id: "2746-n-kedzie-ave", name: "2746 N Kedzie Ave", detail: "Agent client", status: "Ready", owner: "Ops", updated: "Today" },
      { id: "410-s-michigan-ave", name: "410 S Michigan Ave", detail: "Leona Price", status: "Review", owner: "Ops", updated: "Yesterday" },
    ],
  },
  {
    key: "leads",
    label: "Leads",
    href: "/crm/leads",
    count: 19,
    description: "Validated opportunities, scores, source, and routing decision.",
    relationships: "16 contacts · 17 properties · 4 jobs",
    lastActivity: "2 min ago",
    primaryField: "Lead",
    secondaryField: "Signal",
    sampleRows: [
      { id: "basement-flooding", name: "Basement flooding", detail: "Standing water, burst pipe", status: "High priority", owner: "Mitigation", updated: "2 min ago" },
      { id: "water-backup", name: "Water backup", detail: "Lower level backup", status: "High priority", owner: "Mitigation", updated: "8 min ago" },
      { id: "roof-hail-inspection", name: "Roof hail inspection", detail: "Hail-only", status: "Out of scope", owner: "Review", updated: "16 min ago" },
    ],
  },
  {
    key: "jobs",
    label: "Jobs",
    href: "/crm/jobs",
    count: 8,
    description: "Scheduled, active, and completed restoration work.",
    relationships: "8 properties · 8 contacts · 5 outcomes",
    lastActivity: "1 hr ago",
    primaryField: "Job",
    secondaryField: "Stage",
    sampleRows: [
      { id: "j-2044-basement-mitigation", name: "J-2044 Basement mitigation", detail: "In progress", status: "Active", owner: "Field", updated: "Today" },
      { id: "j-2041-kitchen-dry-out", name: "J-2041 Kitchen dry-out", detail: "Scheduled", status: "Ready", owner: "Field", updated: "Today" },
      { id: "j-2038-rebuild-consult", name: "J-2038 Rebuild consult", detail: "Pending", status: "Review", owner: "Ops", updated: "Yesterday" },
    ],
  },
  {
    key: "outcomes",
    label: "Outcomes",
    href: "/crm/outcomes",
    count: 5,
    description: "Closed revenue, margin, attribution, and conversion results.",
    relationships: "5 jobs · 5 leads · $32.5K booked",
    lastActivity: "Today",
    primaryField: "Outcome",
    secondaryField: "Attribution",
    sampleRows: [
      { id: "18420-closed", name: "$18,420 closed", detail: "Insurance agent referral", status: "Won", owner: "Finance", updated: "Today" },
      { id: "9875-closed", name: "$9,875 closed", detail: "Plumbing partner", status: "Won", owner: "Finance", updated: "2 days ago" },
      { id: "4200-estimate", name: "$4,200 estimate", detail: "Website lead", status: "Pending", owner: "Ops", updated: "3 days ago" },
    ],
  },
];

export const crmScaffoldStats = [
  { label: "Objects scaffolded", value: "6", delta: "Six core objects" },
  { label: "Mock records", value: "18", delta: "Mock preview" },
  { label: "Live writes", value: "Off", delta: "Persistence not connected" },
  { label: "Detail pages", value: "18", delta: "Mock preview" },
];

export const validationRows = [
  { label: "Approved customer types", value: "12", status: "Ready" },
  { label: "Unassigned records", value: "Internal cleanup only", status: "Blocked for new leads" },
  { label: "Rejected submissions", value: "3", status: "Needs correction" },
  { label: "Missing relationships", value: "2", status: "Needs review" },
  { label: "Duplicate detection", value: "0", status: "Clear" },
];

export const foundationIssues = [
  { issue: "Missing email address", affected: "People (11)", impact: "Outreach blocked", lastFound: "2 min ago", action: "Review" },
  { issue: "Duplicate companies", affected: "Companies (6)", impact: "Reporting skew", lastFound: "12 min ago", action: "Resolve" },
  { issue: "Invalid phone format", affected: "People (7)", impact: "SMS delivery risk", lastFound: "18 min ago", action: "Fix" },
  { issue: "Orphaned properties", affected: "Properties (8)", impact: "Relationship gap", lastFound: "1 hr ago", action: "Review" },
  { issue: "Missing property address", affected: "Properties (3)", impact: "Routing risk", lastFound: "2 hrs ago", action: "Fix" },
];

export const pipelineStatus = [
  { label: "Ingestion", value: "Healthy", meta: "Live form queue" },
  { label: "Validation", value: "Healthy", meta: "2 min ago" },
  { label: "Deduplication", value: "Healthy", meta: "5 min ago" },
  { label: "Enrichment", value: "Ready", meta: "Manual" },
  { label: "Relationships", value: "Healthy", meta: "1 min ago" },
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

export const customerTypes = OFFICIAL_PERSONA_MAPPINGS.map((persona) => ({
  key: persona,
  ...personaDisplay[persona],
}));

export const audienceSegments = [
  { label: "Homeowners", detail: "Emergency, inspection, rebuild", count: 64, share: "54%" },
  { label: "Property operators", detail: "Landlords, HOAs, managers", count: 18, share: "15%" },
  { label: "Referral partners", detail: "Agents and trade partners", count: 26, share: "22%" },
  { label: "Other contacts", detail: "General inquiries", count: 10, share: "9%" },
];

export const partnerSegments = [
  { segment: "Insurance agents", type: "Referral", partners: 42, leads: 116, quality: "High", status: "Active" },
  { segment: "Property managers", type: "Referral", partners: 18, leads: 37, quality: "Medium", status: "Active" },
  { segment: "Plumbing partners", type: "Vendor", partners: 15, leads: 28, quality: "High", status: "Active" },
  { segment: "Restoration vendors", type: "Vendor", partners: 12, leads: 19, quality: "Medium", status: "Active" },
  { segment: "Adjusters", type: "Referral", partners: 10, leads: 14, quality: "High", status: "Active" },
];

export const segmentHealthRows = [
  { label: "Approved segments", value: "12", status: "Good" },
  { label: "Unassigned records", value: "7", status: "Review" },
  { label: "Blocked leads", value: "3", status: "Action needed" },
  { label: "Duplicate segments", value: "1", status: "Fix" },
];

export const intakeLeads = [
  {
    name: "Basement flooding",
    contact: "Marlene Vega",
    address: "1234 W. Addison St., Chicago",
    customerType: "persona_homeowner_emergency" as const,
    issue: "standing water, burst pipe",
    source: "Web form",
    received: "Today, 9:15 AM",
    action: "High priority",
    score: 100,
    status: "Ready for team",
    classification: classifyLossSignals(["Basement flooding", "standing water", "burst pipe"]),
  },
  {
    name: "Water backup in basement",
    contact: "Emilia Davi",
    address: "2746 N. Kedzie Ave., Chicago",
    customerType: "persona_insurance_agent" as const,
    issue: "water backup",
    source: "Insurance agent",
    received: "Today, 8:15 AM",
    action: "High priority",
    score: 76,
    status: "Ready for team",
    classification: classifyLossSignals("water backup in lower level"),
  },
  {
    name: "Wind damage to fence",
    contact: "Leona Price",
    address: "410 S. Michigan Ave., Chicago",
    customerType: "persona_homeowner_emergency" as const,
    issue: "wind-only, no interior water",
    source: "Web form",
    received: "Today, 7:05 AM",
    action: "Not a fit",
    score: 10,
    status: "Archive",
    classification: classifyLossSignals("wind-only roof loss no interior water"),
  },
];

export const intakeChannels = [
  { label: "Website forms", value: 34, share: "62%" },
  { label: "Insurance agents", value: 12, share: "22%" },
  { label: "Paid search", value: 4, share: "7%" },
  { label: "Google Local", value: 3, share: "5%" },
];

export const validationGateRows = [
  { label: "Contact information", detail: "Email, phone, name", completion: "92%", status: "Good" },
  { label: "Loss details", detail: "Location, type, description", completion: "76%", status: "Review" },
  { label: "Property information", detail: "Address, property type", completion: "81%", status: "Good" },
  { label: "Source integrity", detail: "UTM, referrer, validation", completion: "88%", status: "Good" },
];

export const intakeOutcomes: Array<{
  label: string;
  value: string;
  delta: string;
  tone: "green" | "amber" | "red";
}> = [
  { label: "Approved", value: "28", delta: "+12%", tone: "green" },
  { label: "Rejected", value: "5", delta: "-8%", tone: "green" },
  { label: "Needs review", value: "14", delta: "+9%", tone: "amber" },
  { label: "Avg. time to validate", value: "8m 32s", delta: "-1m 12s", tone: "green" },
];

export const routingExamples = [
  {
    lead: "Basement flooding",
    issue: "standing water, burst pipe",
    strength: "Strong",
    action: "High priority",
    reason: "Active water and after-hours call",
  },
  {
    lead: "Kitchen sink overflow",
    issue: "water backup, appliance leak",
    strength: "Medium",
    action: "Needs review",
    reason: "Water present, source needs confirmation",
  },
  {
    lead: "Hail damage to roof",
    issue: "hail-only, no interior water",
    strength: "Weak",
    action: "Not a fit",
    reason: "Outside target unless interior water appears",
  },
];

export const routingQueue = [
  {
    id: "L-104892",
    lead: "Basement flooding",
    source: "Website form",
    channel: "Organic",
    issue: "Water loss",
    location: "Basement",
    decision: "Route to mitigation",
    score: 92,
    age: "2 min",
    tone: "green" as const,
  },
  {
    id: "L-104891",
    lead: "Agent client backup",
    source: "Insurance agent",
    channel: "Referral",
    issue: "Water loss",
    location: "Lower level",
    decision: "Route to mitigation",
    score: 88,
    age: "5 min",
    tone: "green" as const,
  },
  {
    id: "L-104890",
    lead: "Kitchen supply line",
    source: "Google Local",
    channel: "Maps",
    issue: "Water loss",
    location: "Kitchen",
    decision: "Route to mitigation",
    score: 85,
    age: "7 min",
    tone: "green" as const,
  },
  {
    id: "L-104889",
    lead: "Roof hail inspection",
    source: "HomeAdvisor",
    channel: "Referral",
    issue: "Hail / wind",
    location: "Roof",
    decision: "Out of scope",
    score: 18,
    age: "9 min",
    tone: "red" as const,
  },
  {
    id: "L-104888",
    lead: "Laundry room overflow",
    source: "Plumbing partner",
    channel: "Warm intro",
    issue: "Water loss",
    location: "Laundry room",
    decision: "Route to mitigation",
    score: 81,
    age: "11 min",
    tone: "green" as const,
  },
  {
    id: "L-104887",
    lead: "Wind siding damage",
    source: "Facebook lead",
    channel: "Paid social",
    issue: "Wind damage",
    location: "Exterior",
    decision: "Out of scope",
    score: 16,
    age: "16 min",
    tone: "red" as const,
  },
];

export const routingMetrics = [
  { label: "Water loss leads", value: "142", delta: "+18%" },
  { label: "Routed to mitigation", value: "116", delta: "81%" },
  { label: "Out of scope", value: "26", delta: "19%" },
  { label: "Avg. routing score", value: "78", delta: "+7 pts" },
];

export const scoreRules = [
  { label: "Standing water", value: "+40", note: "Visible water on floors or active intrusion." },
  { label: "Photos uploaded", value: "+20", note: "Team can see severity before calling." },
  { label: "After-hours call", value: "+30", note: "Urgent timing increases follow-up priority." },
  { label: "Partner tier A", value: "+50", note: "High-value referral partner relationship." },
  { label: "Warm introduction", value: "+30", note: "Personal referral with trust already established." },
];

export const routingRules = [
  { rule: "Top priority water", condition: "Score 90+ with active loss", target: "Mitigation team", sla: "15 min", status: "Active" },
  { rule: "High priority water", condition: "Score 70-89 with water loss", target: "Mitigation team", sla: "30 min", status: "Active" },
  { rule: "Mid intent", condition: "Score 40-69", target: "Estimator queue", sla: "1 hr", status: "Active" },
  { rule: "Low priority", condition: "Score under 40", target: "Review queue", sla: "4 hrs", status: "Active" },
];

export const scoreChanges = [
  { label: "Water severity weight increased", detail: "20 to 25 after Ops review" },
  { label: "Trade partner rule added", detail: "5 days ago by Ops Admin" },
];

export const reportRows = [
  { source: "Insurance Agents", leads: 142, jobs: 28, conversion: "19.7%", revenue: "$342,180" },
  { source: "Property Managers", leads: 96, jobs: 19, conversion: "19.8%", revenue: "$198,450" },
  { source: "Plumbing Partners", leads: 74, jobs: 17, conversion: "23.0%", revenue: "$176,880" },
  { source: "Online / Website", leads: 56, jobs: 9, conversion: "16.1%", revenue: "$87,430" },
];

export const reportMetrics = [
  { label: "Leads", value: "142", delta: "+18%" },
  { label: "Routed to mitigation", value: "116", delta: "+18%" },
  { label: "Jobs started", value: "38", delta: "+12%" },
  { label: "Revenue booked", value: "$182,400", delta: "+22%" },
  { label: "Avg. response", value: "18m", delta: "-6m" },
  { label: "Win rate", value: "26.8%", delta: "+3.2 pts" },
];

export const responseRows = [
  { priority: "Top (90-100)", response: "12m", sla: "15 min" },
  { priority: "High (70-89)", response: "22m", sla: "30 min" },
  { priority: "Medium (40-69)", response: "48m", sla: "1 hr" },
  { priority: "Low (0-39)", response: "2h 12m", sla: "4 hrs" },
];

export const exampleScore = calculateScores({
  lead: { standingWater: true, photoUploaded: true, afterHoursCall: false },
  partner: { tier: "B", relationshipSignal: "warm_intro" },
  calculatedAt: "2026-05-27T17:00:00.000Z",
});

export const exampleScoreBreakdown = {
  lead: [
    { label: "Base lead score", value: 10 },
    { label: "Standing water", value: 40 },
    { label: "Photo uploaded", value: 20 },
  ],
  partner: [
    { label: "Partner tier B", value: 30 },
    { label: "Warm intro", value: 30 },
  ],
};

export const targetLossKeywords = TARGET_LOSS_KEYWORDS;

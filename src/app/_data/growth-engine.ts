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
  { label: "AI Studio", href: "/ai-studio", icon: "ai" },
  { label: "Agent Operations", href: "/agent-operations", icon: "agents" },
  { label: "Persona Intelligence", href: "/persona-intelligence", icon: "persona" },
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
    relationships: "96 contacts / 38 properties / 14 jobs",
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
    relationships: "42 companies / 67 properties / 19 leads",
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
    relationships: "51 contacts / 28 companies / 12 jobs",
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
    relationships: "16 contacts / 17 properties / 4 jobs",
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
    relationships: "8 properties / 8 contacts / 5 outcomes",
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
    relationships: "5 jobs / 5 leads / $32.5K booked",
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

export const crmWorkspaceStats = [
  { label: "Open pipeline", value: "$46.8K", delta: "5 active jobs" },
  { label: "New leads", value: "19", delta: "2 min refresh" },
  { label: "Partner accounts", value: "42", delta: "14 producing" },
  { label: "Data health", value: "86%", delta: "35 findings" },
];

export const crmPipelineRows = [
  {
    id: "basement-flooding",
    record: "Basement flooding",
    account: "Marlene Vega",
    type: "Emergency homeowner",
    stage: "Mitigation dispatch",
    owner: "Mitigation",
    value: "$8,400",
    nextStep: "Call within 15 min",
    updated: "2 min ago",
    score: 92,
    href: "/crm/leads/basement-flooding",
    tone: "green" as const,
  },
  {
    id: "water-backup",
    record: "Agent client water backup",
    account: "North Branch Insurance",
    type: "Insurance referral",
    stage: "Intake review",
    owner: "Robby",
    value: "$6,200",
    nextStep: "Confirm property access",
    updated: "8 min ago",
    score: 88,
    href: "/crm/leads/water-backup",
    tone: "green" as const,
  },
  {
    id: "j-2044-basement-mitigation",
    record: "J-2044 Basement mitigation",
    account: "1234 W Addison St",
    type: "Active job",
    stage: "Dry-out in progress",
    owner: "Field",
    value: "$18,420",
    nextStep: "Upload moisture readings",
    updated: "Today",
    score: 81,
    href: "/crm/jobs/j-2044-basement-mitigation",
    tone: "blue" as const,
  },
  {
    id: "apex-plumbing-co",
    record: "Apex Plumbing Co.",
    account: "Trade partner",
    type: "Plumbing partner",
    stage: "Referral nurture",
    owner: "Robby",
    value: "$9,875",
    nextStep: "Send partner packet",
    updated: "2 days ago",
    score: 74,
    href: "/crm/companies/apex-plumbing-co",
    tone: "amber" as const,
  },
  {
    id: "roof-hail-inspection",
    record: "Roof hail inspection",
    account: "HomeAdvisor",
    type: "Out of scope",
    stage: "Archive review",
    owner: "Ops",
    value: "$0",
    nextStep: "Confirm no interior water",
    updated: "16 min ago",
    score: 18,
    href: "/crm/leads/roof-hail-inspection",
    tone: "red" as const,
  },
];

export const crmActivityFeed = [
  { title: "Lead routed", detail: "Basement flooding moved to Mitigation dispatch.", time: "2 min ago", tone: "green" },
  { title: "Relationship linked", detail: "North Branch Insurance connected to agent client water backup.", time: "8 min ago", tone: "blue" },
  { title: "Data health finding", detail: "Apex Plumbing Co. missing partner owner email.", time: "12 min ago", tone: "amber" },
  { title: "Scope guardrail", detail: "Roof hail inspection marked out of scope pending water confirmation.", time: "16 min ago", tone: "red" },
];

export const crmTaskQueue = [
  { task: "Call Marlene Vega", object: "Lead", due: "Now", owner: "Mitigation", priority: "High" },
  { task: "Confirm agency contact", object: "Company", due: "Today", owner: "Robby", priority: "Medium" },
  { task: "Attach property photos", object: "Job", due: "Today", owner: "Field", priority: "Medium" },
  { task: "Resolve duplicate company", object: "Company", due: "Tomorrow", owner: "Ops", priority: "Low" },
];

export const hyperPersonalizationReference = {
  source: "docs/hyper-personalization-product-goals.md",
  thesis: "Move from static persona CRM records to living restoration-specific profiles that recommend the safest next message, channel, offer, and action.",
  modules: [
    "Persona intelligence layer",
    "Engagement timeline",
    "Campaign objects",
    "Next best action",
    "Approval guardrails",
  ],
};

export const competitorSoftwareReferences = [
  {
    app: "HubSpot",
    category: "CRM + marketing automation",
    pattern: "Contact timelines connect form fills, emails, lists, and campaign membership.",
    applyToGrowthEngine: "Use the timeline pattern, but keep restoration persona and loss-scope guardrails first-class.",
    status: "Borrow pattern",
  },
  {
    app: "Salesforce",
    category: "CRM command center",
    pattern: "Record pages combine account context, activity, next steps, and related objects.",
    applyToGrowthEngine: "Mirror the dense operating view for six CRM objects while adding persona snapshots.",
    status: "Borrow pattern",
  },
  {
    app: "HighLevel",
    category: "Local services campaigns",
    pattern: "Funnels, SMS, email, and appointment follow-up live near each contact.",
    applyToGrowthEngine: "Adapt the campaign workflow, but block auto-send until executive approval exists.",
    status: "Adapt cautiously",
  },
  {
    app: "Clay",
    category: "Enrichment + workflow",
    pattern: "Rows accumulate enrichment, scoring, and AI-generated next actions.",
    applyToGrowthEngine: "Use enrichment-style audit trails for partner intelligence and competitor research.",
    status: "Research",
  },
];

export const leadHyperPersonaSnapshot = {
  basePersona: "persona_homeowner_emergency",
  relationshipStage: "urgent_decision",
  valueTier: "high",
  recentBehavior: "website_form_2_min_ago",
  dominantLossPattern: "basement_standing_water",
  preferredChannel: "phone_then_sms",
  messagePosture: "fast_reassurance_documentation_first",
  recommendedOffer: "15 minute mitigation call and photo upload",
  nextBestAction: "Call now, request photos, then send approval-safe reassurance SMS",
  confidence: "92%",
  riskFlags: ["coverage_neutral_language_required", "water_loss_only_scope"],
};

export const leadEngagementEvents = [
  { event: "Website form submitted", channel: "Form", detail: "Standing water and burst pipe selected.", time: "2 min ago" },
  { event: "Source captured", channel: "Web", detail: "Organic basement flooding intent.", time: "2 min ago" },
  { event: "Routing score calculated", channel: "System", detail: "High urgency water-loss score: 92.", time: "1 min ago" },
  { event: "Content signal queued", channel: "AI Studio", detail: "Emergency landing page and SMS reassurance needed.", time: "Now" },
];

export const leadNextBestActions = [
  { action: "Call now", reason: "Active water and high urgency signal.", approval: "No approval needed" },
  { action: "Send reassurance SMS draft", reason: "Homeowner needs fast next-step clarity.", approval: "Human approval required" },
  { action: "Create campaign content brief", reason: "Repeated basement flooding demand should inform AI Studio.", approval: "Review before generation" },
];

export const crmPersonaSnapshots: Record<
  string,
  {
    basePersona: string;
    relationshipStage: string;
    valueTier: string;
    recentBehavior: string;
    dominantLossPattern: string;
    preferredChannel: string;
    messagePosture: string;
    recommendedOffer: string;
    nextBestAction: string;
    confidence: string;
    riskFlags: string[];
  }
> = {
  "basement-flooding": leadHyperPersonaSnapshot,
  "water-backup": {
    basePersona: "persona_insurance_agent",
    relationshipStage: "active_referral",
    valueTier: "high",
    recentBehavior: "agent_client_backup_8_min_ago",
    dominantLossPattern: "lower_level_water_backup",
    preferredChannel: "phone_then_email",
    messagePosture: "coverage_neutral_documentation_first",
    recommendedOffer: "agent client handoff and documentation packet",
    nextBestAction: "Confirm property access and send coverage-neutral handoff email",
    confidence: "88%",
    riskFlags: ["coverage_neutral_language_required", "agent_relationship_protection"],
  },
  "apex-plumbing-co": {
    basePersona: "persona_plumbing_partner",
    relationshipStage: "partner_growth",
    valueTier: "high",
    recentBehavior: "referred_job_2_days_ago",
    dominantLossPattern: "source_stop_water_damage",
    preferredChannel: "email_then_phone",
    messagePosture: "simple_handoff_partner_protection",
    recommendedOffer: "co-branded water damage referral lane",
    nextBestAction: "Send partner packet and activate plumbing partner campaign",
    confidence: "91%",
    riskFlags: ["relationship_protection_required"],
  },
  "north-branch-insurance": {
    basePersona: "persona_insurance_agent",
    relationshipStage: "warm_partner",
    valueTier: "high",
    recentBehavior: "multiple_agent_referrals_this_period",
    dominantLossPattern: "storm_water_client_handoff",
    preferredChannel: "email",
    messagePosture: "concise_documentation_first",
    recommendedOffer: "coverage-neutral referral packet",
    nextBestAction: "Send agent documentation packet and request next client handoff",
    confidence: "86%",
    riskFlags: ["coverage_neutral_language_required"],
  },
  "emilia-davi": {
    basePersona: "persona_insurance_agent",
    relationshipStage: "referral_enablement",
    valueTier: "high",
    recentBehavior: "client_water_backup_today",
    dominantLossPattern: "agent_client_water_backup",
    preferredChannel: "email",
    messagePosture: "neutral_client_support",
    recommendedOffer: "claim-safe client handoff kit",
    nextBestAction: "Send agent packet and log referred loss outcome",
    confidence: "88%",
    riskFlags: ["coverage_neutral_language_required"],
  },
};

export const crmRecordEngagementEvents: Record<
  string,
  Array<{ event: string; channel: string; detail: string; time: string }>
> = {
  "basement-flooding": leadEngagementEvents,
  "water-backup": [
    { event: "Referral logged", channel: "Partner", detail: "Insurance agent submitted a lower-level water backup.", time: "8 min ago" },
    { event: "Routing score calculated", channel: "System", detail: "High urgency water-loss score: 88.", time: "7 min ago" },
    { event: "Approval-safe email queued", channel: "AI Studio", detail: "Coverage-neutral handoff copy needs owner review.", time: "Now" },
  ],
  "apex-plumbing-co": [
    { event: "Partner referral converted", channel: "CRM", detail: "Referral produced a closed water-loss job.", time: "2 days ago" },
    { event: "Partner score refreshed", channel: "System", detail: "Warm intro and tier B partner signals calculated.", time: "Today" },
    { event: "Campaign signal queued", channel: "AI Studio", detail: "Plumbing partner referral campaign needs new asset variants.", time: "Now" },
  ],
  "north-branch-insurance": [
    { event: "Referral source linked", channel: "CRM", detail: "Agency connected to active water backup lead.", time: "Today" },
    { event: "Revenue attributed", channel: "Reports", detail: "Sample closed revenue tied back to insurance agent source.", time: "Today" },
    { event: "Partner packet recommended", channel: "System", detail: "Dormancy risk is low, but enablement content is due.", time: "Now" },
  ],
  "emilia-davi": [
    { event: "Agent profile updated", channel: "CRM", detail: "Insurance agent connected to latest water backup referral.", time: "Today" },
    { event: "Coverage guardrail attached", channel: "Compliance", detail: "Outbound copy must avoid claim approval or coverage promises.", time: "Today" },
    { event: "Next action generated", channel: "System", detail: "Send neutral client handoff email after owner review.", time: "Now" },
  ],
};

export const validationRows = [
  { label: "Approved customer types", value: "12", status: "Ready" },
  { label: "Unassigned records", value: "Internal cleanup only", status: "Blocked for new leads" },
  { label: "Rejected submissions", value: "3", status: "Needs correction" },
  { label: "Missing relationships", value: "2", status: "Needs review" },
  { label: "Duplicate detection", value: "0", status: "Clear" },
];

export const foundationIssues = [
  { issue: "Missing email address", affected: "People (11)", impact: "Outreach blocked", lastFound: "2 min ago", detector: "Contact completeness", confidence: "94%", action: "Review" },
  { issue: "Duplicate companies", affected: "Companies (6)", impact: "Reporting skew", lastFound: "12 min ago", detector: "Name + phone match", confidence: "88%", action: "Resolve" },
  { issue: "Invalid phone format", affected: "People (7)", impact: "SMS delivery risk", lastFound: "18 min ago", detector: "Phone normalization", confidence: "91%", action: "Fix" },
  { issue: "Orphaned properties", affected: "Properties (8)", impact: "Relationship gap", lastFound: "1 hr ago", detector: "Missing contact link", confidence: "86%", action: "Review" },
  { issue: "Missing property address", affected: "Properties (3)", impact: "Routing risk", lastFound: "2 hrs ago", detector: "Address required", confidence: "97%", action: "Fix" },
];

export const integrityScanStats = [
  { label: "Records scanned", value: "259", delta: "Mock pass" },
  { label: "Rules active", value: "6", delta: "Ready" },
  { label: "Issues found", value: "35", delta: "Needs cleanup" },
  { label: "Last scan", value: "2m", delta: "Auto cadence" },
];

export const integrityScannerRules = [
  {
    rule: "Contact completeness",
    searches: "Missing email, phone, first name, or customer type",
    objects: "Contacts, Leads",
    cadence: "Every 15 min",
    status: "Active",
  },
  {
    rule: "Duplicate detection",
    searches: "Similar company names, matching phone, matching domain",
    objects: "Companies",
    cadence: "Hourly",
    status: "Active",
  },
  {
    rule: "Relationship integrity",
    searches: "Properties without contacts, leads without properties, outcomes without jobs",
    objects: "Properties, Leads, Jobs, Outcomes",
    cadence: "Every 30 min",
    status: "Active",
  },
  {
    rule: "Routing readiness",
    searches: "Missing customer type, loss type, water-loss signal, or source",
    objects: "Leads",
    cadence: "Every 5 min",
    status: "Active",
  },
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
  {
    name: "Sewage backup in utility room",
    contact: "Anton Bell",
    address: "1818 W. Foster Ave., Chicago",
    customerType: "persona_property_manager" as const,
    issue: "sewage backup, lower level",
    source: "Property manager call",
    received: "Today, 6:42 AM",
    action: "High priority",
    score: 92,
    status: "Ready for team",
    classification: classifyLossSignals(["sewage backup", "lower level water"]),
  },
  {
    name: "Kitchen supply line leak",
    contact: "Nadia Rosario",
    address: "3520 W. Diversey Ave., Chicago",
    customerType: "persona_homeowner_preventative" as const,
    issue: "active leak, water under cabinets",
    source: "Google Local",
    received: "Yesterday, 5:18 PM",
    action: "Needs review",
    score: 68,
    status: "Needs dispatcher review",
    classification: classifyLossSignals(["active leak", "water under cabinets"]),
  },
  {
    name: "Mold concern after pipe leak",
    contact: "Iris Nakamura",
    address: "2238 N. Sawyer Ave., Chicago",
    customerType: "persona_landlord" as const,
    issue: "mold, previous pipe leak",
    source: "Tenant referral",
    received: "Yesterday, 3:55 PM",
    action: "Needs review",
    score: 61,
    status: "Needs dispatcher review",
    classification: classifyLossSignals(["mold", "previous pipe leak"]),
  },
  {
    name: "Exterior siding estimate",
    contact: "Mateo Klein",
    address: "4911 N. Milwaukee Ave., Chicago",
    customerType: "persona_gc_remodeler_partner" as const,
    issue: "exterior remodeling only",
    source: "Partner form",
    received: "Yesterday, 2:11 PM",
    action: "Not a fit",
    score: 7,
    status: "Archive",
    classification: classifyLossSignals("exterior remodeling only no water"),
  },
  {
    name: "Fire cleanup after small kitchen loss",
    contact: "Priya Shah",
    address: "640 W. 18th St., Chicago",
    customerType: "persona_homeowner_emergency" as const,
    issue: "fire cleanup, smoke, water used",
    source: "Phone intake",
    received: "Yesterday, 12:28 PM",
    action: "High priority",
    score: 84,
    status: "Ready for team",
    classification: classifyLossSignals(["fire cleanup", "water used"]),
  },
];

export const personaAccelerationStats = [
  { label: "Tracked personas", value: "118", delta: "CRM contacts" },
  { label: "Ready to convert", value: "24", delta: "Needs action" },
  { label: "Partner candidates", value: "17", delta: "Referral focus" },
  { label: "Content briefs", value: "9", delta: "AI Studio feed" },
];

export const personaTrackerRows = [
  {
    key: "emergency-homeowner",
    persona: "Emergency Homeowner",
    segment: "Homeowner",
    stage: "Urgent decision",
    intent: "Standing water, burst pipe, after-hours search",
    accelerator: "15 minute call, mitigation proof, photo upload",
    nextAction: "Call now",
    contentNeed: "Emergency landing page + SMS reassurance",
    score: 94,
    blocker: "Needs trust fast",
    offer: "Fast mitigation handoff",
    crmPath: "/crm/leads/basement-flooding",
    aiStudioPath: "/ai-studio?campaign=emergency-homeowner-basement",
    tone: "red" as const,
  },
  {
    key: "insurance-agent",
    persona: "Insurance Agent",
    segment: "Professional",
    stage: "Referral enablement",
    intent: "Client water backup, needs neutral handoff",
    accelerator: "Agent script, claim-safe language, referral tracking",
    nextAction: "Send agent packet",
    contentNeed: "Coverage-neutral email + one-pager",
    score: 88,
    blocker: "Avoid coverage promises",
    offer: "Client handoff kit",
    crmPath: "/crm/contacts/emilia-davi",
    aiStudioPath: "/ai-studio?campaign=insurance-agent-storm-water",
    tone: "green" as const,
  },
  {
    key: "plumbing-partner",
    persona: "Plumbing Partner",
    segment: "Partner",
    stage: "Partner growth",
    intent: "Stops source, needs restoration handoff",
    accelerator: "Co-branded referral flow, follow-up templates",
    nextAction: "Create partner campaign",
    contentNeed: "Referral landing page + video prompt",
    score: 91,
    blocker: "Needs simple handoff",
    offer: "Water damage partner lane",
    crmPath: "/crm/companies/apex-plumbing-co",
    aiStudioPath: "/ai-studio?campaign=plumbing-partner-water-backup",
    tone: "blue" as const,
  },
  {
    key: "property-manager",
    persona: "Property Manager",
    segment: "Professional",
    stage: "Portfolio evaluation",
    intent: "Recurring property risk, tenant disruption",
    accelerator: "Response SLA, documentation, portfolio packet",
    nextAction: "Build portfolio offer",
    contentNeed: "Property manager proof points",
    score: 76,
    blocker: "Needs operational confidence",
    offer: "Portfolio response plan",
    crmPath: "/crm/companies/pulaski-property-group",
    aiStudioPath: "/ai-studio?campaign=property-manager-response",
    tone: "amber" as const,
  },
  {
    key: "buyer-agent",
    persona: "Buyer Agent",
    segment: "Professional",
    stage: "Inspection objection",
    intent: "Moisture concern before closing",
    accelerator: "Fast review, estimate language, inspection summary",
    nextAction: "Draft inspection follow-up",
    contentNeed: "Inspection concern email + checklist",
    score: 64,
    blocker: "Timing-sensitive deal",
    offer: "Fast damage review",
    crmPath: "/crm/contacts/leona-price",
    aiStudioPath: "/ai-studio?action=new-campaign",
    tone: "amber" as const,
  },
];

export const personaContentSignals = [
  { signal: "Standing water urgency", source: "Emergency homeowners", engineUse: "Landing page hero, paid search copy, SMS first response", priority: "High" },
  { signal: "Coverage-neutral handoff", source: "Insurance agents", engineUse: "Agent email, one-pager, compliance guardrails", priority: "High" },
  { signal: "Source-stop referral", source: "Plumbing partners", engineUse: "Referral landing page, partner script, short video prompt", priority: "High" },
  { signal: "Portfolio response confidence", source: "Property managers", engineUse: "Case study bullets, SLA proof points, outreach sequence", priority: "Medium" },
];

export const personaAccelerationPlaybooks = [
  {
    playbook: "Convert urgent homeowners",
    trigger: "High water-loss score with emergency homeowner persona",
    action: "Call, show proof, send reassurance SMS, request photos",
  },
  {
    playbook: "Grow referral partners",
    trigger: "Agent or trade contact with repeat lead potential",
    action: "Send partner kit, create campaign brief, track referred jobs",
  },
  {
    playbook: "Nurture professional influencers",
    trigger: "Manager, agent, or HOA segment with low current intent",
    action: "Build education content and schedule light-touch follow-up",
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

export const aiStudioStats = [
  { label: "Campaigns", value: "4", delta: "In production" },
  { label: "Ad assets", value: "18", delta: "Draft library" },
  { label: "Connected tools", value: "10", delta: "Launch + embed plan" },
  { label: "Auto-publish", value: "Off", delta: "Approval required" },
];

export const marketingCampaigns = [
  {
    key: "plumbing-partner-water-backup",
    name: "Plumbing Partner Water Backup",
    audience: "Plumbing partners",
    objective: "Turn source-stop calls into restoration referrals.",
    status: "In production",
    assets: 6,
    owner: "Growth",
  },
  {
    key: "insurance-agent-storm-water",
    name: "Insurance Agent Storm Water",
    audience: "Insurance agents",
    objective: "Give agents a coverage-neutral client handoff path.",
    status: "Briefing",
    assets: 4,
    owner: "PMM",
  },
  {
    key: "emergency-homeowner-basement",
    name: "Emergency Homeowner Basement",
    audience: "Emergency homeowners",
    objective: "Capture urgent basement flooding demand.",
    status: "Review",
    assets: 5,
    owner: "Ops",
  },
  {
    key: "property-manager-response",
    name: "Property Manager Response",
    audience: "Property managers",
    objective: "Create a repeatable portfolio response offer.",
    status: "Drafting",
    assets: 3,
    owner: "Referral",
  },
];

export const campaignProductionStages = [
  { label: "Brief", detail: "Audience, loss type, offer, channel, and compliance boundary.", count: "4" },
  { label: "Generate", detail: "AI drafts copy, ad concepts, creative prompts, and variants.", count: "12" },
  { label: "Build", detail: "Landing pages, ads, emails, SMS, one-pagers, and video prompts.", count: "18" },
  { label: "Approve", detail: "Human review blocks coverage promises and off-scope campaigns.", count: "7" },
  { label: "Maintain", detail: "Refresh assets using CRM, reports, and outcome feedback.", count: "Next" },
];

export const campaignBriefFields = [
  { label: "Campaign", value: "Plumbing Partner Water Backup", detail: "Referral growth campaign" },
  { label: "Audience", value: "Plumbing partners", detail: "Trade partners who stop the source" },
  { label: "Loss focus", value: "Burst pipe / water backup", detail: "Flood and water losses only" },
  { label: "Offer", value: "Fast mitigation handoff", detail: "Coverage-neutral language" },
];

export const marketingAssetRows = [
  {
    asset: "Partner referral landing page",
    channel: "Web",
    tool: "Codex",
    status: "In build",
    nextStep: "Create page section variants",
  },
  {
    asset: "Google Search ad group",
    channel: "Search",
    tool: "ChatGPT",
    status: "Draft",
    nextStep: "Generate headline set",
  },
  {
    asset: "Short video creative prompt",
    channel: "Video",
    tool: "Higgsfield",
    status: "Ready for prompt",
    nextStep: "Send approved concept",
  },
  {
    asset: "Partner email sequence",
    channel: "Email",
    tool: "Claude Code",
    status: "Review",
    nextStep: "Compliance pass",
  },
  {
    asset: "SMS handoff draft",
    channel: "SMS",
    tool: "Compliance Agent",
    status: "Needs compliance",
    nextStep: "Remove risky phrasing",
  },
  {
    asset: "Referral one-pager",
    channel: "PDF",
    tool: "Figma / Canva",
    status: "Design",
    nextStep: "Build visual layout",
  },
];

export const campaignToolchain = [
  { tool: "Codex", role: "Build landing pages and app surfaces", mode: "In-app launch", state: "Ready" },
  { tool: "Claude Code", role: "Code review, implementation plans, copy QA", mode: "CLI companion", state: "Ready" },
  { tool: "ChatGPT", role: "Strategy, ad copy, campaign variants", mode: "Workspace launch", state: "Ready" },
  { tool: "Higgsfield", role: "Video concepts and motion creative", mode: "Creative studio", state: "Needs embed check" },
  { tool: "Linear", role: "Campaign tasks and production tickets", mode: "Deep links", state: "Ready" },
  { tool: "Google Drive", role: "Source docs, briefs, PDFs, approvals", mode: "Docs hub", state: "Ready" },
];

export const aiAgents = [
  {
    key: "pmm",
    name: "PMM Agent",
    role: "Positioning, campaign angle, partner offer",
    nextTask: "Turn plumbing partner referrals into a tight campaign brief.",
    status: "Ready",
  },
  {
    key: "growth",
    name: "Growth Agent",
    role: "Experiment ideas, channel plan, landing page tests",
    nextTask: "Suggest three lead-source experiments for water loss calls.",
    status: "Ready",
  },
  {
    key: "compliance",
    name: "Compliance Agent",
    role: "Insurance language, claims risk, approval checks",
    nextTask: "Flag coverage promises and hail-only messaging.",
    status: "Required",
  },
  {
    key: "seo",
    name: "Local SEO Agent",
    role: "Service pages, Google Business posts, location content",
    nextTask: "Draft Chicago water backup post ideas.",
    status: "Ready",
  },
  {
    key: "referral",
    name: "Referral Agent",
    role: "Partner outreach, one-pagers, follow-up scripts",
    nextTask: "Create a warm intro script for insurance agents.",
    status: "Ready",
  },
  {
    key: "ops",
    name: "Ops Agent",
    role: "CRM context, routing, next-best action",
    nextTask: "Convert high-priority lead data into action prompts.",
    status: "Ready",
  },
];

export const approvalDrafts = [
  { asset: "Plumbing partner email", audience: "Plumbing partners", status: "Pending approval", risk: "Low" },
  { asset: "Emergency homeowner SMS", audience: "Emergency homeowners", status: "Needs compliance", risk: "Medium" },
  { asset: "Water backup landing copy", audience: "Insurance agents", status: "Pending approval", risk: "Low" },
  { asset: "Roof hail ad concept", audience: "General homeowners", status: "Blocked", risk: "Out of scope" },
];

export const workspaceTools = [
  {
    key: "codex",
    name: "Codex",
    purpose: "Build app features, inspect repo changes, and ship local code.",
    url: "https://chatgpt.com/codex",
    status: "Launch",
    embed: "Launch card",
  },
  {
    key: "claude",
    name: "Claude Code",
    purpose: "Pair on implementation, code review, and repo-level changes.",
    url: "https://claude.ai/",
    status: "Launch",
    embed: "CLI companion",
  },
  {
    key: "chatgpt",
    name: "ChatGPT",
    purpose: "Strategy, copy exploration, research, and campaign refinement.",
    url: "https://chatgpt.com/",
    status: "Launch",
    embed: "Launch card",
  },
  {
    key: "higgsfield",
    name: "Higgsfield",
    purpose: "Generate video and creative concepts for approved campaigns.",
    url: "https://higgsfield.ai/",
    status: "Launch",
    embed: "External studio",
  },
  {
    key: "linear",
    name: "Linear",
    purpose: "Track project issues, implementation phases, and approval work.",
    url: "https://linear.app/",
    status: "Launch",
    embed: "Can deep-link",
  },
  {
    key: "github",
    name: "GitHub",
    purpose: "Review branches, pull requests, commits, and project history.",
    url: "https://github.com/",
    status: "Launch",
    embed: "External repo",
  },
  {
    key: "supabase",
    name: "Supabase",
    purpose: "Inspect database tables, auth, storage, and future persistence.",
    url: "https://supabase.com/dashboard",
    status: "Launch",
    embed: "External console",
  },
  {
    key: "vercel",
    name: "Vercel",
    purpose: "Preview deployments, environment state, and production readiness.",
    url: "https://vercel.com/dashboard",
    status: "Launch",
    embed: "External console",
  },
  {
    key: "drive",
    name: "Google Drive",
    purpose: "Open planning docs, briefs, PDFs, and campaign source material.",
    url: "https://drive.google.com/",
    status: "Launch",
    embed: "Docs hub",
  },
  {
    key: "figma",
    name: "Figma / Canva",
    purpose: "Design campaign assets, one-pagers, and visual creative.",
    url: "https://figma.com/",
    status: "Launch",
    embed: "Design tools",
  },
];

export const promptGuardrails = [
  "Create only flood, water backup, burst pipe, storm surge, standing-water, mold, sewage, and fire restoration marketing.",
  "Do not create hail-only, wind-only, exterior-only roof, or unrelated remodeling campaigns.",
  "Do not promise insurance coverage, claim approval, or payout outcomes.",
  "Every outbound draft remains pending approval until a human approves it.",
  "Use approved customer and partner types from the Growth Engine persona map.",
];

export const agentOperationMetrics = [
  { label: "Active agents", value: "5", delta: "Scaffolded roles" },
  { label: "Tasks running", value: "4", delta: "Mock queue" },
  { label: "Awaiting approval", value: "7", delta: "Owner gate" },
  { label: "Blocked outputs", value: "2", delta: "Scope / claims risk" },
  { label: "Approved this week", value: "11", delta: "Draft assets" },
  { label: "Risk flags", value: "9", delta: "Compliance visible" },
];

export const agentOperations = [
  {
    key: "persona-intelligence",
    name: "Persona Intelligence Agent",
    purpose: "Refreshes hyper-persona snapshots and explains the safest next message, channel, offer, and action.",
    status: "Running",
    currentTask: "Refresh emergency homeowner and insurance agent snapshots from the latest water-loss events.",
    lastOutput: "Updated basement flooding snapshot with phone-first posture and approval-safe SMS need.",
    riskFlags: ["coverage-neutral messaging", "snapshot changes outbound copy"],
    approvalPolicy: "Required when snapshot changes a campaign or message.",
    performance: "24 profiles ready to convert",
    href: "/agent-operations/persona-intelligence",
    dataSources: ["companies", "contacts", "properties", "leads", "jobs", "outcomes", "engagement_events"],
    allowedActions: ["Summarize records", "Draft persona snapshots", "Recommend next best actions"],
    blockedActions: ["Send outbound messages", "Change CRM records without preview", "Accept unassigned_persona for routing"],
    instructionProfile: "Prioritize water, flood, sewage, mold, fire, and burst pipe context. Treat unassigned_persona as internal cleanup only.",
  },
  {
    key: "compliance",
    name: "Compliance Agent",
    purpose: "Checks generated assets for insurance, claim, scope, and approval risk before owner review.",
    status: "Required",
    currentTask: "Review emergency homeowner SMS and block a hail-only ad concept from campaign generation.",
    lastOutput: "Blocked roof hail ad concept because no interior water signal was present.",
    riskFlags: ["coverage promise risk", "hail-only scope risk"],
    approvalPolicy: "Required for any medium, high, or blocked risk item.",
    performance: "2 unsafe outputs blocked",
    href: "/agent-operations/compliance",
    dataSources: ["campaign_assets", "approval_items", "loss routing rules", "persona snapshots"],
    allowedActions: ["Flag risky phrases", "Suggest safer edits", "Recommend approval status"],
    blockedActions: ["Approve public copy alone", "Publish ads", "Send SMS or email"],
    instructionProfile: "Keep all marketing coverage-neutral. Block claim approval, payout, or coverage promises.",
  },
  {
    key: "campaign-strategy",
    name: "Campaign Strategy Agent",
    purpose: "Turns persona and business signals into campaign briefs, audiences, offers, channels, and measurement plans.",
    status: "Queued",
    currentTask: "Draft a plumbing partner water-backup campaign brief from referral growth signals.",
    lastOutput: "Prepared campaign outline with partner packet, landing page, and measurement plan.",
    riskFlags: ["requires owner approval before asset generation"],
    approvalPolicy: "Required before content generation starts.",
    performance: "4 briefs in production",
    href: "/agent-operations/campaign-strategy",
    dataSources: ["persona snapshots", "reports", "campaigns", "lead source trends", "partner health"],
    allowedActions: ["Draft briefs", "Recommend channels", "Propose measurement plans"],
    blockedActions: ["Launch campaigns", "Generate final assets without approved brief", "Target off-scope losses"],
    instructionProfile: "Campaigns must stay aligned to water, flood, sewage, mold, fire, and restoration demand.",
  },
  {
    key: "content-production",
    name: "Content Production Agent",
    purpose: "Drafts campaign assets from approved briefs, including copy, scripts, one-pagers, and creative prompts.",
    status: "Needs approval",
    currentTask: "Create approved-brief variants for partner email, one-pager, and referral landing page sections.",
    lastOutput: "Generated three partner email variants and routed them to compliance review.",
    riskFlags: ["human review required before dispatch", "channel requirements attached"],
    approvalPolicy: "Required before any external dispatch or publishing.",
    performance: "18 draft assets",
    href: "/agent-operations/content-production",
    dataSources: ["approved campaign briefs", "persona snapshots", "prompt guardrails", "campaign assets"],
    allowedActions: ["Draft assets", "Create variants", "Generate creative prompts"],
    blockedActions: ["Publish landing pages", "Send email", "Send SMS"],
    instructionProfile: "Create useful drafts, but keep every external asset locked until approval.",
  },
  {
    key: "referral-growth",
    name: "Referral Growth Agent",
    purpose: "Finds partner growth opportunities and drafts partner packets, follow-ups, scripts, and reactivation plans.",
    status: "Ready",
    currentTask: "Recommend follow-up for Apex Plumbing Co. after recent closed referral outcome.",
    lastOutput: "Suggested co-branded referral lane and simple source-stop handoff script.",
    riskFlags: ["relationship protection required"],
    approvalPolicy: "Required before outbound communication.",
    performance: "17 partner candidates",
    href: "/agent-operations/referral-growth",
    dataSources: ["companies", "contacts", "partner score", "outcomes", "engagement timeline"],
    allowedActions: ["Recommend partner next steps", "Draft partner packets", "Flag dormant accounts"],
    blockedActions: ["Contact partners directly", "Promise referral payments", "Modify partner records without preview"],
    instructionProfile: "Protect trust with insurance agents, plumbing partners, property managers, and HOA contacts.",
  },
];

export const agentTaskQueue = [
  {
    id: "AT-1007",
    agentKey: "persona-intelligence",
    task: "Refresh emergency homeowner snapshot",
    objective: "Use the selected basement flooding lead to update message posture and next best action.",
    linkedObject: "Lead: L-104892",
    linkedHref: "/crm/leads/basement-flooding",
    campaign: "Emergency Homeowner Basement",
    persona: "Emergency Homeowner",
    status: "running",
    priority: "High",
    risk: "Medium",
    approval: "Required if used in outbound SMS",
    updated: "2 min ago",
    href: "/agent-operations/tasks/AT-1007",
    inputs: ["Lead score 92", "Water loss / basement", "Website form", "phone_then_sms channel"],
    outputTitle: "Persona snapshot refresh",
    outputBody: "Emergency homeowner needs fast reassurance, photo upload request, and mitigation dispatch. Keep all copy coverage-neutral.",
    compliance: "Pending because SMS wording may become external.",
  },
  {
    id: "AT-1008",
    agentKey: "compliance",
    task: "Review emergency homeowner SMS",
    objective: "Check an SMS draft for claims, coverage, urgency, and restoration-scope risk.",
    linkedObject: "Asset: Emergency homeowner SMS",
    linkedHref: "/ai-studio?action=review-asset&campaign=emergency-homeowner-basement",
    campaign: "Emergency Homeowner Basement",
    persona: "Emergency Homeowner",
    status: "needs_approval",
    priority: "High",
    risk: "Medium",
    approval: "Owner approval required",
    updated: "Now",
    href: "/agent-operations/tasks/AT-1008",
    inputs: ["SMS draft", "Prompt guardrails", "Lead loss focus", "Approval policy"],
    outputTitle: "Compliance pass needed",
    outputBody: "Draft is useful but must avoid any implication that insurance will cover the loss or that claim approval is likely.",
    compliance: "Medium risk. Suggested rewrite before owner approval.",
  },
  {
    id: "AT-1009",
    agentKey: "campaign-strategy",
    task: "Draft plumbing partner campaign brief",
    objective: "Turn partner referral signals into a campaign brief for source-stop handoffs.",
    linkedObject: "Company: Apex Plumbing Co.",
    linkedHref: "/crm/companies/apex-plumbing-co",
    campaign: "Plumbing Partner Water Backup",
    persona: "Plumbing Partner",
    status: "queued",
    priority: "Medium",
    risk: "Low",
    approval: "Required before asset generation",
    updated: "12 min ago",
    href: "/agent-operations/tasks/AT-1009",
    inputs: ["Partner score 91", "Closed referral outcome", "Water backup focus", "Referral growth playbook"],
    outputTitle: "Campaign brief draft",
    outputBody: "Build a co-branded referral page, short call script, and partner email packet focused on fast restoration handoff.",
    compliance: "Low risk. Brief still needs owner approval before production.",
  },
  {
    id: "AT-1010",
    agentKey: "compliance",
    task: "Block roof hail ad concept",
    objective: "Prevent off-scope hail-only demand from becoming a paid campaign.",
    linkedObject: "Asset: Roof hail ad concept",
    linkedHref: "/approvals?item=AI-404",
    campaign: "Out-of-scope review",
    persona: "General homeowner",
    status: "blocked",
    priority: "High",
    risk: "Blocked",
    approval: "Cannot approve without interior water signal",
    updated: "16 min ago",
    href: "/agent-operations/tasks/AT-1010",
    inputs: ["Hail-only issue", "No interior water", "Loss routing guardrail", "Paid ad draft"],
    outputTitle: "Blocked scope",
    outputBody: "Do not generate hail-only or exterior-roof campaign assets unless the task is explicitly to reject or isolate them.",
    compliance: "Blocked by scope guardrail.",
  },
  {
    id: "AT-1011",
    agentKey: "content-production",
    task: "Draft insurance agent one-pager",
    objective: "Create an approval-safe one-pager from the insurance agent campaign brief.",
    linkedObject: "Campaign: Insurance Agent Storm Water",
    linkedHref: "/ai-studio?campaign=insurance-agent-storm-water",
    campaign: "Insurance Agent Storm Water",
    persona: "Insurance Agent",
    status: "completed",
    priority: "Medium",
    risk: "Low",
    approval: "Pending owner approval",
    updated: "28 min ago",
    href: "/agent-operations/tasks/AT-1011",
    inputs: ["Approved brief", "Insurance agent persona", "Coverage-neutral rule", "Water backup source data"],
    outputTitle: "One-pager draft ready",
    outputBody: "Agent handoff page explains documentation, response path, and client support without coverage promises.",
    compliance: "Low risk. Pending owner review.",
  },
];

export const agentApprovalQueue = [
  {
    id: "AI-401",
    source: "Emergency homeowner SMS",
    agentKey: "compliance",
    agent: "Compliance Agent",
    campaign: "Emergency Homeowner Basement",
    persona: "Emergency Homeowner",
    channel: "SMS",
    status: "Needs compliance",
    risk: "Medium",
    promptInput: "Write a short reassurance SMS after a basement water-loss form submission.",
    draftOutput: "We received your basement water-loss request. Big Shoulders can call now, confirm the source, and help document the damage before the next step.",
    complianceFlags: ["Avoid coverage promises", "Keep urgency factual", "Confirm water-loss scope"],
    href: "/approvals?item=AI-401",
  },
  {
    id: "AI-402",
    source: "Plumbing partner email",
    agentKey: "content-production",
    agent: "Content Production Agent",
    campaign: "Plumbing Partner Water Backup",
    persona: "Plumbing Partner",
    channel: "Email",
    status: "Pending owner approval",
    risk: "Low",
    promptInput: "Draft a partner email for source-stop plumbers who encounter water damage.",
    draftOutput: "When your team stops the source, Big Shoulders can help your customer move into restoration documentation and mitigation review.",
    complianceFlags: ["Relationship-safe", "No claim outcome language"],
    href: "/approvals?item=AI-402",
  },
  {
    id: "AI-403",
    source: "Insurance agent one-pager",
    agentKey: "content-production",
    agent: "Content Production Agent",
    campaign: "Insurance Agent Storm Water",
    persona: "Insurance Agent",
    channel: "PDF",
    status: "Pending owner approval",
    risk: "Low",
    promptInput: "Create a coverage-neutral handoff one-pager for insurance agents.",
    draftOutput: "A concise client handoff resource focused on documentation, response speed, and restoration coordination.",
    complianceFlags: ["Coverage-neutral", "No approval or payout claims"],
    href: "/approvals?item=AI-403",
  },
  {
    id: "AI-404",
    source: "Roof hail ad concept",
    agentKey: "compliance",
    agent: "Compliance Agent",
    campaign: "Out-of-scope review",
    persona: "General homeowner",
    channel: "Paid search",
    status: "Blocked",
    risk: "Out of scope",
    promptInput: "Generate hail roof inspection ads.",
    draftOutput: "Blocked. Hail-only and exterior-only roof work cannot become a campaign trigger without interior water penetration.",
    complianceFlags: ["Hail-only", "Exterior roof only", "No water-loss signal"],
    href: "/approvals?item=AI-404",
  },
];

export const agentRecentOutputs = [
  { output: "Basement flooding persona snapshot", agent: "Persona Intelligence Agent", status: "Needs approval", time: "2 min ago" },
  { output: "Roof hail ad scope block", agent: "Compliance Agent", status: "Blocked", time: "16 min ago" },
  { output: "Insurance agent one-pager", agent: "Content Production Agent", status: "Pending approval", time: "28 min ago" },
  { output: "Plumbing partner campaign outline", agent: "Campaign Strategy Agent", status: "Draft", time: "42 min ago" },
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

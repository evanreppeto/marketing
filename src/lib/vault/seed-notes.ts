import { type VaultNote } from "@/domain";

// Hand-written examples in the SAME raw format real Obsidian files use, so
// Mark's eventual vault import is a drop-in. Also the app's offline fallback
// and the source the vault_notes migration seeds. Bodies use [[wiki-links]]
// that resolve to other notes, CRM records, and personas.
export const seedVaultNotes: VaultNote[] = [
  {
    slug: "emergency-homeowner-playbook",
    title: "Emergency Homeowner Playbook",
    folder: "Playbooks",
    tags: ["homeowner", "urgent"],
    author: "Evan",
    status: "Published",
    updated: "Today",
    body: [
      "# Emergency Homeowner Playbook",
      "",
      "When an [[persona_homeowner_emergency|emergency homeowner]] reports active water, call within 15 minutes.",
      "",
      "- Reassure first, document second.",
      "- Request photos before the truck rolls.",
      "- See live example: [[basement-flooding]].",
      "",
      "Related: [[insurance-agent-handoff]].",
    ].join("\n"),
  },
  {
    slug: "insurance-agent-handoff",
    title: "Insurance Agent Handoff",
    folder: "Playbooks",
    tags: ["partner", "coverage-neutral"],
    author: "Mark",
    status: "Needs review",
    updated: "Today",
    body: [
      "# Insurance Agent Handoff",
      "",
      "Give the [[persona_insurance_agent|insurance agent]] a coverage-neutral path to refer a client.",
      "",
      "Never promise coverage. Lead with documentation.",
      "",
      "Partner record: [[north-branch-insurance]].",
    ].join("\n"),
  },
  {
    slug: "apex-plumbing-co-intel",
    title: "Apex Plumbing Co. — Partner Intel",
    folder: "Partner Intel",
    tags: ["partner", "plumbing"],
    author: "Mark",
    status: "Draft",
    updated: "Yesterday",
    body: [
      "# Apex Plumbing Co. — Partner Intel",
      "",
      "[[apex-plumbing-co]] stops the source and hands off property damage.",
      "",
      "Best channel: email then phone. Tie referrals to the [[emergency-homeowner-playbook]].",
      "",
      "TODO: confirm the owner's after-hours contact (link target [[apex-after-hours]] not imported yet).",
    ].join("\n"),
  },
  {
    slug: "coverage-neutral-language-sop",
    title: "Coverage-Neutral Language SOP",
    folder: "SOPs",
    tags: ["compliance"],
    author: "Evan",
    status: "Published",
    updated: "2 days ago",
    body: [
      "# Coverage-Neutral Language SOP",
      "",
      "Applies to every message aimed at the [[persona_insurance_agent|insurance agent]] persona.",
      "",
      "- No coverage promises.",
      "- No claim-approval language.",
      "- Used by [[insurance-agent-handoff]].",
    ].join("\n"),
  },
];

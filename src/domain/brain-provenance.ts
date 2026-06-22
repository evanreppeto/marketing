/** The six logical sources a brain fact can originate from. Drives the source
 *  filter bar and provenance dots. */
export type BrainSourceSystem = "brand" | "crm" | "library" | "campaign" | "arc" | "human";

/** Who taught Arc this fact. */
export type LearnedBy = "arc" | "brand_sync" | "human";

/** A resolved navigation target to the fact's originating record. */
export type ProvenanceDeepLink = { href: string; label: string };

export type NodeProvenance = {
  system: BrainSourceSystem;
  label: string;
  learnedBy: LearnedBy;
  deepLink: ProvenanceDeepLink | null;
};

/** The subset of a brain node this helper reads. Mirrors fields on BrainNode. */
export type ProvenanceInput = {
  kind: string;
  source: string | null;
  createdBy: string | null;
  refTable: string | null;
  refId: string | null;
  tags: string[];
};

const CRM_TABLES = new Set(["companies", "contacts", "leads", "properties", "jobs", "outcomes"]);

const CRM_SINGULAR: Record<string, string> = {
  companies: "Company",
  contacts: "Contact",
  leads: "Lead",
  properties: "Property",
  jobs: "Job",
  outcomes: "Outcome",
};

function learnedBy(input: ProvenanceInput): LearnedBy {
  if (input.source === "brand_source_ingestion") return "brand_sync";
  if (input.createdBy === "arc") return "arc";
  return "human";
}

/**
 * Derive a node's source system, display label, who learned it, and a deep-link
 * to its originating record — purely from fields already on the node. No I/O.
 */
export function nodeProvenance(input: ProvenanceInput): NodeProvenance {
  const lb = learnedBy(input);
  const table = input.refTable;
  const id = input.refId;

  if (table && id && CRM_TABLES.has(table)) {
    return {
      system: "crm",
      label: `CRM · ${CRM_SINGULAR[table]}`,
      learnedBy: lb,
      deepLink: { href: `/crm/${table}/${id}`, label: "Open CRM record" },
    };
  }

  if (table === "campaigns" && id) {
    return {
      system: "campaign",
      label: "Campaign",
      learnedBy: lb,
      deepLink: { href: `/campaigns/${id}`, label: "Open campaign" },
    };
  }

  if (table === "media_assets" && id) {
    const isBrand = input.tags.includes("brand-source");
    return {
      system: isBrand ? "brand" : "library",
      label: isBrand ? "Brand asset" : "Library asset",
      learnedBy: lb,
      deepLink: { href: `/library?asset=${id}`, label: "Open in Library" },
    };
  }

  const system: BrainSourceSystem = input.createdBy === "arc" ? "arc" : "human";
  return {
    system,
    label: system === "arc" ? "Arc inference" : "Entered by operator",
    learnedBy: lb,
    deepLink: null,
  };
}

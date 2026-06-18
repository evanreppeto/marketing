import { crmObjects } from "../../_data/growth-engine";

export type CrmObjectKey = (typeof crmObjects)[number]["key"];

export type CrmTableColumnKey =
  | "primary"
  | "secondary"
  | "persona"
  | "score"
  | "status"
  | "updated"
  | "nextAction"
  | "value"
  | "links";

export type CrmFieldPreset = {
  tableColumns: CrmTableColumnKey[];
  studioFields: Array<{
    label: string;
    type: string;
    required?: boolean;
  }>;
};

export const CRM_FIELD_PRESETS: Record<CrmObjectKey, CrmFieldPreset> = {
  companies: {
    tableColumns: ["primary", "secondary", "links", "status", "updated", "nextAction"],
    studioFields: [
      { label: "Company", type: "Text", required: true },
      { label: "Type", type: "Status" },
      { label: "Linked people", type: "Relationship" },
      { label: "Status", type: "Status" },
      { label: "Next action", type: "Long notes" },
    ],
  },
  contacts: {
    tableColumns: ["primary", "secondary", "links", "status", "updated", "nextAction"],
    studioFields: [
      { label: "Contact", type: "Text", required: true },
      { label: "Relationship", type: "Relationship" },
      { label: "Company / asset", type: "Relationship" },
      { label: "Status", type: "Status" },
      { label: "Next action", type: "Long notes" },
    ],
  },
  properties: {
    tableColumns: ["primary", "secondary", "persona", "score", "status", "updated", "nextAction"],
    studioFields: [
      { label: "Asset", type: "Text", required: true },
      { label: "Owner / contact", type: "Relationship" },
      { label: "Persona", type: "Tag" },
      { label: "Score", type: "Number" },
      { label: "Status", type: "Status" },
      { label: "Next action", type: "Long notes" },
    ],
  },
  leads: {
    tableColumns: ["primary", "secondary", "persona", "score", "status", "updated", "nextAction"],
    studioFields: [
      { label: "Lead", type: "Text", required: true },
      { label: "Source", type: "Tag" },
      { label: "Persona", type: "Tag" },
      { label: "Score", type: "Number" },
      { label: "Status", type: "Status" },
      { label: "Next action", type: "Long notes" },
    ],
  },
  jobs: {
    tableColumns: ["primary", "secondary", "value", "links", "status", "updated", "nextAction"],
    studioFields: [
      { label: "Project", type: "Text", required: true },
      { label: "Stage", type: "Status" },
      { label: "Value", type: "Money" },
      { label: "Linked records", type: "Relationship" },
      { label: "Status", type: "Status" },
      { label: "Next action", type: "Long notes" },
    ],
  },
  outcomes: {
    tableColumns: ["primary", "secondary", "value", "links", "status", "updated"],
    studioFields: [
      { label: "Outcome", type: "Text", required: true },
      { label: "Attribution", type: "Relationship" },
      { label: "Revenue", type: "Money" },
      { label: "Linked records", type: "Relationship" },
      { label: "Status", type: "Status" },
      { label: "Closed date", type: "Date" },
    ],
  },
};

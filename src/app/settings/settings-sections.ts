/** Canonical settings tabs — the single source of truth for the rail and the
 *  panel map keyed by id. Order = tab order. */
export const SETTINGS_SECTIONS = [
  { id: "home", label: "Home" },
  { id: "general", label: "General" },
  {
    id: "branding",
    label: "Workspace & product",
    description: "Product label, assistant name, and workspace type. Brand identity (name, logo) lives in Brand Kit.",
  },
  {
    id: "brand-kit",
    label: "Brand Kit",
    description: "Your business identity, voice, services, and guardrails — what Arc works from.",
  },
  { id: "appearance", label: "Appearance" },
  { id: "behavior", label: "Agent behavior" },
  { id: "account", label: "Account" },
  { id: "connections", label: "Connections" },
  { id: "agent", label: "Agent" },
  { id: "notifications", label: "Notifications" },
  { id: "system", label: "System status" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/** Canonical settings tabs: one source of truth for the rail and panel map. */
export const SETTINGS_SECTIONS = [
  { id: "home", label: "Home" },
  { id: "general", label: "General" },
  {
    id: "branding",
    label: "Workspace & product",
    description: "Product label, assistant name, and workspace type. Company brand and source knowledge live in Brand.",
  },
  { id: "appearance", label: "Appearance" },
  { id: "behavior", label: "Agent behavior" },
  {
    id: "media",
    label: "Media models",
    description: "Advanced: pin specific image/video models that override your Arc level.",
  },
  {
    id: "workspace",
    label: "Team access",
    description: "Invite teammates into the current workspace with role-scoped codes.",
  },
  { id: "account", label: "Account" },
  { id: "connections", label: "Connections" },
  { id: "agent", label: "Agent" },
  { id: "notifications", label: "Notifications" },
  { id: "system", label: "System status" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

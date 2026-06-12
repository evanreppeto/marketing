/** Canonical settings tabs — the single source of truth for the rail and the
 *  panel map keyed by id. Order = tab order. */
export const SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "account", label: "Account" },
  { id: "connections", label: "Connections" },
  { id: "agent", label: "Agent" },
  { id: "notifications", label: "Notifications" },
  { id: "system", label: "System status" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

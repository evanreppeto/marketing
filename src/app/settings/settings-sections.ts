/** Canonical settings sections — the single source of truth for the in-page nav
 *  and the `id` anchors on each section card. Order = display + scroll order. */
export const SETTINGS_SECTIONS = [
  { id: "automation", label: "Automation" },
  { id: "guardrails", label: "Guardrails" },
  { id: "cta-rules", label: "CTA rules" },
  { id: "brand-voice", label: "Brand voice" },
  { id: "connections", label: "Connections" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

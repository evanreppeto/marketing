import {
  Activity,
  Bell,
  Bot,
  Cable,
  CircleUser,
  Clapperboard,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Palette,
  SlidersHorizontal,
  UsersRound,
  Webhook,
  type LucideIcon,
} from "lucide-react";

/** The grouped buckets the rail renders, in display order. */
export const SETTINGS_GROUPS = ["Overview", "General", "Workspace", "Arc agent", "Connections", "Account"] as const;

export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

/**
 * Canonical settings tabs: one source of truth for the rail and panel map.
 * `group` buckets each tab in the sidebar; `icon` + `keywords` power the
 * icon rail and the search filter. Section `id`s are stable deep-link targets —
 * relabel freely, but don't rename ids (Home cards and `?section=` links use them).
 */
export const SETTINGS_SECTIONS = [
  {
    id: "home",
    label: "Overview",
    group: "Overview",
    icon: LayoutDashboard,
    blurb: "What's configured and what needs attention.",
    keywords: "overview home setup status checklist getting started progress",
  },
  {
    id: "general",
    label: "General",
    group: "General",
    icon: SlidersHorizontal,
    blurb: "Support contact and deployment basics.",
    keywords: "support email environment access gate operator deployment",
  },
  {
    id: "appearance",
    label: "Appearance",
    group: "General",
    icon: Palette,
    blurb: "Accent, density, and motion across the console.",
    keywords: "appearance theme accent color density motion dark interface",
  },
  {
    id: "workspaces",
    label: "Workspaces",
    group: "Workspace",
    icon: LayoutGrid,
    description: "Switch between the workspaces you belong to, or create a new one.",
    blurb: "Switch between your workspaces.",
    keywords: "workspaces switch personal company agency organization create switcher",
  },
  {
    id: "workspace",
    label: "Team",
    group: "Workspace",
    icon: UsersRound,
    description: "Manage members, roles, and invite codes for the active workspace.",
    blurb: "Members, roles, and invite codes.",
    keywords: "team members roles invite admin owner manage access seats permissions",
  },
  {
    id: "branding",
    label: "Product",
    group: "Workspace",
    icon: Package,
    description: "Product label and assistant name. Company brand and source knowledge live in Brand.",
    blurb: "Product label and assistant name.",
    keywords: "product label assistant name branding workspace type profile",
  },
  {
    id: "behavior",
    label: "Behavior",
    group: "Arc agent",
    icon: Bot,
    blurb: "Tone, response style, and approval strictness.",
    keywords: "agent behavior tone response style approval strictness arc level stance ask act draft",
  },
  {
    id: "media",
    label: "Media models",
    group: "Arc agent",
    icon: Clapperboard,
    description: "Advanced: pin specific image/video models that override your Arc level.",
    blurb: "Pin specific image and video models.",
    keywords: "media models image video nano banana veo studio swift generation",
  },
  {
    id: "notifications",
    label: "Notifications",
    group: "Arc agent",
    icon: Bell,
    blurb: "How the app wakes the agent on new messages.",
    keywords: "notifications webhook wake signing hmac secret agent push",
  },
  {
    id: "agent",
    label: "Runner & tokens",
    group: "Arc agent",
    icon: Webhook,
    blurb: "Connect the runner, issue tokens, manage the webhook.",
    keywords: "agent runner endpoint webhook token setup bundle api arc connect",
  },
  {
    id: "connections",
    label: "Connections",
    group: "Connections",
    icon: Cable,
    blurb: "Email, storage, social, and database setup.",
    keywords: "connections email resend drive storage social database supabase integration",
  },
  {
    id: "account",
    label: "Account",
    group: "Account",
    icon: CircleUser,
    blurb: "Operator identity, sign-in, and session.",
    keywords: "account operator identity sign out password passkey support session",
  },
  {
    id: "system",
    label: "System status",
    group: "Account",
    icon: Activity,
    blurb: "Live health across every integration.",
    keywords: "system status health database webhook social gate diagnostics",
  },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

export type SettingsSectionMeta = (typeof SETTINGS_SECTIONS)[number];

export type { LucideIcon };

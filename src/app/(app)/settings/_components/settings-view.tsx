"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { SettingsTeamInvite, SettingsTeamMember, SettingsTeamView, WorkspaceActivityEntry } from "@/lib/auth/team-view";
import { WORKSPACE_ROLES } from "@/lib/auth/workspace-roles";
import type { SettingsWorkspace, SettingsWorkspacesView } from "@/lib/auth/workspaces-view";
import type { SettingsUsageView } from "@/lib/ai-usage/settings-summary";
import type { ConnectorSpendView } from "@/lib/connectors/spend-summary";

import { connectorMatchesIndustry, describeConnectorCost, findConnector, type ConnectorCostTier, type ConnectorStatus } from "@/domain";
import type { ConnectorView } from "@/lib/connectors/read-model";
import type { SettingsConnectorsView } from "@/lib/connectors/settings-connectors";
import { IMAGE_MODELS, VIDEO_MODELS, type AppSettings } from "@/lib/settings/store";

import {
  cancelInvite,
  changeMemberRole,
  createInvite,
  createWorkspace,
  removeMember,
  saveAppearanceSettings,
  saveGeneralSettings,
  saveMediaDefaults,
  saveRunnerDisplayName,
  switchWorkspace,
} from "../actions";
import {
  removeUserAvatarAction,
  removeWorkspaceLogoAction,
  saveUserAvatarAction,
  saveWorkspaceLogoAction,
} from "../branding-actions";
import { connectConnector, disconnectConnector, saveConnectorConfig, testConnector, toggleConnectorEnabled } from "../connectors-actions";
import { setEmailConnectionEnabled, testEmailConnection } from "../connections-actions";
import type { ConnectionView } from "@/lib/connections/read-model";
import { setConnectorSpendCap } from "../spend-actions";
import { ImageUploadField } from "./image-upload-field";
import { NewWorkspaceModal, type NewWorkspaceValue } from "./new-workspace-modal";

type SettingsWriteResult = { ok: true; persisted: boolean; message?: string } | { ok: false; error: string };

const ROLE_OPTIONS = ["Owner", "Admin", "Marketer", "Reviewer", "Member", "Viewer"];

const ICON: Record<string, string> = {
  general: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 00-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.3 2.5h4l.3-2.5a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5a7 7 0 00.1-1z"/>',
  appearance: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 000 18 4 4 0 000-8 3 3 0 010-6 4 4 0 000-4z"/>',
  team: '<circle cx="8" cy="9" r="2.5"/><circle cx="16" cy="9" r="2.5"/><path d="M3 19c0-3 2-4.5 5-4.5M21 19c0-3-2-4.5-5-4.5M9 19c0-2 1.5-3 3-3s3 1 3 3"/>',
  workspaces: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/>',
  connections: '<path d="M8 12l-3 3a3 3 0 004 4l3-3M16 12l3-3a3 3 0 00-4-4l-3 3M9 15l6-6"/>',
  agent: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V5M9 13h.01M15 13h.01M9 16h6"/>',
  media: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
  behavior: '<path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z"/><path d="M5 19h14"/>',
  account: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>',
  usage: '<path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6"/>',
  notifications: '<path d="M18 8a6 6 0 00-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10 20a2 2 0 004 0"/>',
  system: '<path d="M12 3v3M12 18v3M5 12H2M22 12h-3M6 6l-2-2M20 20l-2-2M6 18l-2 2M20 4l-2 2"/><circle cx="12" cy="12" r="4"/>',
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
};
const CHECK = '<path d="M5 12l4 4L19 6"/>';
const Ic = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: d }} />;

const NAVGROUPS = [
  { g: "WORKSPACE", items: [["overview", "Overview"], ["general", "General"], ["appearance", "Appearance"], ["team", "Team"], ["workspaces", "Workspaces"]] },
  { g: "ARC", items: [["connections", "Connections"], ["media", "Media models"], ["behavior", "Behavior"]] },
  { g: "ACCOUNT", items: [["account", "Account & security"], ["usage", "Usage & billing"], ["notifications", "Notifications"], ["system", "System status"]] },
] as const;
const DOTS: Record<string, string> = { connections: "var(--ok)", system: "var(--ok)", notifications: "var(--warn)" };

// Sections with in-section tabs. The breadcrumb + tab bar render from these.
const SUBTABS: Record<string, string[]> = {
  general: ["Workspace", "Agent"],
  team: ["Members", "Invites", "Roles", "Activity"],
  connections: ["Live", "Roadmap"],
  media: ["Defaults", "Roster"],
  account: ["Identity", "Sign-in"],
  usage: ["Overview", "Connectors", "By day", "By model", "Recent"],
};
const SECTION_LABEL: Record<string, string> = Object.fromEntries(NAVGROUPS.flatMap((g) => g.items.map((it) => [it[0], it[1]])));

// Synonyms so search jumps on intent, not just the literal section name.
const SECTION_KEYWORDS: Record<string, string> = {
  overview: "home dashboard health",
  general: "workspace name industry support email brand from-name identity",
  appearance: "theme accent color colour dark light density motion look feel",
  team: "members invite invitation role permission access seat",
  workspaces: "switch organization org tenant",
  connections: "integration api token credential connector gemini higgsfield mcp vault",
  media: "models image video audio gemini veo higgsfield generation default aspect",
  behavior: "autonomy guardrail recall outbound approval send publish",
  account: "security password passkey sign-in login session operator sso google",
  usage: "billing cost spend tokens runs plan cap invoice budget",
  notifications: "alerts email digest notify",
  system: "status health services supabase resend probe",
};

// ---- reusable controls ----
// Sw/Seg support both an uncontrolled mode (self-state, for cosmetic mockup rows)
// and a controlled mode (value + onChange, for persisted settings).
function Sw({ on: init, locked, value, onChange }: { on?: boolean; locked?: boolean; value?: boolean; onChange?: (v: boolean) => void }) {
  const [self, setSelf] = useState(!!init);
  const on = onChange ? !!value : self;
  const toggle = () => {
    if (locked) return;
    if (onChange) onChange(!on);
    else setSelf((v) => !v);
  };
  return <span className={`sw${on ? " on" : ""}${locked ? " locked" : ""}`} onClick={toggle}><i /></span>;
}
function Seg({ opts, active, value, onChange }: { opts: string[]; active?: string; value?: string; onChange?: (v: string) => void }) {
  const [internal, setInternal] = useState(active ?? opts[0]);
  const v = value ?? internal;
  return (
    <div className="seg">
      {opts.map((o) => (
        <button key={o} className={o === v ? "on" : ""} onClick={() => (onChange ? onChange(o) : setInternal(o))}>{o}</button>
      ))}
    </div>
  );
}

// Small inline save-status line, styled like the other feedback spans in this file.
type SaveStatus = { tone: "ok" | "err"; text: string } | null;
function Status({ status }: { status: SaveStatus }) {
  if (!status) return null;
  return <span style={{ fontSize: 12, color: status.tone === "ok" ? "var(--ok-text)" : "var(--red-text)" }}>{status.text}</span>;
}
function toStatus(res: SettingsWriteResult, okText: string): SaveStatus {
  if (!res.ok) return { tone: "err", text: res.error };
  return { tone: "ok", text: res.persisted ? okText : `${okText} — connect your workspace to persist.` };
}
function Pill({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`spill ${kind}`}><span className="pd" />{children}</span>;
}
function Row({ label, desc, children }: { label: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return <div className="srow"><div className="sl"><div className="slt">{label}</div>{desc && <div className="sld">{desc}</div>}</div><div className="sc">{children}</div></div>;
}
function Panel({ title, tag, foot, children }: { title: ReactNode; tag?: ReactNode; foot?: ReactNode; children: ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-h"><h3>{title}</h3>{tag}</div>
      <div className="panel-b">{children}</div>
      {foot && <div className="panel-f"><Ic d={CHECK} />{foot}</div>}
    </div>
  );
}
const TGOK = <span className="tg ok">wired</span>;
const TGEST = <span className="tg est">scaffold</span>;
const Head = ({ t, d }: { t: string; d: string }) => <div className="sechead"><h2>{t}</h2><p>{d}</p></div>;

// Breadcrumb trail: Settings › Section [› Sub-tab | › Detail]. Any crumb with an
// onClick steps back to that level; the last crumb is the current page.
type Crumb = { label: string; onClick?: () => void };
function Crumbs({ trail }: { trail: Crumb[] }) {
  return (
    <div className="crumbs">
      {trail.map((c, i) => (
        <span key={c.label + i} style={{ display: "contents" }}>
          {i > 0 && <span className="sep">›</span>}
          {c.onClick ? <button onClick={c.onClick}>{c.label}</button> : <span className="cur">{c.label}</span>}
        </span>
      ))}
    </div>
  );
}

// ---- connectors ----
const DCAT: Record<string, string> = { Research: "Grounded web research + citations.", Creative: "Generate & round-trip creative assets.", "Email & SMS": "Sync lists and deliver approved campaigns.", Social: "Schedule approved posts, pull engagement signals.", "CRM & Sales": "Two-way sync of contacts, companies, and deals.", Analytics: "Pull performance back into the learning loop.", Productivity: "Route approvals, files, and alerts." };
type Conn = { n: string; cat: string; c: string; l: string; d?: string; live?: number; note?: string; auth?: string };
const CONNECTORS: Conn[] = [
  { n: "Gemini Web Research", cat: "Research", c: "#88b6d8", l: "Gem", d: "Grounded web search + citations for scouting & brand research.", live: 1, note: "read-only" },
  { n: "Higgsfield", cat: "Creative", c: "#c8a24a", l: "Hf", d: "Cinematic image + video, UGC, virality scoring. Drafts only.", live: 1, note: "Ultra" },
  { n: "Resend", cat: "Email & SMS", c: "#9aa0ac", l: "Re", d: "Transactional + campaign email delivery.", live: 1, note: "email" },
  { n: "Instagram", cat: "Social", c: "#E1306C", l: "Ig", auth: "oauth" }, { n: "Facebook", cat: "Social", c: "#1877F2", l: "Fb", auth: "oauth" },
  { n: "LinkedIn", cat: "Social", c: "#0A66C2", l: "Li", auth: "oauth" }, { n: "X (Twitter)", cat: "Social", c: "#aab2bd", l: "X", auth: "oauth" },
  { n: "TikTok", cat: "Social", c: "#9cc1e0", l: "Tk", auth: "oauth" }, { n: "YouTube", cat: "Social", c: "#FF5252", l: "Yt", auth: "oauth" },
  { n: "Pinterest", cat: "Social", c: "#E60023", l: "Pin", auth: "oauth" }, { n: "Threads", cat: "Social", c: "#c9ccd1", l: "Th", auth: "oauth" },
  { n: "Mailchimp", cat: "Email & SMS", c: "#f3c64a", l: "Mc", auth: "api key" }, { n: "Klaviyo", cat: "Email & SMS", c: "#7fb89a", l: "Kl", auth: "api key" },
  { n: "Twilio", cat: "Email & SMS", c: "#F22F46", l: "Tw", d: "SMS delivery for approved campaigns.", auth: "api key" }, { n: "Customer.io", cat: "Email & SMS", c: "#9678c8", l: "Cio", auth: "api key" },
  { n: "HubSpot", cat: "CRM & Sales", c: "#FF7A59", l: "Hs", auth: "oauth" }, { n: "Salesforce", cat: "CRM & Sales", c: "#36b3e8", l: "Sf", auth: "oauth" },
  { n: "Pipedrive", cat: "CRM & Sales", c: "#7fb89a", l: "Pd", auth: "oauth" }, { n: "Attio", cat: "CRM & Sales", c: "#88b6d8", l: "At", auth: "oauth" },
  { n: "Google Analytics", cat: "Analytics", c: "#E37400", l: "GA", auth: "oauth" }, { n: "Segment", cat: "Analytics", c: "#52BD94", l: "Sg", auth: "api key" },
  { n: "Amplitude", cat: "Analytics", c: "#5b8def", l: "Am", auth: "api key" }, { n: "Meta Pixel", cat: "Analytics", c: "#1877F2", l: "Mp", auth: "oauth" },
  { n: "Canva", cat: "Creative", c: "#19c4cc", l: "Cv", auth: "oauth" }, { n: "Figma", cat: "Creative", c: "#F24E1E", l: "Fg", auth: "oauth" },
  { n: "Midjourney", cat: "Creative", c: "#c9ccd1", l: "Mj", d: "Import generated art into the Library.", auth: "import" },
  { n: "Slack", cat: "Productivity", c: "#c089cf", l: "Sl", d: "Route approvals + alerts to a channel.", auth: "oauth" }, { n: "Notion", cat: "Productivity", c: "#d6d6d6", l: "No", auth: "oauth" },
  { n: "Google Drive", cat: "Productivity", c: "#1FA463", l: "Dr", auth: "oauth" }, { n: "Zapier", cat: "Productivity", c: "#FF6A3D", l: "Zp", d: "Trigger 6,000+ apps from Arc events.", auth: "api key" },
  { n: "Webhooks", cat: "Productivity", c: "#9aa0ac", l: "Wh", d: "Post Arc events to any endpoint.", auth: "secret" },
];
const CATS = ["All", "Social", "Email & SMS", "CRM & Sales", "Analytics", "Creative", "Productivity"];

// Real connectors (CONNECTOR_REGISTRY) get functional cards; the rest of the
// catalog below is an honest roadmap. Logo + credential copy per real key.
const CONNECTOR_META: Record<string, { c: string; l: string; credLabel: string; credHint: string }> = {
  "gemini-research": {
    c: "#88b6d8",
    l: "Gem",
    credLabel: "Gemini API key",
    credHint: "From Google AI Studio. Stored encrypted in your Vault — never shown again, never sent to the browser.",
  },
  higgsfield: {
    c: "#c8a24a",
    l: "Hf",
    credLabel: "Higgsfield API token",
    credHint: "From your Higgsfield account. Stored in your Vault; the runner uses it only for approval-gated draft assets.",
  },
  "weather-signals": {
    c: "#7fb89a",
    l: "Wx",
    credLabel: "",
    credHint: "No credential — reads live NWS/NOAA alerts (public API) and proposes storm-response opportunities. Configure the states to watch.",
  },
  "reviews-signals": {
    c: "#e0a94a",
    l: "Rv",
    credLabel: "Google Business Profile",
    credHint: "Connect your Google Business Profile (and optionally Yelp) to pull recent reviews. Stored in your Vault; used read-only — it proposes opportunities and never replies.",
  },
  "competitor-ads": {
    c: "#c47f7f",
    l: "Ad",
    credLabel: "Ad library API access token",
    credHint: "Meta Ad Library / Google Ads Transparency access, stored in your Vault. Read-only competitive intel from official APIs — it proposes defensive opportunities and never contacts anyone.",
  },
  "webhook-dispatch": {
    c: "#9aa0ac",
    l: "Wh",
    credLabel: "",
    credHint: "No credential — the endpoint URL lives in config. Sends only from the human-approved path.",
  },
};

// costTier badge — HYBRID cost model (BSR-372 meters later; here we just label it).
const COST_TIER_BADGE: Record<ConnectorCostTier, { label: string; title: string }> = {
  free: { label: "Free", title: "No cost — bypasses metering." },
  byo_key: { label: "Your key", title: "Uses your own provider key/credits — bypasses metering." },
  metered: { label: "Metered", title: "Billed through your Arc usage (BSR-372)." },
};

const CONNECTOR_KIND_LABEL: Record<string, string> = {
  mcp_tool: "Tool",
  signal_source: "Signal source",
  channel: "Channel",
};

// Per-connector config editors (no-credential connectors). Each maps the flat
// form field to/from the workspace_connectors.config jsonb.
const CONFIG_FIELDS: Record<string, { key: string; label: string; placeholder: string; hint: string; list?: boolean }> = {
  "weather-signals": {
    key: "states",
    label: "Service area (US states)",
    placeholder: "IL, WI, IN",
    hint: "Comma-separated two-letter US state codes. Active NWS/NOAA alerts in these states become storm-response opportunities. No API key needed.",
    list: true,
  },
  "webhook-dispatch": {
    key: "endpoint",
    label: "Endpoint URL",
    placeholder: "https://example.com/hooks/arc",
    hint: "Approved messages POST here — only from the human-approved send path.",
  },
};
const CONNECTOR_STATUS_PILL: Record<ConnectorStatus, { kind: string; label: string }> = {
  connected: { kind: "ok", label: "Connected" },
  not_configured: { kind: "off", label: "Not connected" },
  disabled: { kind: "warn", label: "Paused" },
  error: { kind: "err", label: "Error" },
};

const MEDIA_MODELS: Record<string, [string, string, string, number?][]> = {
  image: [["marketing_studio_image", "Marketing Studio Image", "Higgsfield", 1], ["ms_image", "DTC Ads", "Higgsfield"], ["soul_v2", "Higgsfield Soul 2.0", "Higgsfield"], ["soul_cast", "Soul Cast", "Higgsfield"], ["soul_cinematic", "Soul Cinema", "Higgsfield"], ["soul_location", "Soul Location", "Higgsfield"], ["cinematic_studio_2_5", "Cinema Studio Image 2.5", "Higgsfield"], ["image_auto", "Auto", "Higgsfield"], ["autosprite", "AutoSprite Animation", "Higgsfield"], ["flux_2", "Flux 2.0", "Black Forest Labs"], ["flux_kontext", "Flux Kontext Max", "Black Forest Labs"], ["gpt_image", "GPT Image 1.5", "OpenAI"], ["gpt_image_2", "GPT Image 2", "OpenAI"], ["grok_image", "Grok Imagine", "xAI"], ["nano_banana", "Nano Banana", "Google"], ["nano_banana_2", "Nano Banana 2", "Google"], ["nano_banana_pro", "Nano Banana Pro", "Google"], ["kling_omni_image", "Kling O1 Image", "Kling"], ["recraft-v4-1", "Recraft 4.1", "Recraft"], ["seedream_v4_5", "Seedream 4.5", "Bytedance"], ["seedream_v5_lite", "Seedream 5.0 Lite", "Bytedance"], ["z_image", "Z Image", "Tongyi-MAI"]],
  video: [["marketing_studio_video", "Marketing Studio", "Higgsfield", 1], ["cinematic_studio_video", "Cinema Studio Video", "Higgsfield"], ["cinematic_studio_3_0", "Cinema Studio Video 3.0", "Higgsfield"], ["higgsfield_preset", "Higgsfield Preset", "Higgsfield"], ["clipify", "Personal Clipper", "Higgsfield"], ["veo3", "Google Veo 3", "Google"], ["veo3_1", "Google Veo 3.1", "Google"], ["veo3_1_lite", "Google Veo 3.1 Lite", "Google"], ["grok_video", "Grok Imagine", "xAI"], ["grok_video_v15", "Grok Imagine 1.5", "xAI"], ["kling2_6", "Kling 2.6", "Kling"], ["kling3_0", "Kling 3.0", "Kling"], ["kling3_0_turbo", "Kling 3.0 Turbo", "Kling"], ["seedance_1_5", "Seedance 1.5 Pro", "Bytedance"], ["seedance_2_0", "Seedance 2.0", "Bytedance"], ["seedance_2_0_mini", "Seedance 2.0 Mini", "Bytedance"], ["minimax_hailuo", "Minimax Hailuo", "Hailuo"], ["wan2_6", "Wan 2.6", "Wan"], ["wan2_7", "Wan 2.7", "Wan"]],
  audio: [["inworld_text_to_speech", "Inworld TTS", "Inworld", 1], ["mirelo_text_to_audio", "Mirelo SFX", "Mirelo"], ["sonilo_music", "Sonilo Text-to-Music", "Sonilo"]],
};
const PCOL: Record<string, string> = { Higgsfield: "#c8a24a", Google: "#5b8def", "Black Forest Labs": "#9678c8", OpenAI: "#7fb89a", xAI: "#aab2bd", Kling: "#E1306C", Bytedance: "#88b6d8", Recraft: "#c47055", "Tongyi-MAI": "#19c4cc", Inworld: "#9678c8", Mirelo: "#7fb89a", Sonilo: "#f3c64a", Hailuo: "#FF7A59", Wan: "#52BD94" };
const pinit = (p: string) => { const w = p.split(/[\s-]+/); return (w.length > 1 ? w[0][0] + w[1][0] : p.slice(0, 2)).toUpperCase(); };

const EMPTY_USAGE: SettingsUsageView = {
  isDemo: false, configured: false, tokensLabel: "0", runsLabel: "0", costLabel: "$0.00",
  capLabel: "$80", pctOfCap: 0, isNearCap: false, rangeLabel: "Last 30 days",
  daily: [], recent: [], byModel: [],
};

// The 5 named accents from globals.css (html[data-accent="…"]). Swatch colors are
// the representative --accent of each theme so the picker previews the real thing.
const ACCENTS: { key: AppSettings["appearanceAccent"]; color: string }[] = [
  { key: "gold", color: "#c8a24a" },
  { key: "blue", color: "#5bb7e8" },
  { key: "red", color: "#d98080" },
  { key: "steel", color: "#aeb5c2" },
  { key: "emerald", color: "#7fb89a" },
];
const DENSITY_LABEL: Record<AppSettings["appearanceDensity"], string> = { comfortable: "Comfortable", compact: "Compact" };
const MOTION_LABEL: Record<AppSettings["appearanceMotion"], string> = { standard: "Standard", reduced: "Reduced" };
const PROFILE_LABEL: Record<AppSettings["workspaceProfile"], string> = { individual: "Individual", company: "Company", agency: "Agency" };

export function SettingsView({ brandName, email, avatarUrl = null, team, usage, connectorSpend = null, settings, connectors, workspaces, emailConnection = null }: { brandName: string; email: string; avatarUrl?: string | null; team: SettingsTeamView; usage: SettingsUsageView | null; connectorSpend?: ConnectorSpendView | null; settings: AppSettings; connectors: SettingsConnectorsView; workspaces: SettingsWorkspacesView; emailConnection?: ConnectionView | null }) {
  const [cur, setCur] = useState("overview");
  const memberCount = team.members.length;
  const pendingCount = team.invites.length;
  const usageView = usage ?? EMPTY_USAGE;
  const [navQ, setNavQ] = useState("");
  const [connCat, setConnCat] = useState("All");
  const [connQ, setConnQ] = useState("");
  const [mediaCat, setMediaCat] = useState<"image" | "video" | "audio">("image");
  const [sub, setSub] = useState<Record<string, string>>({});
  const [connSel, setConnSel] = useState<string | null>(null);
  const domain = "bigshouldersrestoration.com";

  // Deep-linkable navigation: the section + sub-tab live in the URL (?s=…&t=…),
  // so Back/Forward step through sub-pages and a shared link lands on the exact
  // one. Client-only history sync — no server round-trip.
  useEffect(() => {
    const apply = () => {
      const p = new URLSearchParams(window.location.search);
      const s = p.get("s");
      const section = s && SECTION_LABEL[s] ? s : "overview";
      const t = p.get("t");
      setCur(section);
      setConnSel(section === "connections" ? p.get("c") : null);
      if (t && SUBTABS[section]?.includes(t)) setSub((prev) => ({ ...prev, [section]: t }));
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  const navTo = (section: string, tab?: string) => {
    setCur(section);
    setConnSel(null);
    if (tab && SUBTABS[section]?.includes(tab)) setSub((s) => ({ ...s, [section]: tab }));
    const first = SUBTABS[section]?.[0];
    const activeT = tab ?? sub[section] ?? first;
    const p = new URLSearchParams();
    if (section !== "overview") p.set("s", section);
    if (activeT && activeT !== first) p.set("t", activeT);
    const qs = p.toString();
    window.history.pushState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  };

  // Drill into a single connector's detail page (deep-linked ?s=connections&c=key).
  const openConnector = (key: string) => {
    setCur("connections");
    setConnSel(key);
    window.history.pushState(null, "", `${window.location.pathname}?s=connections&c=${encodeURIComponent(key)}`);
  };
  const closeConnector = () => {
    setConnSel(null);
    window.history.pushState(null, "", `${window.location.pathname}?s=connections`);
  };

  // Search jumps to a destination (section, sub-tab, or connector), not just a
  // rail filter. Each entry carries synonyms so intent-y queries land right.
  type Dest = { label: string; sub?: string; keywords: string; go: () => void };
  const destinations: Dest[] = [];
  for (const grp of NAVGROUPS) {
    for (const [key, label] of grp.items) {
      destinations.push({ label, keywords: `${label} ${grp.g} ${SECTION_KEYWORDS[key] ?? ""}`, go: () => navTo(key) });
      for (const tab of SUBTABS[key] ?? []) {
        destinations.push({ label, sub: tab, keywords: `${label} ${tab}`, go: () => navTo(key, tab) });
      }
    }
  }
  for (const v of connectors.connectors) {
    destinations.push({ label: "Connections", sub: v.label, keywords: `connections ${v.label} ${v.key} connector integration`, go: () => openConnector(v.key) });
  }
  const q = navQ.trim().toLowerCase();
  const results = q
    ? destinations
        .map((d) => {
          const hay = `${d.label} ${d.sub ?? ""}`.toLowerCase();
          const score = hay.startsWith(q) ? 3 : hay.includes(q) ? 2 : d.keywords.toLowerCase().includes(q) ? 1 : 0;
          return { d, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((r) => r.d)
    : [];
  const selectResult = (d: Dest) => { d.go(); setNavQ(""); };

  // Active in-section tab + the tab bar for the current section (null if none).
  const activeSub = SUBTABS[cur] ? sub[cur] ?? SUBTABS[cur][0] : null;
  const subCounts: Record<string, Record<string, number>> = {
    connections: { Live: connectors.connectors.length },
    team: { Members: team.members.length, Invites: team.invites.length },
  };
  const subBar = SUBTABS[cur] ? (
    <div className="subtabs">
      {SUBTABS[cur].map((t) => (
        <button key={t} className={t === activeSub ? "on" : ""} onClick={() => navTo(cur, t)}>
          {t}{subCounts[cur]?.[t] != null ? <span className="sct">{subCounts[cur][t]}</span> : null}
        </button>
      ))}
    </div>
  ) : null;
  const selectedConnector = connSel ? connectors.connectors.find((v) => v.key === connSel) ?? null : null;
  // "Recommended for your business" — real connectors whose verticals match the
  // workspace industry (BSR-371). Tailored, non-universal; empty when no industry set.
  const workspaceIndustry = (settings.industry ?? "").trim();
  const recommendedConnectors = workspaceIndustry
    ? connectors.connectors.filter((v) => connectorMatchesIndustry(findConnector(v.key)?.verticals ?? [], workspaceIndustry))
    : [];

  const sections: Record<string, ReactNode> = {
    overview: (
      <>
        <Head t="Overview" d="Your workspace at a glance — health, what needs you, and quick links." />
        <div className="ovgrid">
          {[["connections", "3", "Connections active"], ["team", String(memberCount), "Team members"], ["agent", "OK", "Runner connected"], ["usage", `${usageView.pctOfCap}%`, "Of monthly cap"]].map(([ic, v, l]) => (
            <div className="ovcard" key={l} onClick={() => navTo(ic)}><div className="ovi"><Ic d={ICON[ic]} /></div><div className="ovv">{v}</div><div className="ovl">{l}</div></div>
          ))}
        </div>
        <Panel title="Needs attention" tag={TGOK}>
          {[["warn", "2 sign-in methods unconfigured", "— add a passkey or Google for recovery.", "account"], ["warn", "Notifications aren’t wired yet", "— event delivery is still scaffold.", "notifications"], ["ok", "Outbound is locked", "— Arc can’t send, post, or spend without you.", "behavior"]].map(([k, t, d, sec]) => (
            <div className="attn" key={t} onClick={() => navTo(sec)}><span className={`ai ${k}`}><Ic d={k === "ok" ? CHECK : '<path d="M12 9v4M12 17h.01M10.3 4l-7 12a2 2 0 001.7 3h14a2 2 0 001.7-3l-7-12a2 2 0 00-3.4 0z"/>'} /></span><div className="at"><b>{t}</b> {d}</div><span className="ago">→</span></div>
          ))}
        </Panel>
        <Panel title="Workspace" tag={TGOK}>
          <Row label="Plan"><span className="pillrow"><Pill kind="ok">Premium</Pill><button className="btn sm">Manage plan</button></span></Row>
          <Row label="Business type"><span className="pillrow"><span className="ptxt">Company · Restoration &amp; home services</span><button className="btn sm" onClick={() => navTo("general")}>Change</button></span></Row>
          <Row label="Team"><span className="pillrow"><span className="ptxt">{memberCount} {memberCount === 1 ? "member" : "members"}{pendingCount > 0 ? ` · ${pendingCount} pending` : ""}</span><button className="btn sm" onClick={() => navTo("team")}>Manage</button></span></Row>
        </Panel>
      </>
    ),
    general: (
      <>
        <Head t="General" d="Your workspace identity and how Arc is named — both apply across the app and Arc’s outbound from-name." />
        {subBar}
        {activeSub === "Agent" ? <AgentIdentityPanel settings={settings} /> : <GeneralPanel brandName={brandName} settings={settings} domain={domain} />}
      </>
    ),
    appearance: (
      <>
        <Head t="Appearance" d="How the console looks. Accent, density, and motion apply across the whole app and are saved to your workspace." />
        <AppearancePanel settings={settings} />
      </>
    ),
    team: (
      <>
        <Head t="Team" d="Who’s in this workspace, what they can do, and what’s changed. Invites send a branded email via Resend." />
        {subBar}
        {activeSub === "Invites" ? (
          <TeamInvites workspaceId={team.workspaceId} seedInvites={team.invites} />
        ) : activeSub === "Roles" ? (
          <RolesGuide />
        ) : activeSub === "Activity" ? (
          <ActivityLog entries={team.activity} isDemo={team.isDemo} />
        ) : (
          <TeamMembers team={team} />
        )}
      </>
    ),
    workspaces: (
      <>
        <Head t="Workspaces" d="Each workspace is its own brand, CRM, and Arc. Switching re-tailors the whole app." />
        <WorkspacesSection view={workspaces} />
      </>
    ),
    connections: selectedConnector ? (
      <ConnectorDetail view={selectedConnector} configured={connectors.configured} onBack={closeConnector} />
    ) : (
      <>
        <Head t="Connections" d="What Arc can reach. Live connectors are per-workspace and credential-based — the key is stored encrypted in your Vault and handed only to the runner, never the browser. Posting & sending always stay human-approved." />
        {subBar}
        {activeSub === "Roadmap" ? (
          <>
            <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "0 2px 12px", lineHeight: 1.5 }}>More integrations are planned. They’re listed honestly — connecting from here isn’t available yet. Social posting & email sending will always stay human-approved.</div>
            <div className="connhub-search"><Ic d='<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>' /><input value={connQ} onChange={(e) => setConnQ(e.target.value)} placeholder="Search planned integrations…" /></div>
            <div className="catchips">{CATS.map((c) => <span key={c} className={`catchip${connCat === c ? " on" : ""}`} onClick={() => setConnCat(c)}>{c}</span>)}</div>
            <div className="conngrid">
              {CONNECTORS.filter((x) => x.n !== "Gemini Web Research" && x.n !== "Higgsfield").filter((x) => {
                const okCat = connCat === "All" || x.cat === connCat;
                const okQ = !connQ || x.n.toLowerCase().includes(connQ.toLowerCase());
                return okCat && okQ;
              }).map((x) => (
                <div className="ccard" key={x.n} style={{ opacity: 0.72 }}>
                  <div className="ct"><span className="clogo" style={{ background: `${x.c}22`, border: `1px solid ${x.c}55`, color: x.c }}>{x.l}</span><div><div className="cnm">{x.n}</div><div className="ccat">{x.cat}</div></div></div>
                  <div className="cdsc">{x.d || DCAT[x.cat] || ""}</div>
                  <div className="cfoot"><span className="badge">Planned</span><span className="grow" /><span style={{ fontSize: 11, color: "var(--muted)" }}>{x.auth || "oauth"}</span></div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {!connectors.configured && (
              <div className="cnote"><Ic d='<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>' /><div>You’re previewing without a connected workspace, so connectors read as <b>not connected</b> and changes won’t persist. These connectors are real — connect a workspace to store credentials for real.</div></div>
            )}
            {!workspaceIndustry ? (
              <div className="cnote" style={{ marginBottom: 14 }}>
                <Ic d='<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>' />
                <div>Set your <b>industry</b> in <b>General</b> to get connector recommendations tailored to your business.</div>
              </div>
            ) : recommendedConnectors.length > 0 ? (
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 9, margin: "2px 2px 12px" }}>
                  <span style={{ fontFamily: "var(--serif)", fontSize: 14.5, fontWeight: 500, color: "var(--text)" }}>Recommended for your business</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--accent-contrast)", background: "var(--accent-soft)", border: "1px solid var(--accent-border)", borderRadius: 6, padding: "1px 8px" }}>{workspaceIndustry}</span>
                </div>
                <div className="conngrid">
                  {recommendedConnectors.map((v) => <ConnectorCard key={`rec-${v.key}`} view={v} onOpen={() => openConnector(v.key)} />)}
                </div>
              </div>
            ) : null}
            {recommendedConnectors.length > 0 && (
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", margin: "2px 2px 10px" }}>All connectors</div>
            )}
            {emailConnection && <EmailConnectionCard view={emailConnection} />}
            <div className="conngrid">
              {connectors.connectors.map((v) => <ConnectorCard key={v.key} view={v} onOpen={() => openConnector(v.key)} />)}
            </div>
          </>
        )}
      </>
    ),
    media: (
      <>
        <Head t="Media models" d="Two engines generate creative — both produce approval-gated, provenance-tagged drafts. Higgsfield (primary, Ultra) auto-picks per task from its live 44-model roster. The built-in Gemini/Veo path uses the default you set below." />
        {subBar}
        {activeSub === "Roster" ? (
          <div className="panel">
            <div className="panel-h"><h3>Higgsfield roster</h3><span className="ph-d" style={{ marginLeft: 6 }}>44 models</span><span className="tg ok" style={{ marginLeft: "auto" }}>live</span></div>
            <div className="panel-b" style={{ paddingBottom: 14 }}>
              <div className="msub">{(["image", "video", "audio"] as const).map((c) => <button key={c} className={mediaCat === c ? "on" : ""} onClick={() => setMediaCat(c)}>{c.charAt(0).toUpperCase() + c.slice(1)} <span className="mct">{MEDIA_MODELS[c].length}</span></button>)}</div>
              <div className="modellist">
                {MEDIA_MODELS[mediaCat].map((m) => {
                  const [id, label, prov, rec] = m; const col = PCOL[prov] || "#9aa0ac";
                  return (
                    <div className="mrow" key={id}>
                      <span className="mlogo" style={{ background: `${col}22`, border: `1px solid ${col}55`, color: col }}>{pinit(prov)}</span>
                      <div className="mi"><div className="mn">{label}{rec ? <span className="mbadge">Arc’s pick</span> : null}</div><div className="mp">{prov}</div></div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="panel-f"><Ic d={CHECK} />Live roster (HIGGSFIELD_MODELS, validated vs MCP 2026-06-24). Arc auto-picks per task; “Arc’s pick” marks the recommended default per category.</div>
          </div>
        ) : (
          <>
            <MediaDefaultsPanel settings={settings} />
            <Panel title="Generation preferences" tag={TGEST} foot="scaffold — these toggles don’t persist yet (no consumer wired)">
              <Row label="Auto-pick best model" desc="Let Arc choose the right model per task (recommended)."><Sw on /></Row>
              <Row label="Default aspect" desc="Per-platform overrides still apply."><Seg opts={["1:1", "4:5", "9:16", "16:9"]} active="4:5" /></Row>
              <Row label="Prefer real brand media" desc="AI enhances your approved photos & footage rather than replacing them."><Sw on /></Row>
              <Row label="Allow video generation"><Sw on /></Row>
            </Panel>
          </>
        )}
      </>
    ),
    behavior: (
      <>
        <Head t="Behavior" d="What Arc may do on its own — and where the human gate stays. The outbound gate is not configurable." />
        <Panel title="Autonomy" tag={TGEST} foot="scaffold — these toggles don’t persist yet. The outbound gate is always enforced (not configurable).">
          <Row label="Draft campaigns & assets" desc="Arc prepares approval-ready packages."><Sw on /></Row>
          <Row label="Open opportunities" desc="Source-backed recommendations in your inbox."><Sw on /></Row>
          <Row label="Write to the Brain" desc="Proposed facts land review-gated, never auto-trusted."><Sw on /></Row>
          <Row label="Send / publish / spend" desc={<><b style={{ color: "var(--text)" }}>Locked.</b> Always requires explicit human approval — not configurable.</>}><span className="locklbl"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg><Sw locked /></span></Row>
          <Row label="Recall window" desc="How far back Arc reads context for a task."><Seg opts={["Tight", "Standard", "Wide"]} active="Standard" /></Row>
        </Panel>
      </>
    ),
    account: (
      <>
        <Head t="Account & security" d="Your operator identity and how you sign in. Your email is live; the controls below are still scaffold." />
        {subBar}
        {activeSub === "Sign-in" ? (
          <Panel title="Sign-in methods" tag={TGEST} foot="operator gate + /api/auth · ARC_AUTH_MODE (controls not yet wired)">
            <Row label="Password" desc="Email + password operator sign-in."><span className="pillrow"><Pill kind="ok">Configured</Pill><button className="btn sm">Change</button></span></Row>
            <Row label="Passkey" desc="Hardware / biometric sign-in."><span className="pillrow"><Pill kind="off">Not configured</Pill><button className="btn sm gold">Set up</button></span></Row>
            <Row label="Google" desc="SSO via Google."><span className="pillrow"><Pill kind="warn">Available</Pill><button className="btn sm">Connect</button></span></Row>
            <div style={{ padding: "13px 0 4px", display: "flex", gap: 9 }}><button className="btn">Reset access token</button><button className="btn danger">Sign out</button></div>
          </Panel>
        ) : (
          <Panel title="Operator" tag={TGEST}>
            <Row label="Signed in as"><span className="pillrow"><span style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", fontFamily: "var(--serif)", fontWeight: 600, color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}>{(email || "O").charAt(0).toUpperCase()}</span><span><span style={{ fontSize: "12.5px", fontWeight: 600, display: "block" }}>{email.split("@")[0] || "Operator"}</span><span style={{ fontSize: 11, color: "var(--muted)" }}>{email}</span></span></span><button className="btn sm">Edit</button></span></Row>
            <Row label="Profile photo" desc="Shown on your account and across the app. Square works best.">
              <ImageUploadField
                currentUrl={avatarUrl}
                fallback={(email || "O").charAt(0).toUpperCase()}
                shape="circle"
                uploadAction={saveUserAvatarAction}
                removeAction={removeUserAvatarAction}
              />
            </Row>
            <Row label="Access gate" desc="OPERATOR_ACCESS_TOKEN protects the console."><span className="pillrow"><Pill kind="ok">Protected</Pill><button className="btn sm">Configure</button></span></Row>
          </Panel>
        )}
      </>
    ),
    usage: (
      <>
        <Head t="Usage & billing" d="What Arc has consumed this period — tokens, runs, and estimated cost, broken down by day and by model." />
        {subBar}
        {activeSub === "Connectors" ? (
          <ConnectorSpendPanel key={connectorSpend ? `cap-${connectorSpend.capDollars}` : "cap-none"} spend={connectorSpend} />
        ) : activeSub === "By day" ? (
          <UsageByDay usage={usageView} />
        ) : activeSub === "By model" ? (
          <UsageByModel usage={usageView} />
        ) : activeSub === "Recent" ? (
          <UsageRecent usage={usageView} />
        ) : (
          <>
            <div className="panel">
              <div className="panel-h"><h3>This month</h3><span className="tg ok" style={{ marginLeft: "auto" }}>{usageView.isDemo ? "demo" : "wired"}</span></div>
              <div className="panel-b" style={{ padding: 16 }}>
                <div className="ukpis">{[[usageView.tokensLabel, "Tokens"], [usageView.runsLabel, "Agent runs"], [usageView.costLabel, "Est. cost"]].map(([v, l]) => <div className="ukpi" key={l}><div className="uv">{v}</div><div className="ul">{l}</div></div>)}</div>
                <div className="ubar"><i style={{ width: `${Math.min(usageView.pctOfCap, 100)}%`, ...(usageView.isNearCap ? { background: "var(--warn)" } : {}) }} /></div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 7 }}>{usageView.pctOfCap}% of your {usageView.capLabel} soft cap · {usageView.rangeLabel}</div>
              </div>
              <div className="panel-f"><Ic d={CHECK} />loadWorkspaceUsage → summarizeUsageForSettings · scoped to this workspace</div>
            </div>
            <div style={{ display: "flex", gap: 9 }}><button className="btn gold"><Ic d='<path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6"/>' />Open full usage report</button><button className="btn">Manage plan</button></div>
          </>
        )}
      </>
    ),
    notifications: (
      <>
        <Head t="Notifications" d="Where Arc sends you alerts. Backend delivery is not wired yet." />
        <Panel title="Email me when" tag={TGEST} foot="panel exists; no delivery action wired (scaffold)">
          <Row label="A campaign needs approval"><Sw on /></Row>
          <Row label="A dispatch fails"><Sw on /></Row>
          <Row label="A new opportunity is found"><Sw /></Row>
          <Row label="Weekly performance digest"><Sw on /></Row>
        </Panel>
      </>
    ),
    system: (
      <>
        <Head t="System status" d="Configuration health for this deployment. Values below are placeholder — a live status probe isn’t wired yet." />
        <Panel title="Services" tag={TGEST} foot="scaffold — static placeholders; target: a live status probe (e.g. GET /api/auth/status)">
          {[["Supabase", "Configured", "Manage"], ["Resend (email)", "Configured", "Manage"], ["Gemini API key", "Present", "Rotate"], ["Arc runner", "Connected · 2m ago", "Test"], ["Higgsfield connector", "Enabled", "Manage"]].map((r) => (
            <Row key={r[0]} label={r[0]}><span className="pillrow"><Pill kind="ok">{r[1]}</Pill><button className="btn sm">{r[2]}</button></span></Row>
          ))}
          <Row label="Demo data" desc="Seed example data for screenshots."><Sw /></Row>
        </Panel>
        <div><button className="btn"><Ic d='<path d="M4 4v6h6M20 20v-6h-6"/><path d="M20 10a8 8 0 00-14-3M4 14a8 8 0 0014 3"/>' />Re-run checks</button></div>
      </>
    ),
  };

  const crumbTrail: Crumb[] = [{ label: "Settings", onClick: () => navTo("overview") }];
  if (cur === "connections" && selectedConnector) {
    crumbTrail.push({ label: "Connections", onClick: closeConnector }, { label: selectedConnector.label });
  } else if (SUBTABS[cur] && activeSub) {
    crumbTrail.push({ label: SECTION_LABEL[cur], onClick: () => navTo(cur, SUBTABS[cur][0]) }, { label: activeSub });
  } else {
    crumbTrail.push({ label: SECTION_LABEL[cur] ?? "Overview" });
  }

  return (
    <div className="arc-settings">
      <nav className="setnav">
        <div className="setsearch">
          <Ic d='<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>' />
          <input
            value={navQ}
            onChange={(e) => setNavQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && results[0]) selectResult(results[0]); else if (e.key === "Escape") setNavQ(""); }}
            placeholder="Search settings…"
          />
        </div>
        {q ? (
          <div className="searchres">
            {results.length ? (
              results.map((d, i) => (
                <div key={`${d.label}-${d.sub ?? ""}-${i}`} className={`sr-item${i === 0 ? " on" : ""}`} onClick={() => selectResult(d)}>
                  <span className="sr-label">{d.label}{d.sub ? <> <span className="sr-sep">›</span> <b>{d.sub}</b></> : null}</span>
                </div>
              ))
            ) : (
              <div className="sr-empty">No settings match “{navQ.trim()}”.</div>
            )}
          </div>
        ) : (
          NAVGROUPS.map((grp) => (
            <div key={grp.g}>
              <div className="setgrp">{grp.g}</div>
              {grp.items.map((it) => (
                <div key={it[0]} className={`setitem${it[0] === cur ? " on" : ""}`} onClick={() => navTo(it[0])}>
                  <Ic d={ICON[it[0]]} /><span>{it[1]}</span>{DOTS[it[0]] && <span className="sd" style={{ background: DOTS[it[0]] }} />}
                </div>
              ))}
            </div>
          ))
        )}
      </nav>
      <div className="setmain">
        <div className="setmain-in">
          <Crumbs trail={crumbTrail} />
          {sections[cur]}
        </div>
      </div>
    </div>
  );
}

// ---- Team members (wired) ----
// Real member list from listWorkspaceTeamAccess (demo fallback offline). Role
// changes + removal go through changeMemberRole / removeMember; offline they
// resolve optimistically (persisted:false) without claiming a real write.
function TeamMembers({ team }: { team: SettingsTeamView }) {
  const [members, setMembers] = useState<SettingsTeamMember[]>(team.members);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const wsId = team.workspaceId ?? "";
  const initial = (e: string) => (e.trim()[0] || "?").toUpperCase();

  async function changeRole(m: SettingsTeamMember, label: string) {
    const prev = members;
    setMembers((ms) => ms.map((x) => (x.id === m.id ? { ...x, roleLabel: label, role: label.toLowerCase() } : x)));
    setBusy(m.id);
    setStatus(null);
    const res = await changeMemberRole({ workspaceId: wsId, membershipId: m.id, role: label });
    setBusy(null);
    if (!res.ok) {
      setMembers(prev);
      setStatus({ tone: "err", text: res.error });
    } else if (res.persisted) {
      setStatus({ tone: "ok", text: `Updated ${m.email} to ${label}.` });
    }
  }

  async function remove(m: SettingsTeamMember) {
    const prev = members;
    setMembers((ms) => ms.filter((x) => x.id !== m.id));
    setBusy(m.id);
    setStatus(null);
    const res = await removeMember({ workspaceId: wsId, membershipId: m.id });
    setBusy(null);
    if (!res.ok) {
      setMembers(prev);
      setStatus({ tone: "err", text: res.error });
    } else if (res.persisted) {
      setStatus({ tone: "ok", text: `Removed ${m.email}.` });
    }
  }

  return (
    <Panel title={<>Members <span className="ph-d" style={{ marginLeft: 6 }}>{members.length}</span></>} tag={TGOK}>
      {members.length === 0 ? (
        <div className="me" style={{ padding: "6px 2px", color: "var(--muted)" }}>No members yet.</div>
      ) : (
        members.map((m) => (
          <div className="mem" key={m.id}>
            <span className="ma">{initial(m.email)}</span>
            <div className="mi"><div className="mn">{m.email}</div><div className="me">{m.roleLabel}{m.pending ? " · invited" : ""}</div></div>
            <select className="sel" style={{ minWidth: 120 }} value={m.roleLabel} disabled={m.isOwner || busy === m.id} onChange={(e) => changeRole(m, e.target.value)}>
              {ROLE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
            </select>
            {!m.isOwner && <button className="btn sm danger" disabled={busy === m.id} onClick={() => remove(m)}>Remove</button>}
          </div>
        ))
      )}
      {status && <div style={{ fontSize: 12.5, padding: "8px 2px 0", color: status.tone === "ok" ? "var(--ok-text)" : "var(--red-text)" }}>{status.text}</div>}
    </Panel>
  );
}

// ---- Team invites (wired) ----
// Real invite creation via createInvite; the pending list is seeded from real
// workspace invites. Offline (persisted:false) items resolve optimistically.
type PendingInvite = { id: string; email: string; role: string; note: string };

function TeamInvites({ workspaceId, seedInvites }: { workspaceId: string | null; seedInvites: SettingsTeamInvite[] }) {
  const [invites, setInvites] = useState<PendingInvite[]>(seedInvites);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Marketer");
  const [expires, setExpires] = useState("14 days");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const wsId = workspaceId ?? "";

  async function send() {
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus({ tone: "err", text: "Enter an email address." });
      return;
    }
    const days = parseInt(expires, 10) || 14;
    const tempId = `local-${crypto.randomUUID()}`;
    setInvites((prev) => [{ id: tempId, email: trimmed, role, note: `${role} · just now` }, ...prev]);
    setStatus(null);
    setPending(true);

    const res = await createInvite({ email: trimmed, role, expiresInDays: days });
    setPending(false);
    if (!res.ok) {
      setInvites((prev) => prev.filter((i) => i.id !== tempId));
      setStatus({ tone: "err", text: res.error });
      return;
    }
    setEmail("");
    setStatus({
      tone: "ok",
      text: res.persisted
        ? res.message ?? "Invite sent."
        : "Invite added — connect your workspace (Supabase) to send it for real.",
    });
  }

  async function revoke(inv: PendingInvite) {
    const prev = invites;
    setInvites((list) => list.filter((i) => i.id !== inv.id));
    const res = await cancelInvite({ workspaceId: wsId, inviteId: inv.id });
    if (!res.ok) {
      setInvites(prev);
      setStatus({ tone: "err", text: res.error });
    }
  }

  return (
    <>
      <Panel title="Pending invites" tag={TGOK}>
        {invites.length === 0 ? (
          <div className="me" style={{ padding: "6px 2px", color: "var(--muted)" }}>No pending invites.</div>
        ) : (
          invites.map((inv) => (
            <div className="mem" key={inv.id}>
              <span className="ma" style={{ color: "var(--muted)", background: "var(--inset)", borderColor: "var(--line-2)" }}>?</span>
              <div className="mi"><div className="mn">{inv.email}</div><div className="me">{inv.note}</div></div>
              <Pill kind="warn">Pending</Pill>
              <button className="btn sm danger" onClick={() => revoke(inv)}>Revoke</button>
            </div>
          ))
        )}
      </Panel>
      <Panel title="Invite a teammate" tag={TGOK} foot="workspace_invites · issueWorkspaceInviteCode → sendBrandedEmail">
        <Row label="Email" desc="They’ll get a branded invite with a single-use code.">
          <input className="inp" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Row>
        <Row label="Role" desc="Roles map to capabilities (approve, draft, view).">
          <select className="sel" value={role} onChange={(e) => setRole(e.target.value)}>
            <option>Admin</option><option>Marketer</option><option>Reviewer</option><option>Member</option><option>Viewer</option>
          </select>
        </Row>
        <Row label="Expires">
          <select className="sel" style={{ minWidth: 110 }} value={expires} onChange={(e) => setExpires(e.target.value)}>
            <option>7 days</option><option>14 days</option><option>30 days</option><option>60 days</option>
          </select>
        </Row>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0 4px" }}>
          <button className="btn gold" onClick={send} disabled={pending}>
            <Ic d='<path d="M3 12l18-8-8 18-2-7z"/>' />{pending ? "Sending…" : "Send invite"}
          </button>
          {status && (
            <span style={{ fontSize: 12.5, color: status.tone === "ok" ? "var(--ok-text)" : "var(--red-text)" }}>{status.text}</span>
          )}
        </div>
      </Panel>
    </>
  );
}

// ---- Workspaces (wired) ----
// Real memberships from listWorkspacesForUser (demo list offline). Switch
// repoints the active-workspace cookie and reloads so the whole app re-tailors;
// create goes through createWorkspace. Offline both resolve optimistically.
type WorkspaceItem = { id: string; initial: string; name: string; meta: string; active: boolean };
const toWorkspaceItem = (w: SettingsWorkspace): WorkspaceItem => ({ id: w.id, initial: (w.name || "W").charAt(0).toUpperCase(), name: w.name, meta: w.meta, active: w.active });

function WorkspacesSection({ view }: { view: SettingsWorkspacesView }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>(view.workspaces.map(toWorkspaceItem));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function switchTo(w: WorkspaceItem) {
    if (w.active) return;
    setBusy(w.id);
    setStatus(null);
    const res = await switchWorkspace({ workspaceId: w.id });
    setBusy(null);
    if (!res.ok) {
      setStatus({ tone: "err", text: res.error });
      return;
    }
    setWorkspaces((prev) => prev.map((x) => ({ ...x, active: x.id === w.id })));
    if (res.persisted) {
      // The active workspace drives the whole shell — reload so it re-tailors.
      setStatus({ tone: "ok", text: `Switched to ${w.name}. Reloading…` });
      window.location.assign("/settings?s=workspaces");
    } else {
      setStatus({ tone: "ok", text: "Switch is a preview here — connect your account to switch for real." });
    }
  }

  async function create(value: NewWorkspaceValue): Promise<{ ok: boolean; error?: string }> {
    const tempId = `local-${crypto.randomUUID()}`;
    setWorkspaces((prev) => [
      { id: tempId, initial: value.workspaceName.charAt(0).toUpperCase() || "W", name: value.workspaceName, meta: "Owner · New workspace", active: false },
      ...prev,
    ]);
    setStatus(null);

    const res = await createWorkspace(value);
    if (!res.ok) {
      setWorkspaces((prev) => prev.filter((w) => w.id !== tempId));
      setStatus({ tone: "err", text: res.error });
      return { ok: false, error: res.error };
    }
    setStatus({
      tone: "ok",
      text: res.persisted
        ? res.message ?? "Workspace created."
        : "Workspace added — connect your account (Supabase) to provision it for real.",
    });
    return { ok: true };
  }

  return (
    <>
      <Panel
        title={<>Your workspaces <span className="ph-d" style={{ marginLeft: 6 }}>{workspaces.length}</span></>}
        tag={TGOK}
        foot={view.isDemo ? "demo workspaces — your real memberships list here once connected" : "listWorkspacesForUser · Switch repoints the active-workspace cookie"}
      >
        {workspaces.length === 0 ? (
          <div className="me" style={{ padding: "6px 2px", color: "var(--muted)" }}>No workspaces yet.</div>
        ) : (
          workspaces.map((w) => (
            <div className="mem" key={w.id}>
              <span className="ma">{w.initial}</span>
              <div className="mi"><div className="mn">{w.name}</div><div className="me">{w.meta}</div></div>
              {w.active ? <Pill kind="ok">Active</Pill> : <button className="btn sm" disabled={busy === w.id} onClick={() => switchTo(w)}>{busy === w.id ? "Switching…" : "Switch"}</button>}
            </div>
          ))
        )}
      </Panel>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn" onClick={() => setOpen(true)}><Ic d='<path d="M12 5v14M5 12h14"/>' />New workspace</button>
        {status && (
          <span style={{ fontSize: 12.5, color: status.tone === "ok" ? "var(--ok-text)" : "var(--red-text)" }}>{status.text}</span>
        )}
      </div>
      <NewWorkspaceModal key={open ? "open" : "closed"} open={open} onClose={() => setOpen(false)} onSubmit={create} />
    </>
  );
}

// ---- General (wired) ----
// Workspace name renames the org + workspace identity (owner/admin gated);
// account type, industry, and support email persist to app_settings. Offline the
// action returns persisted:false and Status says so honestly.
function GeneralPanel({ brandName, settings, domain }: { brandName: string; settings: AppSettings; domain: string }) {
  const [name, setName] = useState(brandName);
  const [profile, setProfile] = useState<AppSettings["workspaceProfile"]>(settings.workspaceProfile);
  const [industry, setIndustry] = useState(settings.industry || "Restoration & home services");
  const [email, setEmail] = useState(settings.supportEmail || `support@${domain}`);
  const [status, setStatus] = useState<SaveStatus>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setStatus(null);
    const res = await saveGeneralSettings({ workspaceName: name.trim(), workspaceProfile: profile, industry, supportEmail: email.trim() });
    setPending(false);
    setStatus(toStatus(res, "Saved."));
  }

  return (
      <Panel title="Workspace" tag={TGOK} foot="Renames the workspace + saves profile, industry, and support email">
        <Row label="Workspace name" desc="Shown across the app and in Arc’s outbound from-name."><input className="inp" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Row>
        <Row label="Workspace logo" desc="Shown in the sidebar in place of the initials. Square PNG or SVG works best.">
          <ImageUploadField
            currentUrl={settings.brandLogoUrl?.startsWith("http") ? settings.brandLogoUrl : null}
            fallback={pinit(name || brandName)}
            uploadAction={saveWorkspaceLogoAction}
            removeAction={removeWorkspaceLogoAction}
          />
        </Row>
        <Row label="Account type" desc="How Arc frames personas, detectors, and templates."><Seg opts={["Individual", "Company", "Agency"]} value={PROFILE_LABEL[profile]} onChange={(v) => setProfile(v.toLowerCase() as AppSettings["workspaceProfile"])} /></Row>
        <Row label="Industry" desc="Stored on your workspace profile."><select className="sel" value={industry} onChange={(e) => setIndustry(e.target.value)}><option>Restoration &amp; home services</option><option>Roofing &amp; exteriors</option><option>General contracting</option></select></Row>
        <Row label="Support email" desc="Used as reply-to on transactional email."><input className="inp" value={email} onChange={(e) => setEmail(e.target.value)} /></Row>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0 4px" }}>
          <button className="btn gold" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
          <Status status={status} />
        </div>
      </Panel>
  );
}

// ---- Appearance (wired) ----
// Instant-save: each change stamps the same data-* attributes the root layout
// sets on load (so the whole app re-skins live) and persists to app_settings.
function AppearancePanel({ settings }: { settings: AppSettings }) {
  const [accent, setAccent] = useState<AppSettings["appearanceAccent"]>(settings.appearanceAccent);
  const [density, setDensity] = useState<AppSettings["appearanceDensity"]>(settings.appearanceDensity);
  const [motion, setMotion] = useState<AppSettings["appearanceMotion"]>(settings.appearanceMotion);
  const [status, setStatus] = useState<SaveStatus>(null);

  // Live re-skin: mirror the current selection onto the same <html> data-*
  // attributes the root layout stamps on load, so the whole app updates at once.
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.accent = accent;
    el.dataset.density = density;
    el.dataset.motion = motion;
  }, [accent, density, motion]);

  async function apply(next: Partial<Pick<AppSettings, "appearanceAccent" | "appearanceDensity" | "appearanceMotion">>) {
    const a = next.appearanceAccent ?? accent;
    const d = next.appearanceDensity ?? density;
    const m = next.appearanceMotion ?? motion;
    setAccent(a);
    setDensity(d);
    setMotion(m);
    setStatus(null);
    setStatus(toStatus(await saveAppearanceSettings({ accent: a, density: d, motion: m }), "Saved"));
  }

  return (
      <Panel title="Theme" tag={TGOK} foot={<>Applies across the app{status ? <> · <Status status={status} /></> : null}</>}>
        <Row label="Accent" desc="Used sparingly — buttons, focus, key numbers.">
          <div className="accsw">{ACCENTS.map(({ key, color }) => <span key={key} className={`accopt${accent === key ? " on" : ""}`} style={{ background: color }} title={key[0].toUpperCase() + key.slice(1)} onClick={() => apply({ appearanceAccent: key })} />)}</div>
        </Row>
        <Row label="Density" desc="Comfortable for review, compact for power use.">
          <Seg opts={["Comfortable", "Compact"]} value={DENSITY_LABEL[density]} onChange={(v) => apply({ appearanceDensity: v === "Compact" ? "compact" : "comfortable" })} />
        </Row>
        <Row label="Motion" desc="Reduce if you prefer fewer animations.">
          <Seg opts={["Standard", "Reduced"]} value={MOTION_LABEL[motion]} onChange={(v) => apply({ appearanceMotion: v === "Reduced" ? "reduced" : "standard" })} />
        </Row>
      </Panel>
  );
}

// ---- Agent identity (wired) ----
// assistantName drives getAgentName across the app + Arc’s replies.
function AgentIdentityPanel({ settings }: { settings: AppSettings }) {
  const [name, setName] = useState(settings.assistantName);
  const [saved, setSaved] = useState(settings.assistantName);
  const [status, setStatus] = useState<SaveStatus>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === saved) return;
    setPending(true);
    setStatus(null);
    const res = await saveRunnerDisplayName({ assistantName: trimmed });
    setPending(false);
    if (res.ok) setSaved(trimmed);
    setStatus(toStatus(res, "Saved."));
  }

  return (
    <Panel title="Agent identity" tag={TGOK} foot="Shown wherever Arc is named · getAgentName">
      <Row label="Display name" desc="What the agent is called across the app and in Arc’s replies.">
        <span className="pillrow">
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); }} style={{ minWidth: 160 }} maxLength={32} />
          <button className="btn sm gold" onClick={save} disabled={pending || !name.trim() || name.trim() === saved}>{pending ? "Saving…" : "Save"}</button>
          <Status status={status} />
        </span>
      </Row>
    </Panel>
  );
}

// ---- Media defaults (wired) ----
// The built-in Gemini/Veo default — the only media-model default that's actually
// consumed (settings.imageModel/videoModel → the generate-* routes). "" = Auto.
const IMAGE_MODEL_LABELS: Record<string, string> = {
  "": "Auto — Arc picks per task",
  "gemini-3-pro-image": "Gemini 3 Pro Image",
  "gemini-3.1-flash-image": "Gemini 3.1 Flash Image",
  "gemini-2.5-flash-image": "Gemini 2.5 Flash Image",
};
const VIDEO_MODEL_LABELS: Record<string, string> = {
  "": "Auto — Arc picks per task",
  "veo-3.1-generate-preview": "Veo 3.1",
  "veo-3.1-fast-generate-preview": "Veo 3.1 Fast",
};

function MediaDefaultsPanel({ settings }: { settings: AppSettings }) {
  const [imageModel, setImageModel] = useState(settings.imageModel);
  const [videoModel, setVideoModel] = useState(settings.videoModel);
  const [status, setStatus] = useState<SaveStatus>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setStatus(null);
    const res = await saveMediaDefaults({ imageModel, videoModel });
    setPending(false);
    setStatus(toStatus(res, "Saved."));
  }

  return (
    <Panel title="Built-in generation default" tag={TGOK} foot="image_model / video_model · read by /api/v1/arc/media/generate-*">
      <Row label="Default image model" desc="Used by the built-in Gemini path. Auto follows Arc’s per-task pick.">
        <select className="sel" value={imageModel} onChange={(e) => setImageModel(e.target.value)}>
          {["", ...IMAGE_MODELS].map((m) => <option key={m || "auto"} value={m}>{IMAGE_MODEL_LABELS[m] ?? m}</option>)}
        </select>
      </Row>
      <Row label="Default video model" desc="Used by the built-in Veo path.">
        <select className="sel" value={videoModel} onChange={(e) => setVideoModel(e.target.value)}>
          {["", ...VIDEO_MODELS].map((m) => <option key={m || "auto"} value={m}>{VIDEO_MODEL_LABELS[m] ?? m}</option>)}
        </select>
      </Row>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0 4px" }}>
        <button className="btn gold" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save defaults"}</button>
        <Status status={status} />
      </div>
    </Panel>
  );
}

// ---- Connector card (launcher) ----
// A summary card for each real connector; the whole card drills into the detail
// page where connect / test / enable / disconnect live.
function ConnectorCard({ view, onOpen }: { view: ConnectorView; onOpen: () => void }) {
  const meta = CONNECTOR_META[view.key] ?? { c: "#9aa0ac", l: view.label.slice(0, 2), credLabel: "API key", credHint: "" };
  const pill = CONNECTOR_STATUS_PILL[view.status];
  const cost = COST_TIER_BADGE[view.costTier];
  const kindLabel = CONNECTOR_KIND_LABEL[view.kind] ?? view.kind;
  const cta = view.credentialPresent || view.enabled ? "Manage" : view.credentialOptional ? "Set up" : "Connect";
  return (
    <div className="ccard ccard-btn" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="ct">
        <span className="clogo" style={{ background: `${meta.c}22`, border: `1px solid ${meta.c}55`, color: meta.c }}>{meta.l}</span>
        <div><div className="cnm">{view.label}</div><div className="ccat">{kindLabel} · {view.access === "read_only" ? "read-only" : "gated write"}</div></div>
      </div>
      <div className="cdsc">{view.description}</div>
      <div className="cfoot">
        <Pill kind={pill.kind}>{pill.label}</Pill>
        <span className="badge" title={cost.title}>{cost.label}</span>
        <span className="grow" />
        <span className="cb-open">{cta} →</span>
      </div>
    </div>
  );
}

// ---- Connector detail (drill-down) ----
// Full page for one connector: live status + health, the credential connect/test/
// disconnect controls, and the registry metadata. Test runs a real provider probe.
function ConnectorDetail({ view, configured, onBack }: { view: ConnectorView; configured: boolean; onBack: () => void }) {
  const meta = CONNECTOR_META[view.key] ?? { c: "#9aa0ac", l: view.label.slice(0, 2), credLabel: "API key", credHint: "" };
  const reg = findConnector(view.key);
  const pill = CONNECTOR_STATUS_PILL[view.status];
  const cost = COST_TIER_BADGE[view.costTier];
  // Up-front cost disclosure for metered connectors — shown before you connect /
  // enable (no surprise charges). Rate lives in src/domain/connector-metering.ts.
  const costDisclosure = view.costTier === "metered" ? describeConnectorCost(view.key) : null;
  const costDesc = costDisclosure
    ? `${cost.title} ${costDisclosure} — billed against your workspace spend cap (Settings → Usage).`
    : cost.title;
  const kindLabel = CONNECTOR_KIND_LABEL[view.kind] ?? view.kind;
  // No-credential connectors (public signal source, config-only channel) have no
  // Vault secret to store — they are set up by flipping the enable switch.
  const noCredential = view.credentialOptional && view.authKind === "none";
  // No-credential connectors that still expose a live connectivity probe (the NWS
  // weather source reports its active-alert count) get a Test connection button.
  const hasConnectivityTest = view.key === "weather-signals";
  const [credential, setCredential] = useState("");
  // Seed status from the OAuth round-trip marker (?hf=connected | <error-code>)
  // Higgsfield redirects back with — computed at init so no setState-in-effect.
  const [status, setStatus] = useState<SaveStatus>(() => {
    if (typeof window === "undefined" || view.key !== "higgsfield") return null;
    const hf = new URLSearchParams(window.location.search).get("hf");
    if (!hf) return null;
    return hf === "connected" ? { tone: "ok", text: "Higgsfield connected." } : { tone: "err", text: `Couldn’t connect Higgsfield (${hf.replace(/_/g, " ")}).` };
  });
  const [pending, setPending] = useState(false);

  // Strip the ?hf marker after mount so a refresh doesn't re-show it (no setState).
  useEffect(() => {
    if (view.key !== "higgsfield") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("hf")) return;
    params.delete("hf");
    window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  }, [view.key]);

  async function connect() {
    if (!credential.trim()) { setStatus({ tone: "err", text: "Paste a credential." }); return; }
    setPending(true); setStatus(null);
    const res = await connectConnector({ connectorKey: view.key, credential: credential.trim() });
    setPending(false);
    setStatus(toStatus(res, `${view.label} connected.`));
    if (res.ok) setCredential("");
  }
  async function run(fn: () => Promise<SettingsWriteResult>, ok: string) {
    setPending(true); setStatus(null);
    setStatus(toStatus(await fn(), ok));
    setPending(false);
  }

  return (
    <>
      <button className="btn sm" style={{ marginBottom: 14 }} onClick={onBack}>← All connections</button>
      <div className="condetail-hd">
        <span className="clogo" style={{ background: `${meta.c}22`, border: `1px solid ${meta.c}55`, color: meta.c, width: 46, height: 46 }}>{meta.l}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><h2 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 21, margin: 0 }}>{view.label}</h2><Pill kind={pill.kind}>{pill.label}</Pill><span className="badge" title={costDesc}>{cost.label}</span><span className="badge">{kindLabel}</span></div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>{view.description}</div>
        </div>
      </div>

      <Panel title="Health" tag={TGOK} foot="workspace_connectors · a real provider probe records last_test_ok / last_test_error">
        <Row label="Status" desc={view.lastTestedAt ? `Last tested ${relTime(view.lastTestedAt)}` : hasConnectivityTest ? "Test to fetch the current NWS/NOAA alert count for your service area." : noCredential ? "No credential to test — enable to use." : "Not tested yet."}>
          <span className="pillrow">
            <Pill kind={pill.kind}>{pill.label}</Pill>
            {(!noCredential || hasConnectivityTest) && <button className="btn sm" disabled={pending || (!hasConnectivityTest && !view.credentialPresent)} onClick={() => run(() => testConnector({ connectorKey: view.key }), `${view.label} connection is healthy.`)}>{pending ? "Testing…" : "Test connection"}</button>}
          </span>
        </Row>
        {view.lastTestOk === false && view.lastTestError ? (
          <Row label="Last error"><span style={{ fontSize: 12, color: "var(--red-text)" }}>{view.lastTestError}</span></Row>
        ) : null}
      </Panel>

      {noCredential ? (
        <Panel title="Availability" tag={TGOK} foot="workspace_connectors · enable to include this connector in Arc runs">
          {!configured && <div style={{ fontSize: 11.5, color: "var(--muted)", padding: "10px 0 4px", lineHeight: 1.5 }}>You’re previewing without a connected workspace — changes won’t persist here.</div>}
          <Row label={view.enabled ? "Enabled" : "Off"} desc="This connector needs no credential — switch it on to use it. Signal sources only propose; channels send only from the approved path.">
            <button className="btn sm gold" disabled={pending} onClick={() => run(() => toggleConnectorEnabled({ connectorKey: view.key, enabled: !view.enabled }), view.enabled ? "Paused." : "Enabled.")}>{view.enabled ? "Pause" : "Enable"}</button>
          </Row>
          {status && <div style={{ padding: "10px 0 2px" }}><Status status={status} /></div>}
        </Panel>
      ) : (
      <Panel title="Credential" tag={TGOK} foot="stored in your Vault (create_secret) · never rendered back, handed only to the runner">
        {view.credentialPresent ? (
          <>
            <Row label="Connected" desc="Rotate by pasting a new credential, or disconnect to remove it.">
              <span className="pillrow">
                <button className="btn sm" disabled={pending} onClick={() => run(() => toggleConnectorEnabled({ connectorKey: view.key, enabled: !view.enabled }), view.enabled ? "Paused." : "Enabled.")}>{view.enabled ? "Pause" : "Enable"}</button>
                <button className="btn sm danger" disabled={pending} onClick={() => run(() => disconnectConnector({ connectorKey: view.key }), `${view.label} disconnected.`)}>Disconnect</button>
              </span>
            </Row>
            <Row label="Rotate credential" desc={`Replace the stored ${meta.credLabel}.`}>
              <span className="pillrow">
                <input className="inp" type="password" placeholder={`New ${meta.credLabel}`} value={credential} onChange={(e) => setCredential(e.target.value)} />
                <button className="btn sm gold" disabled={pending || !credential.trim()} onClick={connect}>Save</button>
              </span>
            </Row>
          </>
        ) : view.key === "higgsfield" ? (
          <>
            {!configured && <div style={{ fontSize: 11.5, color: "var(--muted)", padding: "10px 0 4px", lineHeight: 1.5 }}>You’re previewing without a connected workspace — connecting won’t persist here.</div>}
            <Row label="Connect" desc="Sign in to your Higgsfield Ultra account. Arc gets its own credential scoped to this workspace and refreshes it automatically — no CLI, no token to copy.">
              <button className="btn gold" disabled={pending || !configured} onClick={() => { window.location.href = "/api/connectors/higgsfield/authorize"; }}>Connect with Higgsfield</button>
            </Row>
            <Row label="Paste a token" desc="Advanced — paste an OAuth bundle captured elsewhere instead of signing in here.">
              <span className="pillrow">
                <input className="inp" type="password" placeholder="Paste token bundle" value={credential} onChange={(e) => setCredential(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") connect(); }} />
                <button className="btn sm" disabled={pending || !credential.trim()} onClick={connect}>Save</button>
              </span>
            </Row>
          </>
        ) : (
          <>
            {!configured && <div style={{ fontSize: 11.5, color: "var(--muted)", padding: "10px 0 4px", lineHeight: 1.5 }}>You’re previewing without a connected workspace — connecting won’t persist here.</div>}
            <Row label={meta.credLabel} desc={meta.credHint}>
              <input className="inp" type="password" placeholder={`Paste your ${meta.credLabel}`} value={credential} onChange={(e) => setCredential(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") connect(); }} />
            </Row>
            <div style={{ padding: "13px 0 4px" }}><button className="btn gold" disabled={pending} onClick={connect}>{pending ? "Connecting…" : "Connect"}</button></div>
          </>
        )}
        {status && <div style={{ padding: "10px 0 2px" }}><Status status={status} /></div>}
      </Panel>
      )}

      <ConnectorConfigPanel view={view} configured={configured} />

      <Panel title="Details" tag={TGOK}>
        <Row label="Kind" desc="What this connector plugs in — a tool, a read-only signal source, or an outbound channel."><span className="ptxt">{kindLabel}</span></Row>
        <Row label="Cost" desc={costDesc}><span className="ptxt">{costDisclosure ? `${cost.label} · ${costDisclosure}` : cost.label}</span></Row>
        {reg?.verticals.length ? <Row label="Best for"><span className="ptxt">{reg.verticals.join(", ")}</span></Row> : null}
        <Row label="Authentication"><span className="ptxt">{view.authKind === "oauth" ? "Bearer token" : view.authKind === "api_key" ? "API key" : "None"}</span></Row>
        <Row label="Access" desc="Read-only connectors can’t write; gated-write output stays approval-locked."><span className="ptxt">{view.access === "read_only" ? "Read-only" : "Gated write"}</span></Row>
        {reg?.mcpUrl ? <Row label="MCP endpoint"><span className="ptxt" style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>{reg.mcpUrl}</span></Row> : <Row label="Integration"><span className="ptxt">{view.kind === "mcp_tool" ? "Native (in-app)" : "In-app"}</span></Row>}
        {reg && view.kind === "mcp_tool" ? <Row label="Tool namespace"><span className="ptxt" style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>{reg.toolNamespace}</span></Row> : null}
        {reg?.capability.opportunityKinds?.length ? <Row label="Emits"><span className="ptxt" style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>{reg.capability.opportunityKinds.join(", ")}</span></Row> : null}
        {reg?.capability.channelMedium ? <Row label="Medium"><span className="ptxt">{reg.capability.channelMedium}</span></Row> : null}
      </Panel>
    </>
  );
}

// ---- Connector config (no-secret, per-workspace) ----
// Renders a small config editor for connectors declared in CONFIG_FIELDS (a
// signal source's watched locations, a channel's endpoint). Saves to
// workspace_connectors.config. Nothing here is a secret.
function configToInput(config: Record<string, unknown>, field: { key: string; list?: boolean }): string {
  const v = config[field.key];
  if (field.list) return Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : "";
  return typeof v === "string" ? v : "";
}

function ConnectorConfigPanel({ view, configured }: { view: ConnectorView; configured: boolean }) {
  const field = CONFIG_FIELDS[view.key];
  const [value, setValue] = useState(() => (field ? configToInput(view.config, field) : ""));
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);
  if (!field) return null;

  async function save() {
    if (!field) return;
    setPending(true); setStatus(null);
    const config: Record<string, unknown> = field.list
      ? { [field.key]: value.split(",").map((s) => s.trim()).filter(Boolean) }
      : { [field.key]: value.trim() };
    const res = await saveConnectorConfig({ connectorKey: view.key, config });
    setPending(false);
    setStatus(toStatus(res, `${view.label} settings saved.`));
  }

  return (
    <Panel title="Configuration" tag={TGOK} foot="workspace_connectors.config · non-secret settings">
      {!configured && <div style={{ fontSize: 11.5, color: "var(--muted)", padding: "10px 0 4px", lineHeight: 1.5 }}>You’re previewing without a connected workspace — changes won’t persist here.</div>}
      <Row label={field.label} desc={field.hint}>
        <span className="pillrow">
          <input className="inp" placeholder={field.placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
          <button className="btn sm gold" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
        </span>
      </Row>
      {status && <div style={{ padding: "10px 0 2px" }}><Status status={status} /></div>}
    </Panel>
  );
}

// ---- Email delivery (Resend) — the outbound send gate ----
// The one connection the send path actually reads. `executeResendDispatch` refuses
// unless this row is enabled (gate 5) and has a from-address / RESEND_FROM (gate 6),
// on top of the always-enforced approval gate. Enabling here upserts the row that
// nothing else seeds, which is what makes a real send possible.
const EMAIL_PILL: Record<ConnectionView["status"], { kind: string; label: string }> = {
  connected: { kind: "ok", label: "Connected" },
  disabled: { kind: "warn", label: "Disabled" },
  not_configured: { kind: "warn", label: "Key missing" },
  error: { kind: "err", label: "Error" },
};

function EmailConnectionCard({ view }: { view: ConnectionView }) {
  const [from, setFrom] = useState(view.fromEmail ?? "");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);
  const pill = EMAIL_PILL[view.status];
  const keyPresent = view.status !== "not_configured";

  async function run(fn: () => Promise<SettingsWriteResult>, ok: string) {
    setPending(true); setStatus(null);
    setStatus(toStatus(await fn(), ok));
    setPending(false);
  }

  return (
    <Panel title="Email delivery (Resend)" tag={TGOK} foot="connections.resend · executeResendDispatch reads enabled + from as gate 5/6 of a real send — the linked approval must still be approved">
      <Row label="Status" desc={keyPresent ? (view.lastTestedAt ? `Last tested ${relTime(view.lastTestedAt)}` : "Not tested yet.") : "Set RESEND_API_KEY on the deploy, then test."}>
        <span className="pillrow">
          <Pill kind={pill.kind}>{pill.label}</Pill>
          <button className="btn sm" disabled={pending} onClick={() => run(() => testEmailConnection(), "Resend connection is healthy.")}>{pending ? "Testing…" : "Test connection"}</button>
        </span>
      </Row>
      {view.lastTestOk === false && view.lastTestError ? (
        <Row label="Last error"><span style={{ fontSize: 12, color: "var(--red-text)" }}>{view.lastTestError}</span></Row>
      ) : null}
      <Row label="Sending" desc="Turn on to let approved campaigns send via Resend. Off is a hard kill-switch — the send path refuses immediately.">
        <button className="btn sm" disabled={pending} onClick={() => run(() => setEmailConnectionEnabled({ enabled: !view.enabled, fromEmail: from.trim() || undefined }), view.enabled ? "Resend disabled." : "Resend enabled.")}>{view.enabled ? "Disable" : "Enable"}</button>
      </Row>
      <Row label="From address" desc="Must be on a domain you’ve verified in Resend. Left blank, the send falls back to RESEND_FROM.">
        <span className="pillrow">
          <input className="inp" type="text" placeholder="Arc <hello@yourdomain.com>" value={from} onChange={(e) => setFrom(e.target.value)} />
          <button className="btn sm gold" disabled={pending || from.trim() === (view.fromEmail ?? "")} onClick={() => run(() => setEmailConnectionEnabled({ enabled: view.enabled, fromEmail: from.trim() || undefined }), "From address saved.")}>Save</button>
        </span>
      </Row>
      {status && <div style={{ padding: "10px 0 2px" }}><Status status={status} /></div>}
    </Panel>
  );
}

// ---- Roles & permissions (real reference) ----
// Renders WORKSPACE_ROLES — the same catalog that powers the invite picker and
// the member-management guards, so this guide can't drift from what's enforced.
function RolesGuide() {
  return (
    <Panel title="Roles & permissions" tag={TGOK} foot="workspace-roles.ts — the catalog the invite picker and access guards share">
      <div className="roles">
        {WORKSPACE_ROLES.map((r) => (
          <div className="rolecard" key={r.role}>
            <div className="rolehd">
              <span className="rolename">{r.label}</span>
              <span className="badge">{r.role === "owner" ? "Granted at onboarding" : "Assignable"}</span>
            </div>
            <div className="roledesc">{r.summary}</div>
            <ul className="rolecaps">{r.capabilities.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---- Activity log (real audit events) ----
function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}
function actionAccent(action: string): string {
  if (action.startsWith("workspace")) return "var(--accent)";
  if (action.startsWith("connector")) return "#7fb89a";
  if (action.startsWith("member")) return "#88b6d8";
  return "var(--muted)";
}
function ActivityLog({ entries, isDemo }: { entries: WorkspaceActivityEntry[]; isDemo: boolean }) {
  if (!entries.length) {
    return (
      <Panel title="Recent activity" tag={TGOK}>
        <div style={{ padding: "8px 2px", fontSize: 12.5, color: "var(--muted)" }}>No activity yet — member and workspace changes will show up here.</div>
      </Panel>
    );
  }
  return (
    <Panel title="Recent activity" tag={TGOK} foot={isDemo ? "demo activity — your real audit trail streams in once the workspace is connected" : "audit_events · every member & workspace change, newest first"}>
      {entries.map((e) => (
        <div className="actrow" key={e.id}>
          <span className="actdot" style={{ background: actionAccent(e.action) }} />
          <div className="actbody">
            <div className="actsum">{e.summary ?? e.action}</div>
            <div className="actmeta">{e.actorEmail ?? "System"} · {relTime(e.createdAt)}</div>
          </div>
        </div>
      ))}
    </Panel>
  );
}

// ---- Usage breakdowns (real ai_usage_events; demo shape offline) ----
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const usageTag = (isDemo: boolean) => <span className="tg ok">{isDemo ? "demo" : "wired"}</span>;
function UsageEmpty({ label }: { label: string }) {
  return (
    <Panel title="Usage" tag={<span className="tg ok">wired</span>}>
      <div style={{ padding: "8px 2px", fontSize: 12.5, color: "var(--muted)" }}>{label}</div>
    </Panel>
  );
}

function UsageByDay({ usage }: { usage: SettingsUsageView }) {
  const days = usage.daily;
  if (!days.length) return <UsageEmpty label="No daily usage yet — spend will chart here as Arc works." />;
  const max = Math.max(...days.map((d) => d.costCents), 1);
  const total = days.reduce((s, d) => s + d.costCents, 0);
  const peak = days.reduce((a, b) => (b.costCents > a.costCents ? b : a), days[0]);
  return (
    <Panel title="Cost by day" tag={usageTag(usage.isDemo)} foot="ai_usage_events · estimated cost per day, last 30 days">
      <div style={{ padding: "6px 0 2px" }}>
        <div className="daychart">
          {days.map((d) => <div key={d.date} className="daybar" style={{ height: `${Math.max(3, (d.costCents / max) * 100)}%` }} title={`${d.date} · ${usd(d.costCents)}`} />)}
        </div>
        <div className="dayaxis"><span>{days[0].date.slice(5)}</span><span>{days[days.length - 1].date.slice(5)}</span></div>
        <div className="daystat"><span><b>{usd(total)}</b> total</span><span>Peak {usd(peak.costCents)} · {peak.date.slice(5)}</span></div>
      </div>
    </Panel>
  );
}

function UsageByModel({ usage }: { usage: SettingsUsageView }) {
  const rows = usage.byModel;
  if (!rows.length) return <UsageEmpty label="No model usage yet." />;
  const max = Math.max(...rows.map((r) => r.costCents), 1);
  return (
    <Panel title="By model" tag={usageTag(usage.isDemo)} foot="ai_usage_events grouped by model · highest spend first">
      {[...rows].sort((a, b) => b.costCents - a.costCents).map((r) => (
        <div className="usagerow" key={r.model}>
          <div className="ug-name" title={r.model}>{r.model}</div>
          <div className="ug-bar"><i style={{ width: `${Math.max(4, (r.costCents / max) * 100)}%` }} /></div>
          <div className="ug-meta">{r.count.toLocaleString()} runs</div>
          <div className="ug-cost">{usd(r.costCents)}</div>
        </div>
      ))}
    </Panel>
  );
}

function UsageRecent({ usage }: { usage: SettingsUsageView }) {
  const rows = usage.recent;
  if (!rows.length) return <UsageEmpty label="No recent runs yet." />;
  return (
    <Panel title="Recent runs" tag={usageTag(usage.isDemo)} foot="ai_usage_events · newest first">
      {rows.map((r, i) => (
        <div className="usagerow rec" key={`${r.occurredAt}-${i}`}>
          <div className="ug-time">{relTime(r.occurredAt)}</div>
          <div className="ug-model">
            <div className="ug-name" title={r.model}>{r.model}</div>
            <div className="ug-sub">{r.service}{r.tokens ? ` · ${r.tokens.toLocaleString()} tok` : ""} · {r.actor}</div>
          </div>
          <div className="ug-cost">{usd(r.costCents)}</div>
        </div>
      ))}
    </Panel>
  );
}

// ---- Metered-connector spend (BSR-372): per-connector spend, remaining budget,
//      and the spend-cap editor. Raising the cap is the operator's explicit
//      approval of more metered spend. free / byo_key connectors never appear here.
// Keyed on the server cap (see call site) so a saved/revalidated cap re-seeds the
// input via remount — no setState-in-effect (cascading-render lint rule).
function ConnectorSpendPanel({ spend }: { spend: ConnectorSpendView | null }) {
  const [cap, setCap] = useState(String(spend?.capDollars ?? 50));
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);

  if (!spend) return <UsageEmpty label="Connector spend appears here once a metered connector is enabled." />;
  const rows = spend.rows;
  const maxCost = Math.max(...rows.map((r) => r.costCents), 1);
  const barTone = spend.isOverCap ? "var(--red-text)" : spend.isNearCap ? "var(--warn)" : undefined;

  async function save() {
    setPending(true);
    setStatus(null);
    const res = await setConnectorSpendCap({ capDollars: Number(cap) });
    setPending(false);
    setStatus(toStatus(res, `Spend cap set to $${Number(cap || 0).toFixed(0)}.`));
  }

  return (
    <>
      <Panel title="Metered connector spend" tag={usageTag(spend.isDemo)} foot="connector_usage_events + connector_spend_budgets · this workspace · this month">
        <div style={{ padding: 4 }}>
          <div className="ukpis">
            {[[spend.spentLabel, "Spent"], [spend.remainingLabel, "Remaining"], [spend.capLabel, "Spend cap"]].map(([v, l]) => (
              <div className="ukpi" key={l}><div className="uv">{v}</div><div className="ul">{l}</div></div>
            ))}
          </div>
          <div className="ubar"><i style={{ width: `${Math.min(spend.pctOfCap, 100)}%`, ...(barTone ? { background: barTone } : {}) }} /></div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 7 }}>
            {spend.pctOfCap}% of your {spend.capLabel} cap · {spend.periodLabel}
            {spend.isOverCap ? " · cap reached — metered runs are refused until you raise it" : spend.isNearCap ? " · nearing your cap" : ""}
          </div>
        </div>
      </Panel>

      <Panel title="Spend cap" tag={TGOK} foot="connector_spend_budgets · raising the cap approves more metered spend — a run over the cap is refused, never silently overspent">
        {!spend.configured && <div style={{ fontSize: 11.5, color: "var(--muted)", padding: "10px 0 4px", lineHeight: 1.5 }}>You’re previewing without a connected workspace — changes won’t persist here.</div>}
        <Row label="Monthly cap" desc="Metered data connectors (enrichment, permit / property data) may spend up to this per month. A run that would exceed it is refused; raising the cap is your approval of the extra spend.">
          <span className="pillrow" style={{ alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>$</span>
            <input className="inp" style={{ minWidth: 0, width: 96 }} type="number" min={0} step={5} value={cap} onChange={(e) => setCap(e.target.value)} />
            <button className="btn sm gold" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save cap"}</button>
          </span>
        </Row>
        {status && <div style={{ padding: "8px 0 2px" }}><Status status={status} /></div>}
      </Panel>

      <Panel title="By connector" tag={usageTag(spend.isDemo)} foot="metered connectors only · free / your-key connectors never bill">
        {rows.map((r) => (
          <div className="usagerow" key={r.key}>
            <div style={{ flex: "0 0 180px", minWidth: 0 }}>
              <div className="ug-name" title={r.key}>{r.label}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.disclosure ?? "metered"}
              </div>
            </div>
            <div className="ug-bar"><i style={{ width: `${Math.max(4, (r.costCents / maxCost) * 100)}%` }} /></div>
            <div className="ug-meta">{r.count ? `${r.count} run${r.count === 1 ? "" : "s"} · ${r.units.toLocaleString()} lookups` : "no spend yet"}</div>
            <div className="ug-cost">{r.costLabel}</div>
          </div>
        ))}
      </Panel>
    </>
  );
}

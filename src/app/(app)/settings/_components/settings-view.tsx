"use client";

import { useState, type ReactNode } from "react";

import type { SettingsTeamInvite, SettingsTeamMember, SettingsTeamView } from "@/lib/auth/team-view";
import type { SettingsUsageView } from "@/lib/ai-usage/settings-summary";

import { cancelInvite, changeMemberRole, createInvite, createWorkspace, removeMember } from "../actions";
import { NewWorkspaceModal, type NewWorkspaceValue } from "./new-workspace-modal";

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
  { g: "ARC", items: [["connections", "Connections"], ["agent", "Runner & tokens"], ["media", "Media models"], ["behavior", "Behavior"]] },
  { g: "ACCOUNT", items: [["account", "Account & security"], ["usage", "Usage & billing"], ["notifications", "Notifications"], ["system", "System status"]] },
] as const;
const DOTS: Record<string, string> = { connections: "var(--ok)", agent: "var(--ok)", system: "var(--ok)", notifications: "var(--warn)" };

// ---- reusable controls ----
function Sw({ on: init, locked }: { on?: boolean; locked?: boolean }) {
  const [on, setOn] = useState(!!init);
  return <span className={`sw${on ? " on" : ""}${locked ? " locked" : ""}`} onClick={() => !locked && setOn((v) => !v)}><i /></span>;
}
function Seg({ opts, active }: { opts: string[]; active: string }) {
  const [v, setV] = useState(active);
  return <div className="seg">{opts.map((o) => <button key={o} className={o === v ? "on" : ""} onClick={() => setV(o)}>{o}</button>)}</div>;
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
const CATS = ["All", "Connected", "Social", "Email & SMS", "CRM & Sales", "Analytics", "Creative", "Productivity"];

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
};

export function SettingsView({ brandName, email, team, usage }: { brandName: string; email: string; team: SettingsTeamView; usage: SettingsUsageView | null }) {
  const [cur, setCur] = useState("overview");
  const memberCount = team.members.length;
  const pendingCount = team.invites.length;
  const usageView = usage ?? EMPTY_USAGE;
  const [navQ, setNavQ] = useState("");
  const [connCat, setConnCat] = useState("All");
  const [connQ, setConnQ] = useState("");
  const [mediaCat, setMediaCat] = useState<"image" | "video" | "audio">("image");
  const [mediaDef, setMediaDef] = useState<Record<string, string>>({ image: "auto", video: "auto", audio: "auto" });
  const [accent, setAccent] = useState(0);
  const domain = "bigshouldersrestoration.com";

  const sections: Record<string, ReactNode> = {
    overview: (
      <>
        <Head t="Overview" d="Your workspace at a glance — health, what needs you, and quick links." />
        <div className="ovgrid">
          {[["connections", "3", "Connections active"], ["team", String(memberCount), "Team members"], ["agent", "OK", "Runner connected"], ["usage", `${usageView.pctOfCap}%`, "Of monthly cap"]].map(([ic, v, l]) => (
            <div className="ovcard" key={l} onClick={() => setCur(ic)}><div className="ovi"><Ic d={ICON[ic]} /></div><div className="ovv">{v}</div><div className="ovl">{l}</div></div>
          ))}
        </div>
        <Panel title="Needs attention" tag={TGOK}>
          {[["warn", "2 sign-in methods unconfigured", "— add a passkey or Google for recovery.", "account"], ["warn", "Notifications aren’t wired yet", "— event delivery is still scaffold.", "notifications"], ["ok", "Outbound is locked", "— Arc can’t send, post, or spend without you.", "behavior"]].map(([k, t, d, sec]) => (
            <div className="attn" key={t} onClick={() => setCur(sec)}><span className={`ai ${k}`}><Ic d={k === "ok" ? CHECK : '<path d="M12 9v4M12 17h.01M10.3 4l-7 12a2 2 0 001.7 3h14a2 2 0 001.7-3l-7-12a2 2 0 00-3.4 0z"/>'} /></span><div className="at"><b>{t}</b> {d}</div><span className="ago">→</span></div>
          ))}
        </Panel>
        <Panel title="Workspace" tag={TGOK}>
          <Row label="Plan"><span className="pillrow"><Pill kind="ok">Premium</Pill><button className="btn sm">Manage plan</button></span></Row>
          <Row label="Business type"><span className="pillrow"><span className="ptxt">Company · Restoration &amp; home services</span><button className="btn sm" onClick={() => setCur("general")}>Change</button></span></Row>
          <Row label="Team"><span className="pillrow"><span className="ptxt">{memberCount} {memberCount === 1 ? "member" : "members"}{pendingCount > 0 ? ` · ${pendingCount} pending` : ""}</span><button className="btn sm" onClick={() => setCur("team")}>Manage</button></span></Row>
        </Panel>
      </>
    ),
    general: (
      <>
        <Head t="General" d="Your workspace identity. Saved instantly." />
        <Panel title="Workspace" tag={TGOK} foot="Instant-save · changes apply immediately">
          <Row label="Workspace name" desc="Shown across the app and in Arc’s outbound from-name."><input className="inp" defaultValue={brandName} /></Row>
          <Row label="Account type" desc="Changes which signal detectors and templates Arc runs."><Seg opts={["Individual", "Company", "Agency"]} active="Company" /></Row>
          <Row label="Industry" desc="Configures personas + opportunity templates."><select className="sel" defaultValue="Restoration & home services"><option>Restoration &amp; home services</option><option>Roofing &amp; exteriors</option><option>General contracting</option></select></Row>
          <Row label="Support email" desc="Used as reply-to on transactional email."><input className="inp" defaultValue={`support@${domain}`} /></Row>
        </Panel>
      </>
    ),
    appearance: (
      <>
        <Head t="Appearance" d="How the console looks. Accent + density + motion persist per workspace." />
        <Panel title="Theme" tag={TGOK} foot="Saved per workspace">
          <Row label="Accent" desc="Used sparingly — buttons, focus, key numbers."><div className="accsw">{["#c8a24a", "#7fb89a", "#88b6d8", "#c47055", "#9678c8"].map((c, i) => <span key={c} className={`accopt${accent === i ? " on" : ""}`} style={{ background: c }} onClick={() => setAccent(i)} />)}</div></Row>
          <Row label="Density" desc="Comfortable for review, compact for power use."><Seg opts={["Comfortable", "Compact"]} active="Comfortable" /></Row>
          <Row label="Motion" desc="Reduce if you prefer fewer animations."><Seg opts={["Standard", "Reduced"]} active="Standard" /></Row>
        </Panel>
      </>
    ),
    team: (
      <>
        <Head t="Team" d="Members, roles, and invites. Invites send a branded email via Resend." />
        <TeamMembers team={team} />
        <TeamInvites workspaceId={team.workspaceId} seedInvites={team.invites} />
      </>
    ),
    workspaces: (
      <>
        <Head t="Workspaces" d="Each workspace is its own brand, CRM, and Arc. Switching re-tailors the whole app." />
        <WorkspacesSection brandName={brandName} />
      </>
    ),
    connections: (
      <>
        <Head t="Connections" d="Everything Arc can reach — research, creative, social, email, CRM, analytics. Each connects through a per-workspace credential stored in your Vault. Posting & sending always stay human-approved." />
        <div className="cnote"><Ic d='<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>' /><div><b>3 connected.</b> Arc connects through its MCP connector framework — per-workspace Vault credentials, never code. More integrations are rolling out; connect any below to start. <b>Social posting & email sending never happen without your approval.</b></div></div>
        <div className="connhub-search"><Ic d='<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>' /><input value={connQ} onChange={(e) => setConnQ(e.target.value)} placeholder="Search 30+ integrations…" /></div>
        <div className="catchips">{CATS.map((c) => <span key={c} className={`catchip${connCat === c ? " on" : ""}`} onClick={() => setConnCat(c)}>{c}</span>)}</div>
        <div className="conngrid">
          {[...CONNECTORS].sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0)).filter((x) => {
            const okCat = connCat === "All" || (connCat === "Connected" ? !!x.live : x.cat === connCat);
            const okQ = !connQ || x.n.toLowerCase().includes(connQ.toLowerCase());
            return okCat && okQ;
          }).map((x) => (
            <div className="ccard" key={x.n}>
              <div className="ct"><span className="clogo" style={{ background: `${x.c}22`, border: `1px solid ${x.c}55`, color: x.c }}>{x.l}</span><div><div className="cnm">{x.n}</div><div className="ccat">{x.cat}{x.note ? ` · ${x.note}` : ""}</div></div></div>
              <div className="cdsc">{x.d || DCAT[x.cat] || ""}</div>
              <div className="cfoot">{x.live ? <><Pill kind="ok">Connected</Pill><span className="grow" /><button className="cb-mng">Manage</button></> : <><span className="badge">{x.auth || "oauth"}</span><span className="grow" /><button className="cb-add">Connect</button></>}</div>
            </div>
          ))}
        </div>
      </>
    ),
    agent: (
      <>
        <Head t="Runner & tokens" d="How the headless Arc runner connects back to this workspace, and the API tokens it authenticates with." />
        <Panel title="Runner connection" tag={TGOK} foot="Live heartbeat + webhook connection to the runner">
          <Row label="Status" desc="Last heartbeat from the Cloud Run runner."><span className="pillrow"><Pill kind="ok">Connected · 2m ago</Pill><button className="btn sm">Test</button></span></Row>
          <Row label="Display name"><input className="inp" defaultValue="Arc" style={{ minWidth: 160 }} /></Row>
          <Row label="Webhook URL" desc="Where the app notifies the runner of new tasks."><input className="inp" defaultValue="https://arc-runner-…run.app/hook" /></Row>
          <Row label="Enabled" desc="Pause to stop dispatching tasks to the runner."><Sw on /></Row>
        </Panel>
        <Panel title="API tokens" tag={TGOK} foot="Bearer tokens the runner authenticates with — shown once at creation">
          {[["production", "arc_live_8f2a…1c · last used 2m ago"], ["ci-pipeline", "arc_live_3b71…9d · last used 6d ago"]].map((t) => (
            <div className="tok" key={t[0]}><div className="tki"><div className="tkn">{t[0]}</div><div className="tkp">{t[1]}</div></div><Pill kind="ok">Active</Pill><button className="btn sm danger">Revoke</button></div>
          ))}
          <div style={{ padding: "13px 0 4px", display: "flex", gap: 9 }}><button className="btn"><Ic d='<path d="M12 5v14M5 12h14"/>' />Issue token</button><button className="btn gold"><Ic d='<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V5"/>' />Generate setup bundle</button></div>
        </Panel>
      </>
    ),
    media: (
      <>
        <Head t="Media models" d="The roster Arc generates with — 44 image, video & audio models from the live Higgsfield catalog. Arc auto-picks the best model per task; override the default per category. Every generation is a provenance-tagged, approval-gated draft." />
        <Panel title="Generation defaults" tag={TGOK} foot="Higgsfield model roster + per-category defaults">
          <Row label="Auto-pick best model" desc="Let Arc choose the right model per task (recommended)."><Sw on /></Row>
          <Row label="Default aspect" desc="Per-platform overrides still apply."><Seg opts={["1:1", "4:5", "9:16", "16:9"]} active="4:5" /></Row>
          <Row label="Prefer real brand media" desc="AI enhances your approved photos & footage rather than replacing them."><Sw on /></Row>
          <Row label="Allow video generation"><Sw on /></Row>
        </Panel>
        <div className="panel">
          <div className="panel-h"><h3>Model roster</h3><span className="ph-d" style={{ marginLeft: 6 }}>44 models</span><span className="tg ok" style={{ marginLeft: "auto" }}>wired</span></div>
          <div className="panel-b" style={{ paddingBottom: 14 }}>
            <div className="msub">{(["image", "video", "audio"] as const).map((c) => <button key={c} className={mediaCat === c ? "on" : ""} onClick={() => setMediaCat(c)}>{c.charAt(0).toUpperCase() + c.slice(1)} <span className="mct">{MEDIA_MODELS[c].length}</span></button>)}</div>
            <div className="modellist">
              {MEDIA_MODELS[mediaCat].map((m) => {
                const [id, label, prov, rec] = m; const col = PCOL[prov] || "#9aa0ac";
                const isDef = mediaDef[mediaCat] === "auto" ? !!rec : mediaDef[mediaCat] === id;
                return (
                  <div className="mrow" key={id}>
                    <span className="mlogo" style={{ background: `${col}22`, border: `1px solid ${col}55`, color: col }}>{pinit(prov)}</span>
                    <div className="mi"><div className="mn">{label}{rec ? <span className="mbadge">Arc’s pick</span> : null}</div><div className="mp">{prov}</div></div>
                    {isDef ? <button className="btn sm gold" onClick={() => setMediaDef((d) => ({ ...d, [mediaCat]: id }))}><Ic d={CHECK} />Default</button> : <button className="btn sm" onClick={() => setMediaDef((d) => ({ ...d, [mediaCat]: id }))}>Set default</button>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel-f"><Ic d={CHECK} />Validated against the live Higgsfield catalog (2026-06-24). “Arc’s pick” is the recommended default per category.</div>
        </div>
      </>
    ),
    behavior: (
      <>
        <Head t="Behavior" d="What Arc may do on its own — and where the human gate stays. The outbound gate is not configurable." />
        <Panel title="Autonomy" tag={TGOK} foot="Outbound gate enforced — every send stays human-approved">
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
        <Head t="Account & security" d="Your operator identity and how you sign in." />
        <Panel title="Operator" tag={TGOK}>
          <Row label="Signed in as"><span className="pillrow"><span style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", fontFamily: "var(--serif)", fontWeight: 600, color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}>{(brandName || "E").charAt(0)}</span><span><span style={{ fontSize: "12.5px", fontWeight: 600, display: "block" }}>Riley Chen</span><span style={{ fontSize: 11, color: "var(--muted)" }}>{email}</span></span></span><button className="btn sm">Edit</button></span></Row>
          <Row label="Access gate" desc="OPERATOR_ACCESS_TOKEN protects the console."><span className="pillrow"><Pill kind="ok">Protected</Pill><button className="btn sm">Configure</button></span></Row>
        </Panel>
        <Panel title="Sign-in methods" tag={TGOK} foot="How you sign in to the console">
          <Row label="Password" desc="Email + password operator sign-in."><span className="pillrow"><Pill kind="ok">Configured</Pill><button className="btn sm">Change</button></span></Row>
          <Row label="Passkey" desc="Hardware / biometric sign-in."><span className="pillrow"><Pill kind="off">Not configured</Pill><button className="btn sm gold">Set up</button></span></Row>
          <Row label="Google" desc="SSO via Google."><span className="pillrow"><Pill kind="warn">Available</Pill><button className="btn sm">Connect</button></span></Row>
          <div style={{ padding: "13px 0 4px", display: "flex", gap: 9 }}><button className="btn">Reset access token</button><button className="btn danger">Sign out</button></div>
        </Panel>
      </>
    ),
    usage: (
      <>
        <Head t="Usage & billing" d="What Arc has consumed this period. Full breakdown lives in the Usage report." />
        <div className="panel">
          <div className="panel-h"><h3>This month</h3><span className="tg ok" style={{ marginLeft: "auto" }}>wired</span></div>
          <div className="panel-b" style={{ padding: 16 }}>
            <div className="ukpis">{[[usageView.tokensLabel, "Tokens"], [usageView.runsLabel, "Agent runs"], [usageView.costLabel, "Est. cost"]].map(([v, l]) => <div className="ukpi" key={l}><div className="uv">{v}</div><div className="ul">{l}</div></div>)}</div>
            <div className="ubar"><i style={{ width: `${Math.min(usageView.pctOfCap, 100)}%`, ...(usageView.isNearCap ? { background: "var(--warn)" } : {}) }} /></div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 7 }}>{usageView.pctOfCap}% of your {usageView.capLabel} soft cap · {usageView.rangeLabel}</div>
          </div>
          <div className="panel-f"><Ic d={CHECK} />Rolled up from this workspace’s AI usage · full breakdown on the Usage report</div>
        </div>
        <div style={{ display: "flex", gap: 9 }}><button className="btn gold"><Ic d='<path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6"/>' />Open full usage report</button><button className="btn">Manage plan</button></div>
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
        <Head t="System status" d="Live configuration health for this deployment." />
        <Panel title="Services" tag={TGOK} foot="Live configuration health, checked at load">
          {[["Supabase", "Configured", "Manage"], ["Resend (email)", "Configured", "Manage"], ["Gemini API key", "Present", "Rotate"], ["Arc runner", "Connected · 2m ago", "Test"], ["Higgsfield connector", "Enabled", "Manage"]].map((r) => (
            <Row key={r[0]} label={r[0]}><span className="pillrow"><Pill kind="ok">{r[1]}</Pill><button className="btn sm">{r[2]}</button></span></Row>
          ))}
          <Row label="Demo data" desc="Seed example data for screenshots."><Sw /></Row>
        </Panel>
        <div><button className="btn"><Ic d='<path d="M4 4v6h6M20 20v-6h-6"/><path d="M20 10a8 8 0 00-14-3M4 14a8 8 0 0014 3"/>' />Re-run checks</button></div>
      </>
    ),
  };

  return (
    <div className="arc-settings">
      <nav className="setnav">
        <div className="setsearch"><Ic d='<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>' /><input value={navQ} onChange={(e) => setNavQ(e.target.value)} placeholder="Search settings…" /></div>
        {NAVGROUPS.map((grp) => {
          const items = grp.items.filter((it) => !navQ || it[1].toLowerCase().includes(navQ.toLowerCase()));
          if (!items.length) return null;
          return (
            <div key={grp.g}>
              <div className="setgrp">{grp.g}</div>
              {items.map((it) => (
                <div key={it[0]} className={`setitem${it[0] === cur ? " on" : ""}`} onClick={() => setCur(it[0])}>
                  <Ic d={ICON[it[0]]} /><span>{it[1]}</span>{DOTS[it[0]] && <span className="sd" style={{ background: DOTS[it[0]] }} />}
                </div>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="setmain"><div className="setmain-in">{sections[cur]}</div></div>
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
      <Panel title="Invite a teammate" tag={TGOK} foot="Sends a single-use invite code by branded email">
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
type WorkspaceItem = { id: string; initial: string; name: string; meta: string; active: boolean };

function WorkspacesSection({ brandName }: { brandName: string }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([
    { id: "b", initial: (brandName || "B").charAt(0).toUpperCase(), name: brandName, meta: "Owner · Restoration & home services", active: true },
    { id: "s", initial: "S", name: "Summit Restoration", meta: "Admin · Home services", active: false },
    { id: "p", initial: "P", name: "Personal", meta: "Owner · Sandbox", active: false },
  ]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

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
      <Panel title="Your workspaces" tag={TGOK}>
        {workspaces.map((w) => (
          <div className="mem" key={w.id}>
            <span className="ma">{w.initial}</span>
            <div className="mi"><div className="mn">{w.name}</div><div className="me">{w.meta}</div></div>
            {w.active ? <Pill kind="ok">Active</Pill> : <button className="btn sm">Switch</button>}
          </div>
        ))}
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

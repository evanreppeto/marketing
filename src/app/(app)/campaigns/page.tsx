import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getCampaignWorkspaceList, type CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { CampaignsBoard, type CampaignRow, type CampaignTone } from "./_components/campaigns-board";

export const metadata = { title: "Campaigns — Arc" };

const NEW_CAMPAIGN_HREF = "/campaigns/new";

function humanizePersona(persona: string): string {
  const s = (persona || "").replace(/^persona[\s_-]+/i, "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const min = Math.round((Date.now() - then) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function toneFor(status: string): CampaignTone {
  const s = (status || "").toLowerCase();
  if (/archiv/.test(s)) return "archived";
  if (/revis|blocked/.test(s)) return "revise";
  if (/review|pending|await|submitted/.test(s)) return "review";
  if (/live|active|send|running/.test(s)) return "live";
  if (/approv|scheduled|ready/.test(s)) return "approved";
  return "draft";
}

const TONE_LABEL: Record<CampaignTone, string> = {
  live: "Live",
  review: "In review",
  revise: "Needs revision",
  approved: "Approved",
  draft: "Draft",
  archived: "Archived",
};

function nextActionFor(tone: CampaignTone, pendingCount: number): { next: string; nextTone: "" | "go" | "warn" } {
  if (pendingCount > 0) {
    return { next: `Approve ${pendingCount} piece${pendingCount === 1 ? "" : "s"}`, nextTone: "go" };
  }
  switch (tone) {
    case "live":
      return { next: "Sending", nextTone: "" };
    case "approved":
      return { next: "Scheduled to send", nextTone: "go" };
    case "review":
      return { next: "In review", nextTone: "go" };
    case "revise":
      return { next: "Revision requested", nextTone: "warn" };
    case "archived":
      return { next: "Paused", nextTone: "" };
    default:
      return { next: "Draft in progress", nextTone: "" };
  }
}

function personaDot(persona: string): string {
  const p = (persona || "").toLowerCase();
  if (/storm|hail|weather|damage/.test(p)) return "#7fb89a";
  if (/property|manager|realtor|hoa|commercial/.test(p)) return "#c8a24a";
  if (/insurance|adjuster/.test(p)) return "#88b6d8";
  if (/past|repeat|existing|customer|reactivation/.test(p)) return "#9678c8";
  return "#c8a24a";
}

function formatAbs(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toRow(item: CampaignWorkspaceListItem): CampaignRow {
  const tone = toneFor(item.status);
  const { next, nextTone } = nextActionFor(tone, item.pendingCount);
  // Prefer the short persona label for the Audience chip; the fuller
  // audienceSummary sentence is too long for a chip.
  const audience = humanizePersona(item.persona) || item.audienceSummary?.trim() || "";
  return {
    id: item.id,
    name: item.name,
    brief: item.objective?.trim() || item.whyBuilt?.trim() || "Campaign package",
    tone,
    statusLabel: TONE_LABEL[tone],
    next,
    nextTone,
    audience,
    dot: personaDot(item.persona || audience),
    channels: item.channels.join(" · "),
    updatedRel: relativeTime(item.updatedAtIso) || item.updatedAt,
    updatedAbs: formatAbs(item.updatedAtIso),
    href: item.href,
  };
}

export default async function CampaignsPage() {
  const ctx = await getCurrentWorkspaceContext();
  const list = await getCampaignWorkspaceList(undefined, "Arc", ctx.orgId).catch(
    () => ({ status: "unavailable" } as const),
  );
  const rows = list.status === "live" ? list.campaigns.map(toRow) : [];

  const pendingTotal = rows.reduce((sum, r) => sum + (r.nextTone === "go" && /Approve/.test(r.next) ? 1 : 0), 0);
  const arcNote =
    pendingTotal > 0
      ? `Arc has ${pendingTotal} package${pendingTotal === 1 ? "" : "s"} awaiting your approval`
      : "Arc drafts approval-gated packages here as opportunities come in";

  return <CampaignsBoard rows={rows} newCampaignHref={NEW_CAMPAIGN_HREF} arcNote={arcNote} />;
}

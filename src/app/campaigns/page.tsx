import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { DataTable } from "../_components/data-table";
import { EmptyState, StatusPill, buttonClasses } from "../_components/page-header";
import { MetricStrip, WorkspaceHeader, WorkspacePanel } from "../_components/workspace";
import { getCampaignWorkspaceList, type CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

export default async function CampaignsPage() {
  await connection();

  const workspace = await getCampaignWorkspaceList();
  const isLive = workspace.status === "live";
  const campaigns = isLive ? workspace.campaigns : [];
  const totals = isLive ? workspace.totals : { campaigns: 0, assets: 0, approvals: 0, media: 0 };
  const selected = campaigns[0] ?? null;

  return (
    <AppShell active="/campaigns">
      <WorkspaceHeader
        eyebrow="Campaign library"
        title="Every campaign Mark creates lives here."
        description="Open a campaign workspace to inspect the brief, physical pieces, virtual assets, ads, image and video previews, source evidence, approvals, and Mark activity."
        status={isLive ? `${totals.campaigns} campaigns` : "Supabase unavailable"}
        statusTone={isLive ? "green" : "amber"}
        primary={{ label: selected ? "Open latest campaign" : "Queue Mark", href: selected?.href ?? "/agent-operations" }}
        secondary={{ label: "Approval queue", href: "/approvals" }}
      />

      {!isLive ? (
        <div className="module-rise mb-5 rounded-lg border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Campaign workspace unavailable: </span>
          {workspace.message}
        </div>
      ) : null}

      <MetricStrip
        metrics={[
          { label: "Campaigns", value: totals.campaigns, detail: "Drafted or active workspaces", tone: totals.campaigns > 0 ? "blue" : "gray" },
          { label: "Assets", value: totals.assets, detail: "Emails, SMS, ads, print, media", tone: totals.assets > 0 ? "blue" : "gray" },
          { label: "Approvals", value: totals.approvals, detail: "Human gate records", tone: totals.approvals > 0 ? "amber" : "green", href: "/approvals" },
          { label: "Media", value: totals.media, detail: "Images, videos, files, links", tone: totals.media > 0 ? "blue" : "gray" },
        ]}
      />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <WorkspacePanel
          className="p-0"
          eyebrow="Workspaces"
          title="Campaigns"
          description="This is the app-side place for Mark's creations. Use it before going into approval detail."
          aside={<StatusPill tone={campaigns.length > 0 ? "blue" : "gray"}>{campaigns.length} visible</StatusPill>}
        >
          <DataTable
            rows={campaigns}
            rowKey={(row) => row.id}
            minWidth="min-w-[980px]"
            columns={[
              {
                key: "campaign",
                header: "Campaign",
                cell: (row) => (
                  <>
                    <Link className="font-bold text-[var(--text-primary)] transition hover:text-[var(--accent)]" href={row.href}>
                      {row.name}
                    </Link>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{row.persona}</div>
                  </>
                ),
              },
              { key: "status", header: "Status", cell: (row) => <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill> },
              {
                key: "objective",
                header: "Objective",
                cellClassName: "text-[var(--text-secondary)]",
                cell: (row) => (
                  <>
                    <div className="line-clamp-1 font-medium text-[var(--text-primary)]">{row.objective}</div>
                    <div className="mt-1 line-clamp-1 text-xs text-[var(--text-muted)]">{row.audienceSummary}</div>
                  </>
                ),
              },
              { key: "assets", header: "Assets", cellClassName: "font-mono font-semibold tabular-nums", cell: (row) => row.assetCount },
              { key: "approvals", header: "Approvals", cellClassName: "font-mono font-semibold tabular-nums", cell: (row) => row.approvalCount },
              { key: "media", header: "Media", cellClassName: "font-mono font-semibold tabular-nums", cell: (row) => row.mediaCount },
              { key: "updated", header: "Updated", cellClassName: "text-[var(--text-secondary)]", cell: (row) => row.updatedAt },
            ]}
            emptyState={
              <EmptyState
                title="No campaign workspaces yet"
                detail="Once Mark creates a campaign record, it will appear here with the assets, approvals, sources, and media tied to it."
                action={<Link className={buttonClasses({ variant: "primary", size: "sm" })} href="/agent-operations">Open Mark</Link>}
              />
            }
          />
        </WorkspacePanel>

        <aside className="min-w-0 space-y-5 xl:sticky xl:top-5 xl:self-start">
          <WorkspacePanel
            eyebrow="Latest campaign"
            title={selected?.name ?? "Waiting on Mark"}
            description={selected ? selected.objective : "Create or import a campaign to start building the workspace."}
            aside={selected ? <StatusPill tone={statusTone(selected.status)}>{selected.status}</StatusPill> : null}
          >
            {selected ? <CampaignSummaryCard campaign={selected} /> : (
              <div className="p-4">
                <EmptyState title="Nothing to inspect yet" detail="Mark can create a campaign brief and attach assets after the CRM and approval records are ready." />
              </div>
            )}
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Workspace shape" title="What belongs inside">
            <div className="grid gap-2 p-4">
              {[
                ["Physical", "Postcards, one-pagers, leave-behinds, call scripts."],
                ["Virtual", "Email, SMS, landing copy, social posts, sequences."],
                ["Ads", "Meta, Google, display, and paid creative concepts."],
                ["Media", "Images, videos, generated previews, source files."],
              ].map(([title, detail]) => (
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-3" key={title}>
                  <div className="text-sm font-bold text-[var(--text-primary)]">{title}</div>
                  <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{detail}</p>
                </div>
              ))}
            </div>
          </WorkspacePanel>
        </aside>
      </div>
    </AppShell>
  );
}

function CampaignSummaryCard({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] p-4">
        <div className="signal-eyebrow">Audience</div>
        <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{campaign.audienceSummary}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["Assets", campaign.assetCount],
          ["Approvals", campaign.approvalCount],
          ["Media", campaign.mediaCount],
          ["Sources", campaign.sourceCount],
        ].map(([label, value]) => (
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-3" key={label}>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
            <div className="mt-2 font-display text-2xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{value}</div>
          </div>
        ))}
      </div>
      <Link className={buttonClasses({ variant: "primary", className: "w-full" })} href={campaign.href}>
        Open campaign workspace
      </Link>
    </div>
  );
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("approved") || normalized.includes("active")) return "green";
  if (normalized.includes("reject") || normalized.includes("block")) return "red";
  if (normalized.includes("pending") || normalized.includes("review") || normalized.includes("draft")) return "amber";
  return "blue";
}

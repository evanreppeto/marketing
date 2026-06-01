import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { ActionFeedback, buttonClasses, OperatorBar, PageHeader, Panel, StatusPill } from "../_components/page-header";
import {
  aiStudioStats,
  approvalDrafts,
  campaignBriefFields,
  campaignProductionStages,
  marketingAssetRows,
  marketingCampaigns,
} from "../_data/growth-engine";

type AiStudioPageProps = {
  searchParams?: Promise<{
    action?: string | string[];
    agent?: string | string[];
    campaign?: string | string[];
    tool?: string | string[];
  }>;
};

const actionMessages: Record<string, string> = {
  "new-campaign": "Campaign creation requires the live campaign workflow.",
  "generate-asset": "Asset generation requires the live Mark workflow.",
  "send-approval": "Approval handoff requires a persisted campaign asset.",
  "connect-tool": "Tool connections require a configured integration.",
  "review-asset": "Public-facing assets remain blocked until reviewed.",
  "agent-run": "Agent orchestration runs from the Mark operations queue.",
  "prompt-library": "Guardrails stay attached to every campaign brief.",
};

const campaignWizardSteps = [
  {
    step: "Audience",
    value: "Plumbing partners",
    detail: "Trade partners who stop the source and need a fast restoration handoff.",
  },
  {
    step: "Loss focus",
    value: "Water backup / burst pipe",
    detail: "Inside the approved restoration scope. Hail-only and exterior-only work stay blocked.",
  },
  {
    step: "Offer",
    value: "Fast mitigation handoff",
    detail: "Coverage-neutral promise: quick call, clear documentation, next-step clarity.",
  },
  {
    step: "Channels",
    value: "Landing page, email, one-pager",
    detail: "Draft assets stay internal until an owner approves them.",
  },
];

export default async function AiStudioPage({ searchParams }: AiStudioPageProps) {
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const activeCampaignKey = getValue(query.campaign);
  const activeCampaign =
    marketingCampaigns.find((campaign) => campaign.key === activeCampaignKey) ?? marketingCampaigns[0];

  return (
    <AppShell active="/ai-studio">
      <PageHeader
        eyebrow="Marketing Command Center"
        title="Build campaigns and ads in one controlled workspace"
        description="Plan campaigns, generate assets, coordinate AI tools, review approvals, and maintain the marketing library without scattering work across disconnected tabs."
        aside={<StatusPill tone="amber">In-house production hub</StatusPill>}
      />

      <ActionFeedback action={action} messages={actionMessages} />

      <OperatorBar
        task="Build one campaign from audience to approval."
        detail="Choose the audience, confirm the loss focus, generate draft assets, then send everything to the approval inbox before any external use."
        status="Guided builder"
        primary={
          <Link
            className={buttonClasses({ variant: "primary" })}
            href={`/ai-studio?action=generate-asset&campaign=${activeCampaign.key}`}
          >
            Generate draft assets
          </Link>
        }
        secondary={
          <Link className={buttonClasses({ variant: "ghost" })} href="/approvals">
            Open approvals
          </Link>
        }
      />

      <Panel className="module-rise p-0 [animation-delay:60ms]">
        <div className="border-b border-[var(--border-hairline)] px-5 py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Campaign Builder Wizard</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                A simple path from report insight to campaign drafts. Live records are created through the campaign workflow.
              </p>
            </div>
            <StatusPill tone="amber">Approval required</StatusPill>
          </div>
        </div>
        <div className="grid md:grid-cols-4">
          {campaignWizardSteps.map((item, index) => (
            <div className="border-b border-[var(--border-hairline)] p-5 md:border-b-0 md:border-r md:last:border-r-0" key={item.step}>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--surface-inset)] font-mono text-xs font-semibold text-[var(--accent)]">
                  {index + 1}
                </span>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{item.step}</div>
              </div>
              <div className="mt-3 font-semibold">{item.value}</div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.detail}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            Next: generate draft assets, run compliance checks, then send the package to approvals.
          </p>
          <Link
            className={buttonClasses({ variant: "ghost" })}
            href={`/ai-studio?action=send-approval&campaign=${activeCampaign.key}`}
          >
            Send to approvals
          </Link>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-4">
        {aiStudioStats.map((stat) => (
          <Panel className="module-rise [animation-delay:70ms]" key={stat.label}>
            <div className="text-sm text-[var(--text-secondary)]">{stat.label}</div>
            <div className="mt-2 font-mono text-3xl font-semibold tracking-[-0.05em]"><CountUp value={stat.value} /></div>
            <div className="mt-3 inline-flex rounded-md bg-[oklch(0.82_0.13_85/0.12)] border border-[oklch(0.82_0.13_85/0.3)] px-2 py-1 text-xs font-semibold text-[oklch(0.9_0.09_85)]">
              {stat.delta}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.48fr)_minmax(360px,0.72fr)]">
        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:120ms]">
            <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">Campaign Workbench</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  The campaign is the source of truth for ads, copy, creative prompts, approvals, and tool handoffs.
                </p>
              </div>
              <Link
                className={buttonClasses({ variant: "primary" })}
                href={`/ai-studio?action=generate-asset&campaign=${activeCampaign.key}`}
              >
                Generate asset
              </Link>
            </div>

            <div className="grid border-b border-[var(--border-hairline)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="border-b border-[var(--border-hairline)] p-5 lg:border-b-0 lg:border-r">
                <div className="signal-eyebrow">Selected campaign</div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{activeCampaign.name}</div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{activeCampaign.objective}</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[
                    ["Audience", activeCampaign.audience],
                    ["Owner", activeCampaign.owner],
                    ["Assets", `${activeCampaign.assets}`],
                    ["Status", activeCampaign.status],
                  ].map(([label, value]) => (
                    <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3" key={label}>
                      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
                      <div className="mt-1 font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2">
                {campaignBriefFields.map((field) => (
                  <div className="border-b border-[var(--border-hairline)] p-5 even:md:border-l md:[&:nth-last-child(-n+2)]:border-b-0" key={field.label}>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{field.label}</div>
                    <div className="mt-2 text-lg font-semibold">{field.value}</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{field.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-0 md:grid-cols-4">
              {marketingCampaigns.map((campaign) => (
                <Link
                  className={`border-b border-[var(--border-hairline)] p-4 transition hover:bg-[var(--surface-inset)] md:border-r md:last:border-r-0 active:-translate-y-px ${
                    campaign.key === activeCampaign.key ? "bg-[var(--accent-soft)]" : ""
                  }`}
                  href={`/ai-studio?campaign=${campaign.key}`}
                  key={campaign.key}
                >
                  <div className="text-sm font-semibold">{campaign.name}</div>
                  <div className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{campaign.audience}</div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <StatusPill tone={campaign.status === "Review" ? "amber" : "green"}>{campaign.status}</StatusPill>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">{campaign.assets} assets</span>
                  </div>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:170ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Ad and Asset Builder</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                One production queue for landing pages, search ads, video prompts, email, SMS, PDFs, and design assets.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    <th className="px-5 py-4">Asset</th>
                    <th className="px-4 py-4">Channel</th>
                    <th className="px-4 py-4">Tool</th>
                    <th className="px-4 py-4">Next step</th>
                    <th className="px-5 py-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {marketingAssetRows.map((row) => (
                    <tr key={row.asset}>
                      <td className="border-t border-[var(--border-hairline)] px-5 py-4 font-semibold">{row.asset}</td>
                      <td className="border-t border-[var(--border-hairline)] px-4 py-4 text-[var(--text-secondary)]">{row.channel}</td>
                      <td className="border-t border-[var(--border-hairline)] px-4 py-4">{row.tool}</td>
                      <td className="border-t border-[var(--border-hairline)] px-4 py-4 text-[var(--text-secondary)]">{row.nextStep}</td>
                      <td className="border-t border-[var(--border-hairline)] px-5 py-4">
                        <StatusPill tone={row.status === "Needs compliance" ? "amber" : row.status === "Review" ? "amber" : "green"}>
                          {row.status}
                        </StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:190ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Production Pipeline</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">A shared process instead of scattered files and one-off prompts.</p>
            </div>
            <div className="divide-y divide-[var(--border-hairline)]">
              {campaignProductionStages.map((stage, index) => (
                <div className="grid grid-cols-[38px_1fr_auto] gap-3 px-5 py-4" key={stage.label}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] font-mono text-xs font-semibold text-[oklch(0.18_0.03_248)]">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-semibold">{stage.label}</div>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{stage.detail}</p>
                  </div>
                  <div className="font-mono text-lg font-semibold">{stage.count}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:220ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Approval Queue</h2>
            <div className="mt-5 divide-y divide-[var(--border-hairline)]">
              {approvalDrafts.map((draft) => (
                <div className="py-4 first:pt-0 last:pb-0" key={draft.asset}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{draft.asset}</div>
                      <div className="mt-1 text-sm text-[var(--text-secondary)]">{draft.audience}</div>
                    </div>
                    <StatusPill tone={draft.status === "Blocked" ? "red" : draft.status === "Needs compliance" ? "amber" : "green"}>
                      {draft.status}
                    </StatusPill>
                  </div>
                  <div className="mt-2 text-xs text-[var(--text-muted)]">Risk: {draft.risk}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

    </AppShell>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

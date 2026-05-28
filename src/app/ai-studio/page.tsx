import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { ActionFeedback, PageHeader, Panel, StatusPill } from "../_components/page-header";
import {
  aiAgents,
  aiStudioStats,
  approvalDrafts,
  campaignBriefFields,
  campaignProductionStages,
  campaignToolchain,
  marketingAssetRows,
  marketingCampaigns,
  promptGuardrails,
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
  "new-campaign": "New campaign workspace previewed. This does not create records yet.",
  "generate-asset": "Asset generation previewed. Drafts stay inside the campaign library until approved.",
  "connect-tool": "Tool connection previewed. We will embed only tools that allow secure embedding.",
  "review-asset": "Approval workflow previewed. Public-facing assets remain blocked until reviewed.",
  "agent-run": "Agent orchestration previewed. No provider calls were made.",
  "prompt-library": "Prompt library previewed. Guardrails stay attached to every campaign brief.",
};

export default async function AiStudioPage({ searchParams }: AiStudioPageProps) {
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const activeCampaignKey = getValue(query.campaign);
  const activeToolSlug = getValue(query.tool);
  const activeAgentKey = getValue(query.agent);
  const activeCampaign =
    marketingCampaigns.find((campaign) => campaign.key === activeCampaignKey) ?? marketingCampaigns[0];
  const selectedAgent = aiAgents.find((agent) => agent.key === activeAgentKey) ?? aiAgents[0];

  return (
    <AppShell active="/ai-studio">
      <PageHeader
        eyebrow="Marketing Command Center"
        title="Build campaigns and ads in one controlled workspace"
        description="Plan campaigns, generate assets, coordinate AI tools, review approvals, and maintain the marketing library without scattering work across disconnected tabs."
        aside={<StatusPill tone="amber">In-house production hub</StatusPill>}
      />

      <ActionFeedback action={action} messages={actionMessages} />

      <div className="grid gap-4 md:grid-cols-4">
        {aiStudioStats.map((stat) => (
          <Panel className="module-rise [animation-delay:70ms]" key={stat.label}>
            <div className="text-sm text-[#6e6962]">{stat.label}</div>
            <div className="mt-2 font-mono text-3xl font-semibold tracking-[-0.05em]">{stat.value}</div>
            <div className="mt-3 inline-flex rounded-md bg-[#fff3d9] px-2 py-1 text-xs font-semibold text-[#875a07]">
              {stat.delta}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.48fr)_minmax(360px,0.72fr)]">
        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:120ms]">
            <div className="flex flex-col gap-3 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">Campaign Workbench</h2>
                <p className="mt-1 text-sm text-[#6e6962]">
                  The campaign is the source of truth for ads, copy, creative prompts, approvals, and tool handoffs.
                </p>
              </div>
              <Link
                className="inline-flex min-h-11 items-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
                href={`/ai-studio?action=generate-asset&campaign=${activeCampaign.key}`}
              >
                Generate asset
              </Link>
            </div>

            <div className="grid border-b border-[#eee8e1] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="border-b border-[#eee8e1] p-5 lg:border-b-0 lg:border-r">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a07423]">Selected campaign</div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{activeCampaign.name}</div>
                <p className="mt-3 text-sm leading-6 text-[#6e6962]">{activeCampaign.objective}</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[
                    ["Audience", activeCampaign.audience],
                    ["Owner", activeCampaign.owner],
                    ["Assets", `${activeCampaign.assets}`],
                    ["Status", activeCampaign.status],
                  ].map(([label, value]) => (
                    <div className="rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-3" key={label}>
                      <div className="text-xs text-[#6e6962]">{label}</div>
                      <div className="mt-1 font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2">
                {campaignBriefFields.map((field) => (
                  <div className="border-b border-[#eee8e1] p-5 even:md:border-l md:[&:nth-last-child(-n+2)]:border-b-0" key={field.label}>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">{field.label}</div>
                    <div className="mt-2 text-lg font-semibold">{field.value}</div>
                    <p className="mt-2 text-sm leading-6 text-[#6e6962]">{field.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-0 md:grid-cols-4">
              {marketingCampaigns.map((campaign) => (
                <Link
                  className={`border-b border-[#eee8e1] p-4 transition hover:bg-[#fbfaf8] md:border-r md:last:border-r-0 active:-translate-y-px ${
                    campaign.key === activeCampaign.key ? "bg-[#fff8f4]" : ""
                  }`}
                  href={`/ai-studio?campaign=${campaign.key}`}
                  key={campaign.key}
                >
                  <div className="text-sm font-semibold">{campaign.name}</div>
                  <div className="mt-2 text-xs leading-5 text-[#6e6962]">{campaign.audience}</div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <StatusPill tone={campaign.status === "Review" ? "amber" : "green"}>{campaign.status}</StatusPill>
                    <span className="font-mono text-xs text-[#6e6962]">{campaign.assets} assets</span>
                  </div>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:170ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Ad and Asset Builder</h2>
              <p className="mt-1 text-sm text-[#6e6962]">
                One production queue for landing pages, search ads, video prompts, email, SMS, PDFs, and design assets.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
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
                      <td className="border-t border-[#eee8e1] px-5 py-4 font-semibold">{row.asset}</td>
                      <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{row.channel}</td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">{row.tool}</td>
                      <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{row.nextStep}</td>
                      <td className="border-t border-[#eee8e1] px-5 py-4">
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
            <div className="border-b border-[#e7e0d8] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Production Pipeline</h2>
              <p className="mt-1 text-sm text-[#6e6962]">A shared process instead of scattered files and one-off prompts.</p>
            </div>
            <div className="divide-y divide-[#eee8e1]">
              {campaignProductionStages.map((stage, index) => (
                <div className="grid grid-cols-[38px_1fr_auto] gap-3 px-5 py-4" key={stage.label}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#151515] font-mono text-xs font-semibold text-white">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-semibold">{stage.label}</div>
                    <p className="mt-1 text-sm leading-6 text-[#6e6962]">{stage.detail}</p>
                  </div>
                  <div className="font-mono text-lg font-semibold">{stage.count}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:220ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Approval Queue</h2>
            <div className="mt-5 divide-y divide-[#eee8e1]">
              {approvalDrafts.map((draft) => (
                <div className="py-4 first:pt-0 last:pb-0" key={draft.asset}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{draft.asset}</div>
                      <div className="mt-1 text-sm text-[#6e6962]">{draft.audience}</div>
                    </div>
                    <StatusPill tone={draft.status === "Blocked" ? "red" : draft.status === "Needs compliance" ? "amber" : "green"}>
                      {draft.status}
                    </StatusPill>
                  </div>
                  <div className="mt-2 text-xs text-[#7a736b]">Risk: {draft.risk}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel className="module-rise p-0 [animation-delay:250ms]">
          <div className="border-b border-[#e7e0d8] px-5 py-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Connected Toolchain</h2>
            <p className="mt-1 text-sm text-[#6e6962]">
              Tools support the campaign workspace. They are not the workspace.
            </p>
          </div>
          <div className="grid gap-0 md:grid-cols-2">
            {campaignToolchain.map((tool) => (
              <Link
                className={`border-b border-[#eee8e1] p-5 transition hover:bg-[#fbfaf8] md:border-r even:md:border-r-0 active:-translate-y-px ${
                  activeToolSlug === toolSlug(tool.tool) ? "bg-[#fff8f4]" : ""
                }`}
                href={`/ai-studio?action=connect-tool&tool=${toolSlug(tool.tool)}`}
                key={tool.tool}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold">{tool.tool}</div>
                    <p className="mt-2 text-sm leading-6 text-[#6e6962]">{tool.role}</p>
                  </div>
                  <StatusPill tone={tool.state === "Needs embed check" ? "amber" : "green"}>{tool.state}</StatusPill>
                </div>
                <div className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#a07423]">{tool.mode}</div>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel className="module-rise p-0 [animation-delay:280ms]">
          <div className="border-b border-[#e7e0d8] px-5 py-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Agent and Guardrail Layer</h2>
            <p className="mt-1 text-sm text-[#6e6962]">Agents help produce and check assets, but the campaign system controls what ships.</p>
          </div>
          <div className="grid gap-0 md:grid-cols-2">
            {aiAgents.slice(0, 4).map((agent) => (
              <Link
                className={`border-b border-[#eee8e1] p-5 transition hover:bg-[#fbfaf8] md:border-r even:md:border-r-0 active:-translate-y-px ${
                  selectedAgent.key === agent.key ? "bg-[#fff8f4]" : ""
                }`}
                href={`/ai-studio?action=agent-run&agent=${agent.key}&campaign=${activeCampaign.key}`}
                key={agent.key}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold">{agent.name}</div>
                    <p className="mt-2 text-sm leading-6 text-[#6e6962]">{agent.role}</p>
                  </div>
                  <StatusPill tone={agent.status === "Required" ? "red" : "green"}>{agent.status}</StatusPill>
                </div>
              </Link>
            ))}
          </div>
          <div className="space-y-3 p-5">
            {promptGuardrails.slice(0, 4).map((guardrail, index) => (
              <div className="grid grid-cols-[34px_1fr] gap-3 rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-3" key={guardrail}>
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#151515] font-mono text-xs font-semibold text-white">
                  {index + 1}
                </div>
                <div className="text-sm leading-6 text-[#3b3834]">{guardrail}</div>
              </div>
            ))}
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
              href={`/ai-studio?action=prompt-library&campaign=${activeCampaign.key}`}
            >
              Open prompt system
            </Link>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toolSlug(tool: string) {
  return tool.toLowerCase().replaceAll(" / ", "-").replaceAll(" ", "-");
}

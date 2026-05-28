import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { ActionFeedback, PageHeader, Panel, StatusPill } from "../_components/page-header";
import { agentApprovalQueue } from "../_data/growth-engine";

type ApprovalsPageProps = {
  searchParams?: Promise<{ action?: string | string[]; item?: string | string[] }>;
};

const actionMessages: Record<string, string> = {
  approve: "Approval previewed. No draft was activated or dispatched.",
  reject: "Rejection previewed. The draft would remain blocked from publishing.",
  revise: "Revision request previewed. A new agent task would be queued.",
  archive: "Archive previewed. The item would be hidden from the active approval queue.",
};

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const itemId = getValue(query.item);
  const selected = agentApprovalQueue.find((item) => item.id === itemId) ?? agentApprovalQueue[0];

  return (
    <AppShell active="/agent-operations">
      <PageHeader
        eyebrow="Approvals"
        title="Human review before anything goes live"
        description="Review prompt inputs, generated output, risk flags, and compliance notes before an agent-produced asset can be used externally."
        aside={<StatusPill tone="amber">No auto-send</StatusPill>}
      />

      <ActionFeedback action={action} messages={actionMessages} />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <Panel className="module-rise p-0 [animation-delay:70ms]">
          <div className="border-b border-[#e7e0d8] px-5 py-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Approval queue</h2>
            <p className="mt-1 text-sm text-[#6e6962]">Pending generated assets and blocked outputs.</p>
          </div>
          <div className="divide-y divide-[#eee8e1]">
            {agentApprovalQueue.map((item) => (
              <Link
                className={`block p-5 transition hover:bg-[#fbfaf8] active:-translate-y-px ${selected.id === item.id ? "bg-[#fff8f4]" : ""}`}
                href={`/approvals?item=${item.id}`}
                key={item.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{item.source}</div>
                    <div className="mt-1 text-sm text-[#6e6962]">{item.campaign}</div>
                  </div>
                  <StatusPill tone={item.status === "Blocked" ? "red" : item.status === "Needs compliance" ? "amber" : "green"}>
                    {item.status}
                  </StatusPill>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#7a736b]">
                  <span>{item.persona}</span>
                  <span className="text-right">{item.channel}</span>
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:110ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">{selected.source}</h2>
                  <p className="mt-1 text-sm text-[#6e6962]">{selected.agent} / {selected.campaign}</p>
                </div>
                <StatusPill tone={selected.risk === "Out of scope" ? "red" : selected.risk === "Medium" ? "amber" : "green"}>
                  Risk: {selected.risk}
                </StatusPill>
              </div>
            </div>

            <div className="grid md:grid-cols-2">
              <div className="border-b border-[#eee8e1] p-5 md:border-b-0 md:border-r">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Prompt input</div>
                <p className="mt-3 text-sm leading-6 text-[#6e6962]">{selected.promptInput}</p>
              </div>
              <div className="p-5">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Generated output</div>
                <p className="mt-3 text-sm leading-6 text-[#6e6962]">{selected.draftOutput}</p>
              </div>
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:150ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Compliance flags</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Flags remain attached to the approval item.</p>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-3">
              {selected.complianceFlags.map((flag) => (
                <div className="rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-3 text-sm font-semibold" key={flag}>
                  {flag}
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:190ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Review actions</h2>
            <div className="mt-5 grid gap-2 sm:grid-cols-4">
              {[
                ["Approve", "approve"],
                ["Reject", "reject"],
                ["Request revision", "revise"],
                ["Archive", "archive"],
              ].map(([label, nextAction]) => (
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-3 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
                  href={`/approvals?item=${selected.id}&action=${nextAction}`}
                  key={nextAction}
                >
                  {label}
                </Link>
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

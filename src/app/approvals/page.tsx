import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { ActionFeedback, Button, EmptyState, OperatorBar, PageHeader, Panel, StatusPill, buttonClasses } from "../_components/page-header";
import { decideApprovalItemAction } from "./actions";
import { type ApprovalCard, type ApprovalLeadCandidate, type RelatedRecord, listApprovalCards } from "@/lib/approvals/read-model";

type ApprovalsPageProps = {
  searchParams?: Promise<{ action?: string | string[]; item?: string | string[]; message?: string | string[] }>;
};

const actionMessages: Record<string, string> = {
  approve: "Approved. The asset is unlocked for the next backend step, but nothing was sent or published.",
  reject: "Rejected. The asset stays blocked and the decision was recorded.",
  revise: "Changes requested. Hermes has a revision task linked to this item.",
  archive: "Archived. The item left the active approval inbox.",
  error: "The decision failed. Check the details or server logs before trying again.",
};

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const itemId = getValue(query.item);
  const message = getValue(query.message);
  const { cards, error } = await loadApprovalCards();
  const selected = cards.find((item) => item.id === itemId) ?? cards[0] ?? null;
  const selectedIndex = selected ? cards.findIndex((item) => item.id === selected.id) : -1;
  const blockedCount = cards.filter((item) => item.riskLevel === "blocked" || item.status === "needs_compliance").length;

  return (
    <AppShell active="/approvals">
      <PageHeader
        eyebrow="Approvals"
        title="Review the work Hermes prepared"
        description="Approve, reject, or request changes on generated assets before they can move anywhere near an outbound channel."
        aside={<StatusPill tone="dark">{cards.length} in review</StatusPill>}
      />

      <ActionFeedback action={action} messages={actionMessages} />
      {action === "error" && message ? (
        <div className="module-rise mb-4 rounded-md border border-[oklch(0.68_0.2_26/0.42)] bg-[oklch(0.68_0.2_26/0.16)] px-4 py-3 text-sm text-[oklch(0.86_0.09_26)] [animation-delay:70ms]">
          <span className="font-semibold">Error detail: </span>
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="module-rise mb-4 rounded-md border border-[oklch(0.68_0.2_26/0.42)] bg-[oklch(0.68_0.2_26/0.16)] px-4 py-3 text-sm text-[oklch(0.86_0.09_26)] [animation-delay:70ms]">
          <span className="font-semibold">Supabase read unavailable: </span>
          {error}
        </div>
      ) : null}

      <OperatorBar
        task={selected ? selected.title : "No active review item"}
        detail={
          selected
            ? `${selected.channel} / ${selected.persona}. Review the draft, leave a note if needed, then choose the next state.`
            : "The approval inbox is clear."
        }
        status={blockedCount > 0 ? `${blockedCount} need extra care` : "Ready for review"}
        primary={
          selected ? (
            <Button variant="primary" form="approve-selected" type="submit">
              Approve
            </Button>
          ) : null
        }
        secondary={
          selected ? (
            <Button variant="ghost" form="revise-selected" type="submit">
              Request changes
            </Button>
          ) : null
        }
      />

      {selected ? (
        <ApprovalInbox cards={cards} selected={selected} selectedIndex={selectedIndex} />
      ) : (
        <Panel className="module-rise [animation-delay:90ms]">
          <EmptyState
            title="No active approvals"
            detail="There are no pending approval items in Supabase. Queue Mark from Agent Operations when you want to create the next review item."
            action={<Link className={buttonClasses({ variant: "primary", size: "sm" })} href="/agent-operations">Open Agent Operations</Link>}
          />
        </Panel>
      )}
    </AppShell>
  );
}

function ApprovalInbox({
  cards,
  selected,
  selectedIndex,
}: {
  cards: ApprovalCard[];
  selected: ApprovalCard;
  selectedIndex: number;
}) {
  const relatedRecords: Array<[string, RelatedRecord | null]> = [
    ["Company", selected.relatedRecords.company],
    ["Contact", selected.relatedRecords.contact],
    ["Lead", selected.relatedRecords.lead],
  ];
  const reviewFlags = [...selected.complianceFlags, ...selected.riskFlags];

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Panel className="p-0">
        <div className="border-b border-[var(--border-hairline)] px-4 py-4">
          <div className="signal-eyebrow">Inbox</div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{cards.length} item{cards.length === 1 ? "" : "s"} waiting.</p>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {cards.map((item) => {
            const isSelected = selected.id === item.id;

            return (
              <Link
                aria-current={isSelected ? "page" : undefined}
                className={`block px-4 py-4 transition hover:bg-[var(--surface-inset)] ${isSelected ? "bg-[var(--accent-soft)]" : ""}`}
                href={`/approvals?item=${item.id}`}
                key={item.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-sm font-semibold leading-5">{item.previewText}</div>
                    <div className="mt-1 truncate text-xs text-[var(--text-muted)]">{item.channel} / {item.sourceAgent}</div>
                  </div>
                  <StatusPill tone={riskTone(item.riskLevel)}>{item.riskLevel}</StatusPill>
                </div>
              </Link>
            );
          })}
        </div>
      </Panel>

      <div className="min-w-0 space-y-4">
        <Panel className="overflow-hidden p-0">
          <div className="border-b border-[var(--border-hairline)] px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="signal-eyebrow">Item {selectedIndex + 1} of {cards.length}</div>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">{selected.title}</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{selected.channel} / {selected.persona}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill tone={statusTone(selected.status)}>{selected.statusLabel}</StatusPill>
                <QuickReviewActions item={selected} />
              </div>
            </div>
          </div>

          <form action={decideApprovalItemAction} id="approve-selected" className="space-y-4 p-5">
            <input name="approvalItemId" type="hidden" value={selected.id} />
            <input name="decisionAction" type="hidden" value="approve" />
            {selected.structuredDraft ? <StructuredDraftReview selected={selected} /> : null}
            {selected.structuredDraft ? (
              <details className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
                <summary className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Raw audit payload
                </summary>
                <div className="border-t border-[var(--border-hairline)] p-4">
                  <label className="sr-only" htmlFor="editedOutput">Raw audit payload</label>
                  <textarea
                    className="min-h-[180px] w-full resize-y rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 font-mono text-xs leading-5 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                    defaultValue={selected.draftOutput}
                    id="editedOutput"
                    name="editedOutput"
                  />
                </div>
              </details>
            ) : (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]" htmlFor="editedOutput">
                  Draft
                </label>
                <textarea
                  className="mt-3 min-h-[300px] w-full resize-y rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 text-sm leading-6 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                  defaultValue={selected.draftOutput}
                  id="editedOutput"
                  name="editedOutput"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]" htmlFor="approveNotes">
                Comment
              </label>
              <input
                className="mt-3 min-h-11 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                id="approveNotes"
                name="notes"
                placeholder="Optional note for Hermes or the team"
              />
            </div>
          </form>

          <div className="signal-inset flex flex-col gap-2 border-t border-[var(--border-hairline)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-[var(--text-secondary)]">Approval updates the database. Dispatch stays locked.</div>
            <div className="grid gap-2 sm:grid-cols-4">
              <Button variant="primary" className="w-full" form="approve-selected" type="submit">Approve</Button>
              <DecisionButton action="reject" itemId={selected.id} label="Reject" />
              <Button variant="ghost" className="w-full" form="revise-selected" type="submit">Changes</Button>
              <DecisionButton action="archive" itemId={selected.id} label="Archive" />
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="grid gap-4 md:grid-cols-3">
            {relatedRecords.map(([label, record]) => (
              <div className="min-w-0" key={label}>
                <div className="signal-eyebrow">{label}</div>
                {record ? (
                  <>
                    <div className="mt-2 truncate font-semibold">{record.label}</div>
                    <div className="mt-1 truncate text-sm text-[var(--text-secondary)]">{record.detail}</div>
                  </>
                ) : (
                  <div className="mt-2 text-sm text-[var(--text-secondary)]">No linked record.</div>
                )}
              </div>
            ))}
          </div>
          <details className="mt-5 border-t border-[var(--border-hairline)] pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--accent)]">Evidence and prompt</summary>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <div className="signal-eyebrow">Prompt</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{selected.promptInput}</p>
              </div>
              <div>
                <div className="signal-eyebrow">Evidence</div>
                {selected.evidence.length > 0 ? (
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--accent)]">
                    {selected.evidence.map((item) => <li className="truncate" key={item}>{item}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">No evidence URLs were attached.</p>
                )}
              </div>
            </div>
          </details>
          {reviewFlags.length > 0 ? (
            <div className="mt-5 border-t border-[var(--border-hairline)] pt-4">
              <div className="signal-eyebrow">Checks</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {reviewFlags.map((flag) => <StatusPill tone="amber" key={flag}>{flag}</StatusPill>)}
              </div>
            </div>
          ) : null}
        </Panel>

        <form action={decideApprovalItemAction} id="revise-selected">
          <input name="approvalItemId" type="hidden" value={selected.id} />
          <input name="decisionAction" type="hidden" value="revise" />
          <input name="notes" type="hidden" value="Changes requested from approval inbox." />
        </form>
      </div>
    </div>
  );
}

function StructuredDraftReview({ selected }: { selected: ApprovalCard }) {
  const draft = selected.structuredDraft;

  if (!draft) {
    return null;
  }

  return (
    <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
      <div className="border-b border-[var(--border-hairline)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Reviewable lead list</div>
            <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{humanize(draft.leadListType)}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{draft.targetMarket}</p>
          </div>
          <div className="shrink-0 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-3 py-2">
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Candidates</div>
            <div className="mt-1 font-mono text-xl font-semibold text-[var(--accent)]">{draft.candidates.length}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {draft.targetZips.map((zip) => (
            <span className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-xs font-semibold text-[var(--text-secondary)]" key={zip}>
              {zip}
            </span>
          ))}
        </div>
      </div>

      <div className="divide-y divide-[var(--border-hairline)]">
        {draft.candidates.map((candidate) => (
          <LeadCandidateReview candidate={candidate} key={`${candidate.companyName}-${candidate.sourceUrl ?? "source"}`} />
        ))}
      </div>

      <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Suggested owner action</div>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{draft.suggestedOwnerAction}</p>
      </div>
    </div>
  );
}

function LeadCandidateReview({ candidate }: { candidate: ApprovalLeadCandidate }) {
  return (
    <article className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_120px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-base font-semibold text-[var(--text-primary)]">{candidate.companyName}</h4>
          <StatusPill tone={candidate.partnerScore && candidate.partnerScore >= 80 ? "green" : candidate.partnerScore && candidate.partnerScore >= 70 ? "amber" : "blue"}>
            {candidate.partnerScore ? `${candidate.partnerScore} score` : "Unscored"}
          </StatusPill>
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{candidate.evidenceSummary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {candidate.targetZips.map((zip) => (
            <span className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-xs text-[var(--text-secondary)]" key={`${candidate.companyName}-${zip}`}>
              {zip}
            </span>
          ))}
        </div>
        {candidate.scoreFactors.length > 0 ? (
          <ul className="mt-3 grid gap-1 text-sm leading-6 text-[var(--text-secondary)] md:grid-cols-2">
            {candidate.scoreFactors.map((factor) => (
              <li className="flex gap-2" key={factor}>
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                <span>{factor}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 text-sm leading-6 text-[var(--text-primary)]">
          {candidate.recommendedNextAction}
        </p>
      </div>
      <div className="flex lg:justify-end">
        {candidate.sourceUrl ? (
          <a className="inline-flex h-9 items-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-3 text-xs font-semibold text-[var(--accent)] transition hover:border-[var(--border-strong)]" href={candidate.sourceUrl} rel="noreferrer" target="_blank">
            Source
          </a>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">No source</span>
        )}
      </div>
    </article>
  );
}

function QuickReviewActions({ item }: { item: ApprovalCard }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-1">
      <form action={decideApprovalItemAction}>
        <input name="approvalItemId" type="hidden" value={item.id} />
        <input name="decisionAction" type="hidden" value="approve" />
        <input name="notes" type="hidden" value="Quick approved from the review planner." />
        <button
          aria-label={`Quick approve ${item.title}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.14)] text-[oklch(0.85_0.12_158)] transition hover:border-[oklch(0.78_0.14_158)]"
          type="submit"
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
            <path d="m6 12.5 4 4L18.5 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
      </form>
      <form action={decideApprovalItemAction}>
        <input name="approvalItemId" type="hidden" value={item.id} />
        <input name="decisionAction" type="hidden" value="reject" />
        <input name="notes" type="hidden" value="Quick rejected from the review planner." />
        <button
          aria-label={`Quick reject ${item.title}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[oklch(0.68_0.2_26/0.4)] bg-[oklch(0.68_0.2_26/0.16)] text-[oklch(0.86_0.09_26)] transition hover:border-[oklch(0.68_0.2_26)]"
          type="submit"
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
            <path d="m8 8 8 8M16 8l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
          </svg>
        </button>
      </form>
      <Link
        aria-label={`Add comment to ${item.title}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-raised)] text-[var(--text-muted)] transition hover:border-[var(--border-strong)]"
        href={`/approvals?item=${item.id}#approveNotes`}
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
          <path d="M6.5 6h11A2.5 2.5 0 0 1 20 8.5v6a2.5 2.5 0 0 1-2.5 2.5H12l-4.5 3v-3h-1A2.5 2.5 0 0 1 4 14.5v-6A2.5 2.5 0 0 1 6.5 6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      </Link>
    </div>
  );
}

function DecisionButton({ action, itemId, label }: { action: "reject" | "archive"; itemId: string; label: string }) {
  return (
    <form action={decideApprovalItemAction}>
      <input name="approvalItemId" type="hidden" value={itemId} />
      <input name="decisionAction" type="hidden" value={action} />
      <input name="notes" type="hidden" value={`${label} selected from approval inbox.`} />
      <Button variant="ghost" className="w-full" type="submit">
        {label}
      </Button>
    </form>
  );
}

async function loadApprovalCards() {
  try {
    return {
      cards: await listApprovalCards(),
      error: null,
    };
  } catch (error) {
    return {
      cards: [],
      error: error instanceof Error ? error.message : "Approval queue is unavailable.",
    };
  }
}

function statusTone(status: string) {
  if (status === "needs_compliance" || status === "revision_requested") return "amber";
  if (status === "blocked" || status === "declined") return "red";
  if (status === "approved") return "green";
  return "blue";
}

function riskTone(riskLevel: string) {
  if (riskLevel === "blocked" || riskLevel === "high") return "red";
  if (riskLevel === "medium") return "amber";
  return "green";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

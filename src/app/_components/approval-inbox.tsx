"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, EmptyState, StatusPill, buttonClasses } from "./page-header";
import { decideFromInboxAction, undoInboxDecisionAction } from "../_data/inbox-actions";

export type InboxItem = {
  id: string;
  title: string;
  previewText: string;
  persona: string;
  statusLabel: string;
  riskLevel: string;
  channel: string;
  sourceAgent: string;
  recommendedAction: string;
  evidenceCount: number;
  mediaCount: number;
  campaignId: string | null;
  campaignName: string;
  relatedCount: number;
};

function isHighRisk(risk: string) {
  return /high|blocked/i.test(risk);
}

function riskTone(risk: string): "amber" | "red" | "green" | "blue" | "gray" {
  if (/blocked/i.test(risk)) return "red";
  if (/high/i.test(risk)) return "red";
  if (/medium/i.test(risk)) return "amber";
  return "green";
}

export function ApprovalInbox({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const [decided, setDecided] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ approvalItemId: string; campaignId: string | null; message: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const visible = items.filter((item) => !decided[item.id]);

  async function decide(item: InboxItem, decision: "approved" | "declined") {
    setPending(item.id);
    const form = new FormData();
    form.set("approvalItemId", item.id);
    form.set("campaignId", item.campaignId ?? "");
    form.set("decision", decision);
    const result = await decideFromInboxAction(null, form);
    setPending(null);
    if (result?.ok) {
      setDecided((prev) => ({ ...prev, [item.id]: true }));
      if (result.undo) {
        setToast({ approvalItemId: result.undo.approvalItemId, campaignId: item.campaignId, message: result.message });
      }
    } else if (result) {
      setToast({ approvalItemId: item.id, campaignId: item.campaignId, message: result.message });
    }
  }

  async function undo() {
    if (!toast) return;
    const target = toast;
    const form = new FormData();
    form.set("approvalItemId", target.approvalItemId);
    form.set("campaignId", target.campaignId ?? "");
    const result = await undoInboxDecisionAction(null, form);
    if (result?.ok) {
      setDecided((prev) => ({ ...prev, [target.approvalItemId]: false }));
      setToast(null);
    } else {
      setToast({ ...target, message: result?.message ?? "Undo failed." });
    }
  }

  if (visible.length === 0) {
    return <EmptyState title="Nothing waiting on your approval" detail="When Mark prepares new work that needs a decision, it shows up here." />;
  }

  return (
    <div className="relative">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Quick decisions are for readable, lower-risk packets only.</p>
          <StatusPill tone="amber">Outbound locked</StatusPill>
        </div>
        <p className="mt-1 max-w-[78ch] text-xs leading-5 text-[var(--text-secondary)]">
          Approval records a human decision. It does not send email, SMS, launch ads, publish pages, change spend, or contact anyone.
        </p>
      </div>

      <ul className="divide-y divide-[var(--border-hairline)]">
        {visible.map((item) => {
          const detailHref = item.campaignId ? `/campaigns/${item.campaignId}` : `/approvals?item=${item.id}`;

          return (
            <li
              aria-label={`Open review packet for ${item.title}`}
              className="cursor-pointer px-5 py-4 transition hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--accent)]"
              key={item.id}
              onClick={(event) => {
                if (isInteractiveTarget(event.target)) return;
                router.push(detailHref);
              }}
              onKeyDown={(event) => {
                if (isInteractiveTarget(event.target)) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(detailHref);
                }
              }}
              role="link"
              tabIndex={0}
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={riskTone(item.riskLevel)}>{item.riskLevel}</StatusPill>
                    <StatusPill tone="blue">{item.channel}</StatusPill>
                    <StatusPill tone="gray">{item.statusLabel}</StatusPill>
                  </div>
                  <div className="mt-3 truncate font-bold text-[var(--text-primary)]">{item.title}</div>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{item.previewText}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <InboxDetail label="Persona" value={item.persona} />
                    <InboxDetail label="Created by" value={item.sourceAgent} />
                    <InboxDetail label="Campaign" value={item.campaignName} />
                    <InboxDetail label="Recommended" value={item.recommendedAction} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                    <span>{item.evidenceCount} evidence link{item.evidenceCount === 1 ? "" : "s"}</span>
                    <span>{item.mediaCount} media item{item.mediaCount === 1 ? "" : "s"}</span>
                    <span>{item.relatedCount} related record{item.relatedCount === 1 ? "" : "s"}</span>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Human action</div>
                    <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
                      {isHighRisk(item.riskLevel) ? "Open the full packet before deciding." : "Review the packet summary, then decide or open details."}
                    </p>
                  </div>
                  {isHighRisk(item.riskLevel) ? (
                    <Link
                      href={detailHref}
                      className={buttonClasses({ variant: "primary", size: "sm", className: "w-full" })}
                    >
                      Review packet
                    </Link>
                  ) : (
                    <div className="grid gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" size="sm" variant="primary" disabled={pending === item.id} onClick={() => decide(item, "approved")}>
                          Approve
                        </Button>
                        <Button type="button" size="sm" variant="ghost" disabled={pending === item.id} onClick={() => decide(item, "declined")}>
                          Decline
                        </Button>
                      </div>
                      <Link className={buttonClasses({ variant: "ghost", size: "sm", className: "w-full" })} href={`/approvals?item=${item.id}`}>
                        Open details
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {toast ? (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-[var(--border-panel)] bg-[var(--surface-raised)] px-5 py-3 text-sm">
          <span className="font-semibold text-[var(--text-primary)]">{toast.message}</span>
          <button type="button" onClick={undo} className="font-semibold text-[var(--accent)] hover:underline">
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("a,button,input,select,textarea,summary"));
}

function InboxDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-[var(--text-primary)]">{value || "Missing"}</div>
    </div>
  );
}

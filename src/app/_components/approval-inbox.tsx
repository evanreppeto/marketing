"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, StatusPill } from "./page-header";
import { decideFromInboxAction, undoInboxDecisionAction } from "../_data/inbox-actions";

export type InboxItem = {
  id: string;
  title: string;
  persona: string;
  riskLevel: string;
  campaignId: string | null;
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
    const form = new FormData();
    form.set("approvalItemId", toast.approvalItemId);
    form.set("campaignId", toast.campaignId ?? "");
    await undoInboxDecisionAction(null, form);
    setDecided((prev) => ({ ...prev, [toast.approvalItemId]: false }));
    setToast(null);
  }

  if (visible.length === 0) {
    return <p className="px-5 py-6 text-sm text-[var(--text-secondary)]">Nothing waiting on your approval. Mark will surface new work here.</p>;
  }

  return (
    <div className="relative">
      <ul className="divide-y divide-[var(--border-hairline)]">
        {visible.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-[var(--text-primary)]">{item.title}</div>
              <div className="mt-0.5 text-sm text-[var(--text-secondary)]">{item.persona}</div>
            </div>
            <StatusPill tone={riskTone(item.riskLevel)}>{item.riskLevel}</StatusPill>
            {isHighRisk(item.riskLevel) ? (
              <Link
                href={item.campaignId ? `/campaigns/${item.campaignId}` : "/approvals"}
                className="text-sm font-semibold text-[var(--accent)] hover:underline"
              >
                Open &rarr;
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="primary" disabled={pending === item.id} onClick={() => decide(item, "approved")}>
                  Approve
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending === item.id} onClick={() => decide(item, "declined")}>
                  Decline
                </Button>
              </div>
            )}
          </li>
        ))}
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

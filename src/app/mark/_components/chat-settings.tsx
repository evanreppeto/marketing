"use client";

import { useEffect, useRef, useState } from "react";

import type { MarkProject } from "@/lib/mark-chat/persistence";
import { attachCampaignForm, moveConversationForm } from "../actions";

/** A small settings gear for the chat header: attach this conversation's Project
 *  and Campaign. The attached campaign is the default Promote target for items
 *  saved from this chat. */
export function ChatSettings({
  conversationId,
  projects,
  activeProjectId,
  campaigns,
  activeCampaignId,
}: {
  conversationId: string;
  projects: MarkProject[];
  activeProjectId: string | null;
  campaigns: { id: string; name: string }[];
  activeCampaignId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const fieldCls =
    "h-8 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Chat settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
      >
        <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="2.5" />
          <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.5 1.5M13.5 13.5L15 15M15 5l-1.5 1.5M6.5 13.5L5 15" />
        </svg>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-9 z-30 w-60 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-3 shadow-[var(--elev-raised)]">
          <p className="signal-eyebrow mb-2">Chat context</p>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">Project</label>
          <form action={moveConversationForm}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <select name="projectId" defaultValue={activeProjectId ?? ""} aria-label="Project" onChange={(e) => e.currentTarget.form?.requestSubmit()} className={fieldCls}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </form>
          <label className="mb-1 mt-3 block text-[11px] font-medium text-[var(--text-muted)]">Campaign</label>
          <form action={attachCampaignForm}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <select name="campaignId" defaultValue={activeCampaignId ?? ""} aria-label="Campaign" onChange={(e) => e.currentTarget.form?.requestSubmit()} className={fieldCls}>
              <option value="">No campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </form>
          <p className="mt-2 text-[10px] text-[var(--text-muted)]">Saved items from this chat promote into the attached campaign by default.</p>
        </div>
      ) : null}
    </div>
  );
}

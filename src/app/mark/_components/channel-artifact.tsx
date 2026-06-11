"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";

import type { MarkActionApproval, MarkMedia, ResolvedDraftFields } from "@/domain";
import type { DraftAssetView } from "@/lib/campaigns/draft-editing";

import { decideCampaignDraftAction, editDraftAssetAction, getDraftAssetAction } from "../actions";
import { ArtifactImage } from "./artifact-image";
import { ChannelPreview } from "./channel-preview";

const STRUCTURED_KEYS = ["subject", "primaryText", "headline", "cta"] as const;

function EditedPill() {
  return (
    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
      Edited
    </span>
  );
}

function LockNote() {
  return (
    <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
      <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="9" width="10" height="7" rx="1.5" />
        <path d="M7 9V7a3 3 0 0 1 6 0v2" />
      </svg>
      outbound locked
    </span>
  );
}

export function ChannelArtifact({
  approval,
  image,
  fallback,
}: {
  approval: MarkActionApproval;
  image?: MarkMedia;
  /** Rendered when the editable draft can't be loaded (preview mode / unmigrated env). */
  fallback?: ReactNode;
}) {
  const [view, setView] = useState<DraftAssetView | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  async function load() {
    setLoading(true);
    const next = await getDraftAssetAction(approval.assetId);
    if (next) {
      setView(next);
      setFields({
        title: next.fields.title ?? "",
        subject: next.fields.subject ?? "",
        primaryText: next.fields.primaryText ?? "",
        headline: next.fields.headline ?? "",
        cta: next.fields.cta ?? "",
        body: next.fields.body ?? "",
      });
      setDirty(false);
    }
    setLoading(false);
  }

  useEffect(() => {
    // Schedule asynchronously to satisfy the set-state-in-effect lint rule.
    void Promise.resolve().then(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approval.assetId]);

  function setField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  function save() {
    if (!view) return;
    const structured: Record<string, string> = {};
    for (const k of STRUCTURED_KEYS) {
      if (fields[k]?.trim()) structured[k] = fields[k];
    }
    startSave(async () => {
      const res = await editDraftAssetAction({
        assetId: view.assetId,
        campaignId: view.campaignId,
        title: fields.title,
        body: fields.body,
        fields: structured,
      });
      if (res.ok) {
        setError(null);
        setSaved(true);
        await load();
      } else {
        setError(res.message);
      }
    });
  }

  if (loading && !view) {
    return (
      <div className="flex flex-col gap-2">
        <div className="mark-skel" style={{ width: "60%" }} />
        <div className="mark-skel" style={{ width: "100%" }} />
        <div className="mark-skel" style={{ width: "88%" }} />
      </div>
    );
  }

  if (!view) {
    return (
      <>
        {fallback ?? (
          <p className="text-xs leading-5 text-[var(--text-muted)]">This draft isn&apos;t available to edit right now.</p>
        )}
      </>
    );
  }

  const liveFields: ResolvedDraftFields = {
    title: fields.title,
    subject: fields.subject,
    primaryText: fields.primaryText,
    headline: fields.headline,
    cta: fields.cta,
    body: fields.body ?? "",
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
          Draft
        </span>
        {view.edited ? <EditedPill /> : null}
        <span className="ml-auto" />
        <LockNote />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {image ? <div className="mb-3"><ArtifactImage image={image} /></div> : null}
        <ChannelPreview kind={view.kind} fields={liveFields} onField={(k, v) => setField(k, v)} />
        {error ? <p className="mt-2 text-[11px] text-[var(--priority-bright)]">{error}</p> : null}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="w-full rounded-lg bg-[var(--accent)] py-2 text-xs font-bold text-[var(--on-accent)] transition enabled:hover:bg-[var(--accent-strong)] disabled:opacity-45"
        >
          {saving ? "Saving…" : saved && !dirty ? "Saved" : "Save edits"}
        </button>

        <div className="flex items-center gap-2">
          <form action={decideCampaignDraftAction} className="flex-1">
            <input type="hidden" name="assetId" value={view.assetId} />
            <input type="hidden" name="campaignId" value={view.campaignId} />
            <input type="hidden" name="decision" value="approved" />
            <button
              type="submit"
              className="w-full rounded-lg border border-[var(--ok-border)] bg-[var(--ok-solid)] py-2 text-xs font-bold text-[var(--on-ok)] transition hover:bg-[var(--ok-hover)]"
            >
              Approve
            </button>
          </form>
          <form action={decideCampaignDraftAction}>
            <input type="hidden" name="assetId" value={view.assetId} />
            <input type="hidden" name="campaignId" value={view.campaignId} />
            <input type="hidden" name="decision" value="declined" />
            <button
              type="submit"
              className="rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--priority-bright)]"
            >
              Decline
            </button>
          </form>
        </div>
        <Link
          href={`/campaigns/${view.campaignId}`}
          className="rounded-lg py-2 text-center text-xs font-semibold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]"
        >
          Request a revision · open full draft
        </Link>
      </div>
    </div>
  );
}

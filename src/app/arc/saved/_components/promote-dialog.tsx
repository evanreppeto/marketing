"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { cx } from "@/app/_components/theme";
import type { SavedItem } from "@/lib/arc-chat/saved";
import { OFFICIAL_PERSONA_MAPPINGS, RESTORATION_FOCUS_VALUES } from "@/domain";
import { promoteSavedItemAction } from "../../actions";
import type { PromoteTarget } from "@/app/arc/promote-target";

function humanize(s: string) {
  return s.replace(/^persona_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PromoteDialog({
  item,
  campaigns,
  onClose,
}: {
  item: SavedItem;
  campaigns: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"existing" | "new">(campaigns.length ? "existing" : "new");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [name, setName] = useState(item.title ?? "");
  const [persona, setPersona] = useState<string>(OFFICIAL_PERSONA_MAPPINGS[0]);
  const [focus, setFocus] = useState<string>(RESTORATION_FOCUS_VALUES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const target: PromoteTarget =
      tab === "existing" ? { mode: "existing", campaignId } : { mode: "new", name, persona, restorationFocus: focus };
    const res = await promoteSavedItemAction(item.id, target);
    setBusy(false);
    if (!res.ok) {
      setError(res.message ?? "Couldn't promote.");
      return;
    }
    onClose();
    if (res.campaignId) router.push(`/campaigns/${res.campaignId}`);
  }

  const tabCls = (active: boolean) =>
    cx("rounded-md px-3 py-1.5 text-sm font-medium transition", active ? "bg-[var(--surface-inset)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]");
  const fieldCls =
    "h-9 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="Promote to campaign">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-4 shadow-[var(--elev-raised)]">
        <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">Promote to a campaign</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Creates a draft asset awaiting approval. Outbound stays locked.</p>

        <div className="mt-3 flex gap-1">
          <button type="button" onClick={() => setTab("existing")} className={tabCls(tab === "existing")} disabled={!campaigns.length}>
            Existing
          </button>
          <button type="button" onClick={() => setTab("new")} className={tabCls(tab === "new")}>
            New campaign
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {tab === "existing" ? (
            campaigns.length ? (
              <select aria-label="Campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={fieldCls}>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">No campaigns yet — use New campaign.</p>
            )
          ) : (
            <>
              <input aria-label="Campaign name" placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} />
              <select aria-label="Persona" value={persona} onChange={(e) => setPersona(e.target.value)} className={fieldCls}>
                {OFFICIAL_PERSONA_MAPPINGS.map((p) => (
                  <option key={p} value={p}>
                    {humanize(p)}
                  </option>
                ))}
              </select>
              <select aria-label="Restoration focus" value={focus} onChange={(e) => setFocus(e.target.value)} className={fieldCls}>
                {RESTORATION_FOCUS_VALUES.map((f) => (
                  <option key={f} value={f}>
                    {humanize(f)}
                  </option>
                ))}
              </select>
            </>
          )}
          {error ? <p className="text-xs font-medium text-[var(--priority-bright)]">{error}</p> : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {busy ? "Promoting…" : "Promote"}
          </button>
        </div>
      </div>
    </div>
  );
}

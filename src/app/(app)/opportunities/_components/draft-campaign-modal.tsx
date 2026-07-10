"use client";

import { useState } from "react";

import { OFFICIAL_PERSONA_MAPPINGS, RESTORATION_FOCUS_VALUES } from "@/domain";

import { Modal } from "../../_components/modal";
import { type DraftCampaignFromOpportunityInput } from "../actions";
import { type OpportunityVM } from "./opportunity-inbox";

function personaLabel(key: string): string {
  return key
    .replace(/^persona_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function focusLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Which flow the confirm modal drives:
 * - `operator` — "Create campaign": an operator-owned draft shell.
 * - `arc` — "Ask Arc to draft": also runs Arc to draft the full package.
 */
export type DraftMode = "operator" | "arc";

const MODE_COPY: Record<
  DraftMode,
  { title: string; description: string; submit: string; submitting: string }
> = {
  operator: {
    title: "Draft campaign from opportunity",
    description:
      "Arc seeds an approval-gated draft from this opportunity's evidence. Everything stays launch-locked — nothing sends until you approve it.",
    submit: "Create draft",
    submitting: "Creating draft…",
  },
  arc: {
    title: "Ask Arc to draft a package",
    description:
      "Arc will draft a full starter package — email, SMS, paid, and landing copy — from this opportunity's evidence. Every piece lands approval-gated and launch-locked; nothing sends until you approve it.",
    submit: "Ask Arc to draft",
    submitting: "Arc is drafting…",
  },
};

/**
 * Confirm/preview before converting an opportunity into a campaign draft. Shows
 * the read-only evidence Arc carries over (message angle, signals, subject
 * record) and lets the operator confirm/adjust the seeded name, persona, and
 * focus. Submit creates an approval-gated draft — nothing sends.
 */
export function DraftCampaignModal({
  open,
  onClose,
  opp,
  mode = "operator",
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  opp: OpportunityVM;
  mode?: DraftMode;
  /** Returns the outcome so the modal can surface an error and stay open on failure. */
  onSubmit: (
    value: Omit<DraftCampaignFromOpportunityInput, "opportunityId">,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const copy = MODE_COPY[mode];
  const [name, setName] = useState(opp.seed.name);
  const [persona, setPersona] = useState(opp.seed.persona);
  const [focus, setFocus] = useState(opp.seed.restorationFocus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && persona.length > 0 && focus.length > 0 && !pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const result = await onSubmit({ name: name.trim(), persona, restorationFocus: focus });
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? "Could not create the campaign draft.");
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      width={620}
      footer={
        <>
          <button type="button" className="mbtn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form="draft-from-opp-form" className="mbtn gold" disabled={!canSubmit}>
            {pending ? copy.submitting : copy.submit}
          </button>
        </>
      }
    >
      <form id="draft-from-opp-form" className="mform" onSubmit={submit}>
        <div className="opp-seed-preview">
          <div className="mlabel">Message angle Arc will carry over</div>
          <p className="opp-seed-angle">{opp.recommendedAction}</p>

          {opp.evidence.length > 0 && (
            <>
              <div className="mlabel">Evidence</div>
              <ul className="opp-seed-evidence">
                {opp.evidence.map((e, i) => (
                  <li key={i}>
                    <span className="es">{e.label}:</span> {e.value}
                  </li>
                ))}
              </ul>
            </>
          )}

          {opp.recordHref && opp.recordLabel && (
            <div className="opp-seed-record">
              Linked to this draft:{" "}
              <a href={opp.recordHref}>{opp.recordLabel.replace(/^Open the /, "").replace(/ record$/, "")} record</a>
            </div>
          )}
        </div>

        <label className="mfield">
          <span className="mlabel">Campaign name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" required />
        </label>

        <div className="mrow">
          <label className="mfield">
            <span className="mlabel">Audience persona</span>
            <select value={persona} onChange={(e) => setPersona(e.target.value)} required>
              <option value="" disabled>
                Choose a persona…
              </option>
              {OFFICIAL_PERSONA_MAPPINGS.map((key) => (
                <option key={key} value={key}>
                  {personaLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <label className="mfield">
            <span className="mlabel">Focus</span>
            <select value={focus} onChange={(e) => setFocus(e.target.value)} required>
              <option value="" disabled>
                Choose a focus…
              </option>
              {RESTORATION_FOCUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {focusLabel(value)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <div className="mError">{error}</div>}
      </form>
    </Modal>
  );
}

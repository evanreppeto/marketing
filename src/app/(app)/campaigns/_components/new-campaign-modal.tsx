"use client";

import { useState } from "react";

import { OFFICIAL_PERSONA_MAPPINGS } from "@/domain";

import { Modal } from "../../_components/modal";
import { type NewCampaignInput } from "../actions";

function personaLabel(key: string): string {
  return key
    .replace(/^persona_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Common restoration angles offered as quick suggestions (free text still wins).
const FOCUS_SUGGESTIONS = [
  "Water damage restoration",
  "Fire & smoke restoration",
  "Mold remediation",
  "Storm & roof response",
  "Basement flooding",
  "Commercial water mitigation",
];

export function NewCampaignModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** Returns the outcome so the modal can surface an error and stay open on failure. */
  onSubmit: (value: NewCampaignInput) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [focus, setFocus] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The board remounts this via `key` on each open, so fields start fresh.
  const canSubmit = name.trim().length > 0 && persona.length > 0 && focus.trim().length > 0 && !pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const result = await onSubmit({ name: name.trim(), persona, restorationFocus: focus.trim() });
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? "Could not create the campaign.");
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New campaign"
      description="Creates a draft package. Arc builds out the pieces and everything stays approval-gated — nothing sends until you approve it."
      footer={
        <>
          <button type="button" className="mbtn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form="new-campaign-form" className="mbtn gold" disabled={!canSubmit}>
            {pending ? "Creating…" : "Create draft"}
          </button>
        </>
      }
    >
      <form id="new-campaign-form" className="mform" onSubmit={submit}>
        <label className="mfield">
          <span className="mlabel">Campaign name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Spring Water-Damage Reactivation"
            required
          />
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
            <input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="Water damage restoration"
              list="campaign-focus-suggestions"
              required
            />
            <datalist id="campaign-focus-suggestions">
              {FOCUS_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </div>

        {error && <div className="mError">{error}</div>}
      </form>
    </Modal>
  );
}

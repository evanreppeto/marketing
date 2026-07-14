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

// The DB `restoration_focus` enum — these are the only accepted values, so the
// field is a select (free text would be rejected by Postgres).
const FOCUS_OPTIONS: { value: string; label: string }[] = [
  { value: "burst_pipe", label: "Burst pipe" },
  { value: "water_backup", label: "Water backup" },
  { value: "standing_water", label: "Standing water" },
  { value: "flood", label: "Flood" },
  { value: "storm_surge", label: "Storm surge" },
  { value: "sewage", label: "Sewage" },
  { value: "mold", label: "Mold" },
  { value: "fire", label: "Fire" },
];

export type PersonaOption = { key: string; label: string };

export function NewCampaignModal({
  open,
  personaOptions,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** The org's own personas. Falls back to the BSR demo set when not provided. */
  personaOptions?: PersonaOption[];
  onClose: () => void;
  /** Returns the outcome so the modal can surface an error and stay open on failure. */
  onSubmit: (value: NewCampaignInput) => Promise<{ ok: boolean; error?: string }>;
}) {
  const personaChoices =
    personaOptions?.length ? personaOptions : OFFICIAL_PERSONA_MAPPINGS.map((key) => ({ key, label: personaLabel(key) }));
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
              {personaChoices.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
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
              {FOCUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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

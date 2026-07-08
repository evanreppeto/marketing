"use client";

import { useState } from "react";

import { Modal } from "../../_components/modal";
import { type NewPersonaInput } from "../actions";

const SEGMENT_OPTIONS: { value: string; label: string; blurb: string }[] = [
  { value: "acquisition", label: "Acquisition", blurb: "Win new demand" },
  { value: "engagement", label: "Engagement", blurb: "Nurture active relationships" },
  { value: "retention", label: "Retention", blurb: "Keep and grow customers" },
];

export function NewPersonaModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** Returns the outcome so the modal can surface an error and stay open on failure. */
  onSubmit: (value: NewPersonaInput) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [name, setName] = useState("");
  const [segment, setSegment] = useState("acquisition");
  const [angle, setAngle] = useState("");
  const [audience, setAudience] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The roster remounts this via `key` on each open, so fields start fresh.
  const canSubmit = name.trim().length > 0 && !pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const result = await onSubmit({
      name: name.trim(),
      segment,
      angle: angle.trim() || undefined,
      audience: audience.trim() || undefined,
    });
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? "Could not create the persona.");
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New persona"
      description="An internal playbook that powers CRM, targeting, and campaigns. Arc refines its scores and signals as it learns."
      footer={
        <>
          <button type="button" className="mbtn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form="new-persona-form" className="mbtn gold" disabled={!canSubmit}>
            {pending ? "Creating…" : "Create persona"}
          </button>
        </>
      }
    >
      <form id="new-persona-form" className="mform" onSubmit={submit}>
        <label className="mfield">
          <span className="mlabel">Persona name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="HOA Board Member"
            required
          />
        </label>

        <label className="mfield">
          <span className="mlabel">Segment</span>
          <select value={segment} onChange={(e) => setSegment(e.target.value)}>
            {SEGMENT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label} — {s.blurb}
              </option>
            ))}
          </select>
        </label>

        <label className="mfield">
          <span className="mlabel">
            Message angle <span className="mopt">optional</span>
          </span>
          <input
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            placeholder="Protect the association's property value with fast, documented response"
          />
        </label>

        <label className="mfield">
          <span className="mlabel">
            Audience <span className="mopt">optional</span>
          </span>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="Condo & HOA boards across managed properties"
          />
        </label>

        {error && <div className="mError">{error}</div>}
      </form>
    </Modal>
  );
}

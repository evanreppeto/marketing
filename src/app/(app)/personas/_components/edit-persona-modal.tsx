"use client";

import { useState } from "react";

import { Modal } from "../../_components/modal";
import { type EditPersonaInput } from "../actions";
import { type PersonaVM } from "./personas-view";

const SEGMENT_OPTIONS: { value: string; label: string; blurb: string }[] = [
  { value: "acquisition", label: "Acquisition", blurb: "Win new demand" },
  { value: "engagement", label: "Engagement", blurb: "Nurture active relationships" },
  { value: "retention", label: "Retention", blurb: "Keep and grow customers" },
];

const STAGE_OPTIONS = ["New", "Hot lead", "Active", "Champion", "At risk", "Dormant"];

export function EditPersonaModal({
  open,
  persona,
  onClose,
  onSubmit,
}: {
  open: boolean;
  persona: PersonaVM | null;
  onClose: () => void;
  /** Returns the outcome so the modal can surface an error and stay open on failure. */
  onSubmit: (value: EditPersonaInput) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [name, setName] = useState(persona?.name ?? "");
  const [segment, setSegment] = useState<string>(persona?.segment ?? "acquisition");
  const [stage, setStage] = useState<string>(persona?.stage ?? "New");
  const [angle, setAngle] = useState(persona?.angle ?? "");
  const [audience, setAudience] = useState(persona?.audience ?? "");
  const [cta, setCta] = useState(persona?.cta ?? "");
  const [channel, setChannel] = useState(persona?.channel ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The roster remounts this via `key` on each open, so fields reflect the target.
  const canSubmit = name.trim().length > 0 && !pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !persona) return;
    setPending(true);
    setError(null);
    const result = await onSubmit({
      slug: persona.slug,
      name: name.trim(),
      segment,
      stage,
      angle: angle.trim(),
      audience: audience.trim(),
      cta: cta.trim(),
      channel: channel.trim(),
    });
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? "Could not update the persona.");
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit persona"
      description="Refine this playbook. Renaming keeps the persona's key stable, so tagged records stay linked."
      footer={
        <>
          <button type="button" className="mbtn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form="edit-persona-form" className="mbtn gold" disabled={!canSubmit}>
            {pending ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <form id="edit-persona-form" className="mform" onSubmit={submit}>
        <label className="mfield">
          <span className="mlabel">Persona name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
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
          <span className="mlabel">Stage</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="mfield">
          <span className="mlabel">
            Message angle <span className="mopt">optional</span>
          </span>
          <input value={angle} onChange={(e) => setAngle(e.target.value)} />
        </label>

        <label className="mfield">
          <span className="mlabel">
            Audience <span className="mopt">optional</span>
          </span>
          <input value={audience} onChange={(e) => setAudience(e.target.value)} />
        </label>

        <label className="mfield">
          <span className="mlabel">
            Recommended CTA <span className="mopt">optional</span>
          </span>
          <input value={cta} onChange={(e) => setCta(e.target.value)} />
        </label>

        <label className="mfield">
          <span className="mlabel">
            Preferred channel <span className="mopt">optional</span>
          </span>
          <input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="Email" />
        </label>

        {error && <div className="mError">{error}</div>}
      </form>
    </Modal>
  );
}

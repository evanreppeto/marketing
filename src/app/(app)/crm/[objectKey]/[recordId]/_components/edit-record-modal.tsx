"use client";

import { useState } from "react";

import { OFFICIAL_PERSONA_MAPPINGS } from "@/domain";

import { Modal } from "../../../../_components/modal";

// Per-object status options — the real DB enum values (verified against the
// schema; e.g. company_status has no "prospect").
const STATUS_OPTIONS: Record<string, string[]> = {
  companies: ["active", "inactive", "archived"],
  contacts: ["active", "inactive", "do_not_contact", "archived"],
  leads: ["new", "validated", "needs_review", "qualified", "converted", "lost", "archived"],
  jobs: ["pending", "scheduled", "in_progress", "completed", "canceled"],
  outcomes: ["pending", "won", "lost", "paid", "written_off"],
};

function titleize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function personaLabel(key: string): string {
  return titleize(key.replace(/^persona_/, ""));
}

export type EditRecordValue = { persona?: string; status?: string };
export type PersonaOption = { key: string; label: string };

export function EditRecordModal({
  open,
  objectKey,
  currentPersona,
  currentStatus,
  personaOptions,
  onClose,
  onSubmit,
}: {
  open: boolean;
  objectKey: string;
  currentPersona: string;
  currentStatus: string;
  /** The org's own personas. Falls back to the BSR demo set when not provided. */
  personaOptions?: PersonaOption[];
  onClose: () => void;
  onSubmit: (value: EditRecordValue) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [persona, setPersona] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusOptions = STATUS_OPTIONS[objectKey] ?? [];
  const personaChoices =
    personaOptions?.length ? personaOptions : OFFICIAL_PERSONA_MAPPINGS.map((key) => ({ key, label: personaLabel(key) }));
  const canSubmit = (persona || status) && !pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const result = await onSubmit({ persona: persona || undefined, status: status || undefined });
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? "Could not save changes.");
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit record"
      description="Reassign this record's persona or change its status. Internal only — nothing goes outbound."
      width={460}
      footer={
        <>
          <button type="button" className="mbtn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form="edit-record-form" className="mbtn gold" disabled={!canSubmit}>
            {pending ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <form id="edit-record-form" className="mform" onSubmit={submit}>
        <label className="mfield">
          <span className="mlabel">
            Persona {currentPersona && <span className="mopt">now: {currentPersona}</span>}
          </span>
          <select value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="">Keep current</option>
            {personaChoices.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {statusOptions.length > 0 && (
          <label className="mfield">
            <span className="mlabel">
              Status {currentStatus && <span className="mopt">now: {currentStatus}</span>}
            </span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Keep current</option>
              {statusOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {titleize(opt)}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <div className="mError">{error}</div>}
      </form>
    </Modal>
  );
}

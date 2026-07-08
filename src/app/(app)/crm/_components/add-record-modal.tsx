"use client";

import { useState } from "react";

import { OFFICIAL_PERSONA_MAPPINGS } from "@/domain";

import { Modal } from "../../_components/modal";
import { type CrmObjectKey } from "@/lib/crm/read-model";

export type AddRecordValue = {
  name: string;
  persona?: string;
  status?: string;
  detail?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

type FieldConfig = {
  nameLabel: string;
  namePlaceholder: string;
  multiline?: boolean;
  detail?: { label: string; placeholder: string; type?: string };
  /** Renders required City / State / ZIP fields (properties). */
  address?: boolean;
  /** Persona is a required DB column for this object (leads). */
  personaRequired?: boolean;
  status: { label: string; options: string[] };
};

const FORM: Record<CrmObjectKey, FieldConfig> = {
  companies: {
    nameLabel: "Company name",
    namePlaceholder: "Acme Restoration Co.",
    detail: { label: "Website", placeholder: "https://example.com", type: "url" },
    status: { label: "Status", options: ["active", "prospect", "inactive"] },
  },
  contacts: {
    nameLabel: "Full name",
    namePlaceholder: "Jane Doe",
    detail: { label: "Email", placeholder: "jane@company.com", type: "email" },
    status: { label: "Status", options: ["active", "prospect", "inactive"] },
  },
  properties: {
    nameLabel: "Street address",
    namePlaceholder: "123 N Main St",
    address: true,
    status: { label: "Status", options: ["active", "inactive"] },
  },
  leads: {
    nameLabel: "Lead summary",
    namePlaceholder: "Burst supply line flooded a finished basement overnight…",
    multiline: true,
    detail: { label: "Source", placeholder: "web_form, partner_referral…" },
    personaRequired: true,
    status: { label: "Status", options: ["new", "needs_review", "qualified"] },
  },
  jobs: {
    nameLabel: "Job number or title",
    namePlaceholder: "BSR-2042 — Water mitigation",
    status: { label: "Status", options: ["scheduled", "in_progress", "completed"] },
  },
  outcomes: {
    nameLabel: "Outcome title",
    namePlaceholder: "Evanston fire rebuild",
    status: { label: "Status", options: ["won", "lost"] },
  },
};

function titleize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function personaLabel(key: string): string {
  return titleize(key.replace(/^persona_/, ""));
}

export function AddRecordModal({
  open,
  objectKey,
  singular,
  onClose,
  onSubmit,
}: {
  open: boolean;
  objectKey: CrmObjectKey;
  singular: string;
  onClose: () => void;
  /** Returns the outcome so the modal can surface an error and stay open on failure. */
  onSubmit: (value: AddRecordValue) => Promise<{ ok: boolean; error?: string }>;
}) {
  const cfg = FORM[objectKey];
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [persona, setPersona] = useState("");
  const [status, setStatus] = useState(cfg.status.options[0]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The board remounts this component (via `key`) on each open and object
  // change, so the fields above initialize fresh — no reset effect needed.
  // Required fields mirror the DB's NOT-NULL columns: address parts for
  // properties, a persona for leads.
  const addressOk = !cfg.address || (city.trim() && stateVal.trim() && postalCode.trim());
  const personaOk = !cfg.personaRequired || !!persona;
  const canSubmit = name.trim().length > 0 && !!addressOk && personaOk && !pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const result = await onSubmit({
      name: name.trim(),
      persona: persona || undefined,
      status,
      detail: detail.trim() || undefined,
      city: city.trim() || undefined,
      state: stateVal.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
    });
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? "Could not add the record.");
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add ${singular}`}
      description="Internal CRM record. Nothing is sent, published, or contacted — Arc only uses it to organize work."
      footer={
        <>
          <button type="button" className="mbtn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form="add-record-form" className="mbtn gold" disabled={!canSubmit}>
            {pending ? "Adding…" : `Add ${singular}`}
          </button>
        </>
      }
    >
      <form id="add-record-form" className="mform" onSubmit={submit}>
        <label className="mfield">
          <span className="mlabel">{cfg.nameLabel}</span>
          {cfg.multiline ? (
            <textarea
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={cfg.namePlaceholder}
              rows={3}
              required
            />
          ) : (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={cfg.namePlaceholder} required />
          )}
        </label>

        {cfg.detail && (
          <label className="mfield">
            <span className="mlabel">
              {cfg.detail.label} <span className="mopt">optional</span>
            </span>
            <input
              type={cfg.detail.type ?? "text"}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={cfg.detail.placeholder}
            />
          </label>
        )}

        {cfg.address && (
          <div className="mrow">
            <label className="mfield">
              <span className="mlabel">City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Chicago" required />
            </label>
            <label className="mfield" style={{ maxWidth: 90 }}>
              <span className="mlabel">State</span>
              <input value={stateVal} onChange={(e) => setStateVal(e.target.value)} placeholder="IL" maxLength={2} required />
            </label>
            <label className="mfield" style={{ maxWidth: 120 }}>
              <span className="mlabel">ZIP</span>
              <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="60614" required />
            </label>
          </div>
        )}

        <div className="mrow">
          <label className="mfield">
            <span className="mlabel">
              Persona {cfg.personaRequired ? null : <span className="mopt">optional</span>}
            </span>
            <select value={persona} onChange={(e) => setPersona(e.target.value)} required={cfg.personaRequired}>
              <option value="">{cfg.personaRequired ? "Choose a persona…" : "No persona yet"}</option>
              {OFFICIAL_PERSONA_MAPPINGS.map((key) => (
                <option key={key} value={key}>
                  {personaLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <label className="mfield">
            <span className="mlabel">{cfg.status.label}</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {cfg.status.options.map((opt) => (
                <option key={opt} value={opt}>
                  {titleize(opt)}
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

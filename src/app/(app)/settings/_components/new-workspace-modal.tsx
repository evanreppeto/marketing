"use client";

import { useState } from "react";

import { INDUSTRY_OPTIONS } from "@/lib/personas/industry-templates";

import { Modal } from "../../_components/modal";

export type NewWorkspaceValue = { organizationName: string; workspaceName: string; workspaceType: string; industry: string };

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "company", label: "Company" },
  { value: "agency", label: "Agency" },
  { value: "individual", label: "Individual" },
];

export function NewWorkspaceModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: NewWorkspaceValue) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [organizationName, setOrganizationName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceType, setWorkspaceType] = useState("company");
  const [industry, setIndustry] = useState("general");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = workspaceName.trim().length > 0 && !pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const result = await onSubmit({
      organizationName: organizationName.trim() || workspaceName.trim(),
      workspaceName: workspaceName.trim(),
      workspaceType,
      industry,
    });
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? "Could not create the workspace.");
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New workspace"
      description="A workspace is its own brand, CRM, and Arc. You'll be the owner, and it becomes active immediately."
      footer={
        <>
          <button type="button" className="mbtn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form="new-workspace-form" className="mbtn gold" disabled={!canSubmit}>
            {pending ? "Creating…" : "Create workspace"}
          </button>
        </>
      }
    >
      <form id="new-workspace-form" className="mform" onSubmit={submit}>
        <label className="mfield">
          <span className="mlabel">Workspace name</span>
          <input
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="Summit Growth"
            required
          />
        </label>

        <div className="mrow">
          <label className="mfield">
            <span className="mlabel">
              Organization <span className="mopt">optional</span>
            </span>
            <input
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Defaults to the workspace name"
            />
          </label>
          <label className="mfield" style={{ maxWidth: 150 }}>
            <span className="mlabel">Type</span>
            <select value={workspaceType} onChange={(e) => setWorkspaceType(e.target.value)}>
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mfield">
          <span className="mlabel">Industry</span>
          <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
            {INDUSTRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <span className="mopt">Starts the workspace with relevant audiences and language.</span>
        </label>

        {error && <div className="mError">{error}</div>}
      </form>
    </Modal>
  );
}

"use client";

import { useState } from "react";

import { Modal } from "../../_components/modal";

export function NewFolderModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && !pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const result = await onSubmit(name.trim());
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? "Could not create the folder.");
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New folder"
      description="Organize your media store. Folders are internal — nothing here goes outbound."
      width={420}
      footer={
        <>
          <button type="button" className="mbtn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form="new-folder-form" className="mbtn gold" disabled={!canSubmit}>
            {pending ? "Creating…" : "Create folder"}
          </button>
        </>
      }
    >
      <form id="new-folder-form" className="mform" onSubmit={submit}>
        <label className="mfield">
          <span className="mlabel">Folder name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Before & After / Proof" required />
        </label>
        {error && <div className="mError">{error}</div>}
      </form>
    </Modal>
  );
}

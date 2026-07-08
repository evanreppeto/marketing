"use client";

import { useState } from "react";

import { Modal } from "../../_components/modal";

export type ImportUrlValue = { url: string; name?: string };

export function ImportUrlModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: ImportUrlValue) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = url.trim().length > 0 && !pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const result = await onSubmit({ url: url.trim(), name: name.trim() || undefined });
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? "Could not import that URL.");
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import from URL"
      description="Pull an image, video, or PDF in by link. Imported media is held for provenance review before Arc may reuse it — nothing goes outbound."
      footer={
        <>
          <button type="button" className="mbtn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form="import-url-form" className="mbtn gold" disabled={!canSubmit}>
            {pending ? "Importing…" : "Import"}
          </button>
        </>
      }
    >
      <form id="import-url-form" className="mform" onSubmit={submit}>
        <label className="mfield">
          <span className="mlabel">Asset URL</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/roof-photo.jpg"
            required
          />
        </label>
        <label className="mfield">
          <span className="mlabel">
            Name <span className="mopt">optional</span>
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the file name" />
        </label>
        {error && <div className="mError">{error}</div>}
      </form>
    </Modal>
  );
}

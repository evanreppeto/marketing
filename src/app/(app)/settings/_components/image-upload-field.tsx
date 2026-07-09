"use client";

import { useRef, useState, useTransition } from "react";

import type { BrandingResult } from "../branding-actions";

type Props = {
  /** Current image URL, or null to show the initials fallback. */
  currentUrl: string | null;
  /** Initials shown when there's no image. */
  fallback: string;
  /** "square" for a logo, "circle" for an avatar. */
  shape?: "square" | "circle";
  uploadAction: (formData: FormData) => Promise<BrandingResult>;
  removeAction: () => Promise<BrandingResult>;
};

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";

/**
 * Compact image-upload control for a settings Row: a preview thumbnail plus
 * Upload/Replace + Remove. Submits the chosen file to a server action as
 * FormData and reflects the returned URL. Errors surface inline without losing
 * the previously-shown image.
 */
export function ImageUploadField({ currentUrl, fallback, shape = "square", uploadAction, removeAction }: Props) {
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = ""; // let the same file be re-picked after a remove
    if (!chosen) return;
    setError(null);
    const formData = new FormData();
    formData.append("file", chosen);
    start(async () => {
      const result = await uploadAction(formData);
      if (result.ok) setUrl(result.url);
      else setError(result.error);
    });
  }

  function onRemove() {
    setError(null);
    start(async () => {
      const result = await removeAction();
      if (result.ok) setUrl(null);
      else setError(result.error);
    });
  }

  return (
    <div className="imgup">
      <div className="imgup-row">
        <span className={`imgup-pv${shape === "circle" ? " circle" : ""}`}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded URL; next/image would need per-host remotePatterns
            <img src={url} alt="" />
          ) : (
            <span className="imgup-fb">{fallback}</span>
          )}
        </span>
        <button type="button" className="btn sm" disabled={pending} onClick={() => inputRef.current?.click()}>
          {pending ? "Uploading…" : url ? "Replace" : "Upload"}
        </button>
        {url && (
          <button type="button" className="btn sm" disabled={pending} onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      {error && <div className="imgup-err">{error}</div>}
      <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={onPick} />
    </div>
  );
}

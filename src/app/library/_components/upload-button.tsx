"use client";

import { useRef, useState, useTransition } from "react";

import { buttonClasses } from "@/app/_components/page-header";

import { UploadIcon } from "./icons";
import { uploadAssetsAction } from "../actions";

/**
 * Gold primary upload button. Owns a hidden multi-file input; on change it
 * builds a FormData (carrying the active folderId) and submits it to the
 * uploadAssetsAction server action inside a transition so the button can show
 * a pending state. After the action's revalidatePath the page re-renders with
 * the new assets — no manual refetch needed.
 */
export function UploadButton({ activeFolderId }: { activeFolderId: string | null }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    if (activeFolderId) formData.set("folderId", activeFolderId);
    for (const file of Array.from(files)) formData.append("files", file);

    setMessage(null);
    startTransition(async () => {
      try {
        await uploadAssetsAction(formData);
        setMessage(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}.`);
      } catch {
        setMessage("Upload failed.");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {message ? (
        <span className="text-xs font-medium text-[var(--text-muted)]" aria-live="polite">
          {message}
        </span>
      ) : null}
      <button
        type="button"
        className={buttonClasses({ variant: "primary", size: "sm" })}
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        <UploadIcon className="h-3.5 w-3.5" />
        {pending ? "Uploading..." : "Upload"}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          upload(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

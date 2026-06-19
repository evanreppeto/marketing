"use client";

import Link from "next/link";
import { useActionState } from "react";

import { buttonClasses } from "@/app/_components/page-header";

import { importFromGoogleDriveAction } from "../actions";

export function GoogleDriveImport({ activeFolderId }: { activeFolderId: string | null }) {
  const [state, action, pending] = useActionState(importFromGoogleDriveAction, null);

  return (
    <details className="group relative">
      <summary className={buttonClasses({ variant: "ghost", size: "sm" })}>
        <DriveIcon />
        Drive
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-md border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-4 shadow-[var(--elev-overlay)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[var(--text-primary)]">Import from Google Drive</div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              Paste selected Drive file links or IDs. Arc copies them into Library.
            </p>
          </div>
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/api/integrations/google-drive/connect">
            Connect
          </Link>
        </div>
        <form action={action} className="mt-3 grid gap-3">
          {activeFolderId ? <input name="folderId" type="hidden" value={activeFolderId} /> : null}
          <textarea
            className="min-h-24 resize-y rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            name="driveFiles"
            placeholder="https://drive.google.com/file/d/.../view"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {state ? (
              <p className={`text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>
                {state.message}
              </p>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">Manual import only. No background sync.</p>
            )}
            <button className={buttonClasses({ variant: "primary", size: "sm" })} disabled={pending} type="submit">
              {pending ? "Importing..." : "Import"}
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}

function DriveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 4h6l6 10-3 6H6l-3-6z" />
      <path d="M9 4 3 14" />
      <path d="m15 4 6 10" />
      <path d="M6 20 12 9l6 11" />
    </svg>
  );
}

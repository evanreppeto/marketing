"use client";

import { useActionState, useRef } from "react";
import { CheckCircle2, FileUp, RefreshCw, TriangleAlert, UploadCloud } from "lucide-react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import { type BrandUploadActionState, uploadAndAnalyzeBrandSourcesAction } from "@/app/brand/actions";

const initialState: BrandUploadActionState = null;

function resultTone(state: BrandUploadActionState) {
  if (!state) return "gray";
  return state.ok ? "green" : "red";
}

export function BrandSourceUpload({ placement = "inline" }: { placement?: "hero" | "inline" }) {
  const [state, action, pending] = useActionState(uploadAndAnalyzeBrandSourcesAction, initialState);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isHero = placement === "hero";

  return (
    <form
      action={action}
      className={isHero ? "self-start bg-[var(--surface-panel)] p-5" : "border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] p-5"}
      encType="multipart/form-data"
    >
      <div className="rounded-md border border-dashed border-[var(--accent-border-strong)] bg-[var(--surface-soft)] p-4 transition hover:border-[var(--accent)] hover:bg-[var(--surface-inset)]">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <label className="flex min-w-0 cursor-pointer items-center gap-4 text-sm text-[var(--text-secondary)]">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--accent)]">
              <UploadCloud aria-hidden className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className={isHero ? "block text-base font-bold text-[var(--text-primary)]" : "block text-sm font-bold text-[var(--text-primary)]"}>
                Upload files to update the brand
              </span>
              <span className="mt-1 block text-sm leading-6 text-[var(--text-muted)]">
                Brand guides, voice docs, offerings, proof, rules, logos, photos, moodboards, or reference media.
              </span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {["Docs", "Images", "Logos", "Proof"].map((item) => (
                  <span
                    className="rounded border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]"
                    key={item}
                  >
                    {item}
                  </span>
                ))}
              </span>
            </span>
            <input
              accept="application/pdf,image/*,image/svg+xml,.svg,.ico"
              className="sr-only"
              multiple
              name="files"
              ref={inputRef}
              type="file"
            />
          </label>
          <button className={buttonClasses({ variant: "primary", size: "sm", className: "justify-center" })} disabled={pending} type="submit">
            {pending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <FileUp aria-hidden className="h-4 w-4" />}
            {pending ? "Analyzing..." : "Upload and analyze"}
          </button>
        </div>
      </div>
      {state ? (
        <div className="mt-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={resultTone(state)}>{state.ok ? "Analyzed" : "Needs attention"}</StatusPill>
            <span className="text-sm font-bold text-[var(--text-primary)]">{state.message}</span>
          </div>
          <ul className="mt-2 grid gap-1.5">
            {state.items.map((item) => (
              <li className="flex gap-2 text-xs leading-5 text-[var(--text-secondary)]" key={item}>
                {state.ok ? (
                  <CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ok)]" />
                ) : (
                  <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--danger)]" />
                )}
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

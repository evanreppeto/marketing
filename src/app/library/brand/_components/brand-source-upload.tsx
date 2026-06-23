"use client";

import { useActionState, useRef, useState } from "react";
import { CheckCircle2, FileUp, Globe2, Link2, RefreshCw, Send, TriangleAlert, UploadCloud } from "lucide-react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import {
  importAndAnalyzeBrandNotesAction,
  importAndAnalyzeBrandUrlAction,
  importAndAnalyzeBrandWebsiteAction,
  type BrandNotesActionState,
  type BrandUploadActionState,
  type BrandUrlImportActionState,
  type BrandWebsiteImportActionState,
  uploadAndAnalyzeBrandSourcesAction,
} from "@/app/library/brand/actions";

const initialUploadState: BrandUploadActionState = null;
const initialNotesState: BrandNotesActionState = null;
const initialUrlState: BrandUrlImportActionState = null;
const initialWebsiteState: BrandWebsiteImportActionState = null;

function resultTone(state: BrandUploadActionState) {
  if (!state) return "gray";
  return state.ok ? "green" : "red";
}

export function BrandSourceUpload({ placement = "inline" }: { placement?: "hero" | "inline" }) {
  const [notesState, notesAction, notesPending] = useActionState(importAndAnalyzeBrandNotesAction, initialNotesState);
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadAndAnalyzeBrandSourcesAction, initialUploadState);
  const [urlState, urlAction, urlPending] = useActionState(importAndAnalyzeBrandUrlAction, initialUrlState);
  const [websiteState, websiteAction, websitePending] = useActionState(importAndAnalyzeBrandWebsiteAction, initialWebsiteState);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const isHero = placement === "hero";
  const hasFiles = selectedFiles.length > 0;
  const selectedLabel =
    selectedFiles.length === 0
      ? "PDFs, docs, logos, images"
      : selectedFiles.length === 1
        ? selectedFiles[0]
        : `${selectedFiles.length} files selected`;

  function handleFileButtonClick() {
    if (!hasFiles) inputRef.current?.click();
  }

  return (
    <section
      className={cx(
        "bg-[var(--surface-panel)]",
        isHero ? "p-5 sm:p-6" : "border-b border-[var(--border-hairline)] p-5",
      )}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="signal-eyebrow">Add brand knowledge</div>
          <h2 className="mt-1 text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Tell Arc what changed</h2>
          <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">
            Add messy notes, upload source files, or import a website. Arc saves the source and learns from it, so the brand can keep improving over time.
          </p>
        </div>
        <StatusPill tone="blue">Source first</StatusPill>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <form action={notesAction} className="grid gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
          <label className="grid gap-2" htmlFor="brand-intake-notes">
            <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Send aria-hidden className="h-4 w-4 text-[var(--accent)]" />
              Paste brand notes
            </span>
            <textarea
              className="min-h-40 w-full resize-y rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 py-3 text-sm leading-6 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              id="brand-intake-notes"
              name="brandNotes"
              placeholder="What do you do? Who do you serve? What should Arc say or avoid? Paste personas, proof, offers, rules, tone, positioning, or notes from a client call."
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[52ch] text-xs leading-5 text-[var(--text-muted)]">Good for quick updates, new personas, claims to avoid, offers, voice notes, and client-specific context.</p>
            <button className={buttonClasses({ variant: "primary", size: "sm", className: "min-h-10 justify-center" })} disabled={notesPending} type="submit">
              {notesPending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4" />}
              {notesPending ? "Saving..." : "Save notes"}
            </button>
          </div>
          {notesState ? <ResultPanel state={notesState} /> : null}
        </form>

        <div className="grid content-start gap-3">
          <form action={uploadAction} className="grid gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
            <label className="grid gap-2">
              <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <UploadCloud aria-hidden className="h-4 w-4 text-[var(--accent)]" />
                Upload files
              </span>
              <span className="rounded-[8px] border border-dashed border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 py-3 text-sm text-[var(--text-secondary)]">
                {selectedLabel}
              </span>
              <input
                accept="application/pdf,image/*,image/svg+xml,.svg,.ico"
                className="sr-only"
                multiple
                name="files"
                onChange={(event) => {
                  setSelectedFiles(Array.from(event.currentTarget.files ?? []).map((file) => file.name));
                }}
                ref={inputRef}
                type="file"
              />
            </label>
            <button
              className={buttonClasses({ variant: hasFiles ? "primary" : "ghost", size: "sm", className: "min-h-10 justify-center" })}
              disabled={uploadPending}
              onClick={handleFileButtonClick}
              type={hasFiles ? "submit" : "button"}
            >
              {uploadPending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <FileUp aria-hidden className="h-4 w-4" />}
              {uploadPending ? "Analyzing..." : hasFiles ? "Upload and analyze" : "Choose files"}
            </button>
            {uploadState ? <ResultPanel state={uploadState} /> : null}
          </form>

          <form action={websiteAction} className="grid gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
            <label className="grid gap-2">
              <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Globe2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
                Import website
              </span>
              <input
                className="min-h-10 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                name="websiteUrl"
                placeholder="https://example.com"
                type="url"
              />
            </label>
            <button className={buttonClasses({ variant: "ghost", size: "sm", className: "min-h-10 justify-center" })} disabled={websitePending} type="submit">
              {websitePending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Globe2 aria-hidden className="h-4 w-4" />}
              {websitePending ? "Importing..." : "Import site"}
            </button>
            {websiteState ? <ResultPanel state={websiteState} /> : null}
          </form>

          <form action={urlAction} className="grid gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
            <label className="grid gap-2">
              <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Link2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
                Add one page
              </span>
              <input
                className="min-h-10 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                name="url"
                placeholder="https://example.com/about"
                type="url"
              />
            </label>
            <button className={buttonClasses({ variant: "ghost", size: "sm", className: "min-h-10 justify-center" })} disabled={urlPending} type="submit">
              {urlPending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Link2 aria-hidden className="h-4 w-4" />}
              {urlPending ? "Reading..." : "Import page"}
            </button>
            {urlState ? <ResultPanel state={urlState} /> : null}
          </form>
        </div>
      </div>
    </section>
  );
}

function ResultPanel({ state }: { state: NonNullable<BrandUploadActionState> }) {
  return (
    <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={resultTone(state)}>{state.ok ? "Saved" : "Needs attention"}</StatusPill>
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
  );
}

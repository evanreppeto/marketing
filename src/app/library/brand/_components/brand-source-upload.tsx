"use client";

import { useActionState, useRef, useState } from "react";
import { CheckCircle2, FileUp, Link2, RefreshCw, TriangleAlert, UploadCloud } from "lucide-react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import { theme } from "@/app/_components/theme";
import {
  importAndAnalyzeBrandUrlAction,
  importAndAnalyzeBrandWebsiteAction,
  type BrandUploadActionState,
  type BrandUrlImportActionState,
  type BrandWebsiteImportActionState,
  uploadAndAnalyzeBrandSourcesAction,
} from "@/app/library/brand/actions";

const initialState: BrandUploadActionState = null;
const initialUrlState: BrandUrlImportActionState = null;
const initialWebsiteState: BrandWebsiteImportActionState = null;

function resultTone(state: BrandUploadActionState) {
  if (!state) return "gray";
  return state.ok ? "green" : "red";
}

export function BrandSourceUpload({ placement = "inline" }: { placement?: "hero" | "inline" }) {
  const [state, action, pending] = useActionState(uploadAndAnalyzeBrandSourcesAction, initialState);
  const [urlState, urlAction, urlPending] = useActionState(importAndAnalyzeBrandUrlAction, initialUrlState);
  const [websiteState, websiteAction, websitePending] = useActionState(importAndAnalyzeBrandWebsiteAction, initialWebsiteState);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const isHero = placement === "hero";
  const hasFiles = selectedFiles.length > 0;
  const buttonLabel = pending ? "Analyzing..." : hasFiles ? "Upload and analyze" : "Choose files";
  const selectedLabel =
    selectedFiles.length === 0
      ? null
      : selectedFiles.length === 1
        ? selectedFiles[0]
        : `${selectedFiles.length} files selected`;

  function handlePrimaryClick() {
    if (!hasFiles) inputRef.current?.click();
  }

  return (
    <div className={isHero ? "self-start bg-[var(--surface-panel)] p-5" : "border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] p-5"}>
      <form action={action}>
        <div className={`${theme.surface.dashedEmpty} p-4 transition hover:border-[var(--accent)] hover:bg-[var(--surface-inset)]`}>
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
                onChange={(event) => {
                  setSelectedFiles(Array.from(event.currentTarget.files ?? []).map((file) => file.name));
                }}
                ref={inputRef}
                type="file"
              />
            </label>
            <button
              className={buttonClasses({ variant: "primary", size: "sm", className: "justify-center" })}
              disabled={pending}
              onClick={handlePrimaryClick}
              type={hasFiles ? "submit" : "button"}
            >
              {pending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <FileUp aria-hidden className="h-4 w-4" />}
              {buttonLabel}
            </button>
          </div>
          {selectedLabel ? <div className="mt-3 truncate text-xs font-semibold text-[var(--text-secondary)]">{selectedLabel}</div> : null}
        </div>
        {state ? <ResultPanel state={state} /> : null}
      </form>

      <form action={urlAction} className="mt-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="grid min-w-0 gap-2">
            <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Link2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
              Add single page
            </span>
            <input
              className="min-h-10 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              name="url"
              placeholder="https://example.com/about"
              type="url"
            />
          </label>
          <button className={buttonClasses({ variant: "ghost", size: "sm", className: "justify-center" })} disabled={urlPending} type="submit">
            {urlPending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Link2 aria-hidden className="h-4 w-4" />}
            {urlPending ? "Reading..." : "Import URL"}
          </button>
        </div>
        {urlState ? <ResultPanel state={urlState} /> : null}
      </form>

      <form action={websiteAction} className="mt-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="grid min-w-0 gap-2">
            <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Link2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
              Import key website pages
            </span>
            <input
              className="min-h-10 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              name="websiteUrl"
              placeholder="https://example.com"
              type="url"
            />
          </label>
          <button className={buttonClasses({ variant: "ghost", size: "sm", className: "justify-center" })} disabled={websitePending} type="submit">
            {websitePending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Link2 aria-hidden className="h-4 w-4" />}
            {websitePending ? "Crawling..." : "Import site"}
          </button>
        </div>
        {websiteState ? <ResultPanel state={websiteState} /> : null}
      </form>
    </div>
  );
}

function ResultPanel({ state }: { state: BrandUploadActionState }) {
  if (!state) return null;
  return (
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
  );
}

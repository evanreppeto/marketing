"use client";

import { useActionState, useRef, useState } from "react";
import { CheckCircle2, FileText, FileUp, Globe2, Link2, RefreshCw, Sparkles, TriangleAlert, UploadCloud } from "lucide-react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
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
    <div
      className={cx(
        "relative overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel)_96%,transparent),color-mix(in_srgb,var(--surface-inset)_88%,transparent))]",
        isHero ? "self-start p-5 sm:p-6" : "border-b border-[var(--border-hairline)] p-5",
      )}
    >
      <div aria-hidden className="absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_72%,transparent),transparent)]" />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="signal-eyebrow">Brand intake</div>
          <h3 className="mt-1 text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Teach Arc from source material</h3>
          <p className="mt-2 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">
            Upload brand files first, then add a public page or homepage when the best context lives online.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--surface-inset)] px-3.5 py-2 text-xs font-semibold text-[var(--accent-contrast)] shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
          <Sparkles aria-hidden className="h-4 w-4" />
          Files, URLs, and website pages
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(18rem,0.92fr)_minmax(0,1fr)]">
        <form action={action} className="grid gap-3.5">
          <label
            className="group relative grid min-h-[18rem] cursor-pointer place-items-center overflow-hidden rounded-[14px] border border-dashed border-[var(--accent-border-strong)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent-soft)_26%,var(--surface-soft)),var(--surface-inset))] p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent-soft)_36%,var(--surface-soft)),var(--surface-inset))] sm:min-h-[20rem] sm:p-7"
          >
            <span className="absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent),transparent)]" />
            <span className="flex h-16 w-16 items-center justify-center rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel)] text-[var(--accent)] shadow-[var(--elev-panel)] transition duration-200 ease-out group-hover:-translate-y-1">
              <UploadCloud aria-hidden className="h-6 w-6" />
            </span>
            <span className="mt-5 block text-lg font-bold tracking-[-0.01em] text-[var(--text-primary)]">Upload brand files</span>
            <span className="mt-2 block max-w-[42ch] text-sm leading-6 text-[var(--text-secondary)]">
              Brand guides, voice docs, offerings, proof, rules, logos, photos, moodboards, or reference media.
            </span>
            <span className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
              <FileText aria-hidden className="h-4 w-4 text-[var(--accent)]" />
              <span className="truncate">{selectedLabel || "Attach files"}</span>
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["Docs", "Images", "Logos", "Proof"].map((item) => (
              <span
                className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
          <button
            className={buttonClasses({ variant: "primary", size: "sm", className: "min-h-11 justify-center px-5" })}
            disabled={pending}
            onClick={handlePrimaryClick}
            type={hasFiles ? "submit" : "button"}
          >
            {pending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <FileUp aria-hidden className="h-4 w-4" />}
            {buttonLabel}
          </button>
          {state ? <ResultPanel state={state} /> : null}
        </form>

        <div className="grid content-start gap-4 rounded-[14px] border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_72%,transparent)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
          <form action={urlAction} className="grid gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
            <label className="grid min-w-0 gap-2">
              <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Link2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
                Add single page
              </span>
              <input
                className="min-h-11 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                name="url"
                placeholder="https://example.com/about"
                type="url"
              />
            </label>
            <button
              className={buttonClasses({ variant: "ghost", size: "sm", className: "min-h-10 justify-center" })}
              disabled={urlPending}
              type="submit"
            >
              {urlPending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Link2 aria-hidden className="h-4 w-4" />}
              {urlPending ? "Reading..." : "Import URL"}
            </button>
            {urlState ? <ResultPanel state={urlState} /> : null}
          </form>

          <form action={websiteAction} className="grid gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
            <label className="grid min-w-0 gap-2">
              <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Globe2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
                Import key website pages
              </span>
              <input
                className="min-h-11 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                name="websiteUrl"
                placeholder="https://example.com"
                type="url"
              />
            </label>
            <button
              className={buttonClasses({ variant: "ghost", size: "sm", className: "min-h-10 justify-center" })}
              disabled={websitePending}
              type="submit"
            >
              {websitePending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Globe2 aria-hidden className="h-4 w-4" />}
              {websitePending ? "Crawling..." : "Import site"}
            </button>
            {websiteState ? <ResultPanel state={websiteState} /> : null}
          </form>
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ state }: { state: BrandUploadActionState }) {
  if (!state) return null;
  return (
    <div className="mt-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
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

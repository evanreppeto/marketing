"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, FileText, Globe2, LoaderCircle, Send, Sparkles, TriangleAlert, UploadCloud } from "lucide-react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import { cx, theme } from "@/app/_components/theme";
import { submitBrandIntakeAction, type BrandIntakeActionState } from "@/app/brand/actions";

const initialState: BrandIntakeActionState = null;

function resultTone(state: BrandIntakeActionState) {
  if (!state) return "gray";
  return state.ok ? "green" : "red";
}

export function BrandIntakePanel({ defaultWebsite = "" }: { defaultWebsite?: string }) {
  const [state, action, pending] = useActionState(submitBrandIntakeAction, initialState);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const selectedLabel =
    selectedFiles.length === 0
      ? "Attach files"
      : selectedFiles.length === 1
        ? selectedFiles[0]
        : `${selectedFiles.length} files selected`;

  return (
    <form
      action={action}
      className="relative overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel)_96%,transparent),color-mix(in_srgb,var(--surface-inset)_88%,transparent))] shadow-[var(--elev-panel)]"
    >
      <div aria-hidden className="absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_72%,transparent),transparent)]" />
      <div className="border-b border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--accent-soft)_10%,var(--surface-panel))] px-5 py-5 sm:px-7 sm:py-6">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0">
            <div className="signal-eyebrow">Brand intake</div>
            <h2 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Tell Arc about the brand</h2>
            <p className={cx("mt-2 max-w-[74ch] text-sm leading-6", theme.text.body)}>
              Upload the source material first. Arc saves it to Library, parses it, updates the profile where it can, and creates Brain notes for review.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--surface-inset)] px-3.5 py-2 text-xs font-semibold text-[var(--accent-contrast)] shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
            <Sparkles aria-hidden className="h-4 w-4" />
            Files, notes, and website in one pass
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:gap-6 sm:p-7 xl:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1fr)]">
        <div className="grid gap-3.5">
          <label
            className="group relative grid min-h-[18rem] cursor-pointer place-items-center overflow-hidden rounded-[14px] border border-dashed border-[var(--accent-border-strong)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent-soft)_26%,var(--surface-soft)),var(--surface-inset))] p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent-soft)_36%,var(--surface-soft)),var(--surface-inset))] sm:min-h-[20rem] sm:p-7"
            htmlFor="brand-intake-files"
          >
            <span className="absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent),transparent)]" />
            <span className="flex h-16 w-16 items-center justify-center rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel)] text-[var(--accent)] shadow-[var(--elev-panel)] transition duration-200 ease-out group-hover:-translate-y-1">
              <UploadCloud aria-hidden className="h-6 w-6" />
            </span>
            <span className="mt-5 block text-lg font-bold tracking-[-0.01em] text-[var(--text-primary)]">Upload brand files</span>
            <span className="mt-2 block max-w-[42ch] text-sm leading-6 text-[var(--text-secondary)]">
              PDFs, logos, photos, voice docs, persona docs, proof, offers, and examples.
            </span>
            <span className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
              <FileText aria-hidden className="h-4 w-4 text-[var(--accent)]" />
              <span className="truncate">{selectedLabel}</span>
            </span>
          </label>
          <input
            accept="application/pdf,image/*,image/svg+xml,.svg,.ico"
            className="sr-only"
            id="brand-intake-files"
            multiple
            name="files"
            onChange={(event) => {
              setSelectedFiles(Array.from(event.currentTarget.files ?? []).map((file) => file.name));
            }}
            type="file"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["Brand guide", "Logos", "Personas", "Proof"].map((item) => (
              <span
                className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="grid content-start gap-4 rounded-[14px] border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_72%,transparent)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
          <label className="grid gap-2" htmlFor="brand-intake-notes">
            <span className="text-sm font-bold text-[var(--text-primary)]">Add context</span>
            <textarea
              className="min-h-48 w-full resize-y rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3.5 py-3 text-sm leading-6 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              id="brand-intake-notes"
              name="brandNotes"
              placeholder="Add anything the files may not say clearly: what you do, who you serve, tone, offers, ideals, banned claims, personas, objections, examples."
            />
          </label>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] lg:items-end">
            <label className="grid min-w-0 gap-2" htmlFor="brand-intake-website">
              <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Globe2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
                Website
              </span>
              <input
                className="min-h-11 w-full rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                defaultValue={defaultWebsite}
                id="brand-intake-website"
                name="websiteUrl"
                placeholder="https://company.com"
                type="url"
              />
            </label>

            <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
              <button className={buttonClasses({ variant: "primary", size: "sm", className: "min-h-11 justify-center px-5" })} disabled={pending} type="submit">
                {pending ? <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4" />}
                {pending ? "Analyzing..." : "Teach Arc"}
              </button>
            </div>
          </div>

          {state ? (
            <div className="rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4" aria-live="polite">
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
          ) : null}
        </div>
      </div>
    </form>
  );
}

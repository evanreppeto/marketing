"use client";

import { useActionState } from "react";
import { Globe2, Palette, RefreshCw, Sparkles, Wand2 } from "lucide-react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import {
  analyzeBrandDesignFromWebsiteAction,
  applyBrandDesignAction,
  type BrandDesignAnalyzeState,
  type BrandDesignApplyState,
} from "@/app/library/brand/actions";

const initialAnalyze: BrandDesignAnalyzeState = null;
const initialApply: BrandDesignApplyState = null;

export function BrandDesignImport() {
  const [analyzeState, analyzeAction, analyzing] = useActionState(analyzeBrandDesignFromWebsiteAction, initialAnalyze);
  const [applyState, applyAction, applying] = useActionState(applyBrandDesignAction, initialApply);

  const proposal = analyzeState?.ok ? analyzeState.proposal : null;
  const swatches = proposal
    ? ([proposal.palette.primary, proposal.palette.secondary, proposal.palette.accent, proposal.palette.dark, proposal.palette.light].filter(Boolean) as string[])
    : [];

  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">
            <Wand2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
            Pull brand design from your website
          </h3>
          <p className="mt-1.5 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">
            Paste your homepage and Arc will detect your logo, colors, and fonts. You review before anything is applied.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
          <Sparkles aria-hidden className="h-3.5 w-3.5 text-[var(--accent)]" />
          Logo, colors, fonts
        </span>
      </div>

      <form action={analyzeAction} className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-[16rem] flex-1 gap-1.5">
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Globe2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
            Website URL
          </span>
          <input
            className="min-h-11 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            name="websiteUrl"
            placeholder="https://yourcompany.com"
            type="url"
          />
        </label>
        <button className={buttonClasses({ variant: "primary", size: "sm", className: "min-h-11" })} disabled={analyzing} type="submit">
          {analyzing ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Palette aria-hidden className="h-4 w-4" />}
          {analyzing ? "Reading site..." : "Pull design"}
        </button>
      </form>

      {analyzeState && !analyzeState.ok ? (
        <div className="mt-3"><StatusPill tone="red">{analyzeState.message}</StatusPill></div>
      ) : null}

      {proposal ? (
        <form action={applyAction} className="mt-4 grid gap-4 rounded-[12px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
          <div className="flex flex-wrap items-center gap-5">
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Logo</span>
              {proposal.logoUrl ? (
                <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-white p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="Detected logo" className="h-full w-full object-contain" src={proposal.logoUrl} />
                </span>
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-xl border border-dashed border-[var(--border-hairline)] text-[10px] text-[var(--text-muted)]">None</span>
              )}
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Colors</span>
              <div className="flex flex-wrap gap-2">
                {swatches.length > 0 ? swatches.map((hex) => (
                  <span key={hex} className="grid gap-1 text-center">
                    <span className="block h-8 w-12 rounded-md border border-[var(--border-hairline)]" style={{ backgroundColor: hex }} />
                    <span className="font-mono text-[10px] uppercase text-[var(--text-muted)]">{hex}</span>
                  </span>
                )) : <span className="text-sm text-[var(--text-muted)]">None detected</span>}
              </div>
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Fonts</span>
              <div className="text-sm text-[var(--text-secondary)]">
                <div>Headings · {proposal.headingFont ?? "—"}</div>
                <div>Body · {proposal.bodyFont ?? "—"}</div>
              </div>
            </div>
          </div>

          {/* Carry the reviewed proposal to the apply action. */}
          <input type="hidden" name="logoUrl" value={proposal.logoUrl ?? ""} />
          <input type="hidden" name="faviconUrl" value={proposal.faviconUrl ?? ""} />
          <input type="hidden" name="primary" value={proposal.palette.primary ?? ""} />
          <input type="hidden" name="secondary" value={proposal.palette.secondary ?? ""} />
          <input type="hidden" name="accent" value={proposal.palette.accent ?? ""} />
          <input type="hidden" name="dark" value={proposal.palette.dark ?? ""} />
          <input type="hidden" name="light" value={proposal.palette.light ?? ""} />
          <input type="hidden" name="headingFont" value={proposal.headingFont ?? ""} />
          <input type="hidden" name="bodyFont" value={proposal.bodyFont ?? ""} />
          <input type="hidden" name="sourceUrl" value={proposal.sourceUrl} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input className="h-4 w-4 accent-[var(--accent)]" name="overwrite" type="checkbox" />
              Overwrite values I&apos;ve already set
            </label>
            <div className="flex items-center gap-2">
              {applyState ? <StatusPill tone={applyState.ok ? "green" : "red"}>{applyState.message}</StatusPill> : null}
              <button className={buttonClasses({ variant: "primary", size: "sm" })} disabled={applying} type="submit">
                {applying ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Wand2 aria-hidden className="h-4 w-4" />}
                {applying ? "Applying..." : "Apply to brand"}
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}

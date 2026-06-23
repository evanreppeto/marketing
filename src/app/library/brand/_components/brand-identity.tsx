import { FolderOpen, Globe, Pencil } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/app/_components/page-header";
import { INDUSTRY_TEMPLATES, type BrandColor, type BusinessProfile } from "@/domain";

const HEX = /^#[0-9a-fA-F]{6}$/;

function validHex(value: string | null | undefined): string | null {
  return value && HEX.test(value) ? value : null;
}

/** Pick black or white text for legibility on a given hex background. */
function readableInk(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}

function monogram(profile: BusinessProfile): string {
  if (profile.shortMark) return profile.shortMark.slice(0, 3).toUpperCase();
  const words = (profile.displayName || "Brand").trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function formatTokenLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function industryLabel(value: string | null | undefined): string {
  if (!value) return "";
  const template = INDUSTRY_TEMPLATES.find((item) => item.id === value);
  return template ? template.label : formatTokenLabel(value);
}

/**
 * Brand identity masthead — makes the page feel like the customer's own brand:
 * their logo (or a palette-tinted monogram), name, tagline, and a real swatch
 * row pulled from the saved brand palette. Replaces the generic PageHeader.
 */
export function BrandIdentity({ agentName, profile }: { agentName: string; profile: BusinessProfile }) {
  const logo = profile.logoUrl;
  const primary = validHex(profile.brandPalette.primary.hex);
  const tileBg = primary ?? "var(--accent)";
  const tileInk = primary ? readableInk(primary) : "var(--accent-contrast)";

  const swatches = ([
    profile.brandPalette.primary,
    profile.brandPalette.secondary,
    profile.brandPalette.accent,
    profile.brandPalette.dark,
    profile.brandPalette.light,
  ] as BrandColor[]).filter((color) => validHex(color.hex));

  const fonts = [profile.brandPalette.headingFont, profile.brandPalette.bodyFont].filter(Boolean);
  const website = profile.websiteUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const industry = industryLabel(profile.industry);

  return (
    <header className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
      <div aria-hidden className="h-1.5" style={{ backgroundColor: tileBg }} />
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            {logo ? (
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-white p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={`${profile.displayName || "Brand"} logo`} className="h-full w-full object-contain" src={logo} />
              </span>
            ) : (
              <span
                aria-label={`${profile.displayName || "Brand"} monogram`}
                className="grid h-16 w-16 shrink-0 place-items-center rounded-xl font-serif text-2xl font-semibold tracking-[-0.02em]"
                style={{ backgroundColor: tileBg, color: tileInk }}
              >
                {monogram(profile)}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="font-serif text-[clamp(1.6rem,2.4vw,2.25rem)] font-semibold leading-[1.05] tracking-[-0.018em] text-[var(--text-primary)]">
                {profile.displayName || "Company brand"}
              </h1>
              <p className="mt-1 max-w-[60ch] text-sm leading-6 text-[var(--text-secondary)]">
                {profile.tagline ||
                  `Add your logo, colors, and tagline so this page looks like your brand — then teach ${agentName} from your files.`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                {industry ? <span>{industry}</span> : null}
                {industry && website ? <span aria-hidden>·</span> : null}
                {website ? (
                  <a
                    className="inline-flex items-center gap-1.5 transition hover:text-[var(--text-primary)]"
                    href={profile.websiteUrl ?? "#"}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <Globe aria-hidden className="h-3.5 w-3.5" />
                    {website}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/library">
              <FolderOpen aria-hidden className="h-4 w-4" />
              Add files
            </Link>
            <Link className={buttonClasses({ variant: "primary", size: "sm" })} href="#edit-brand">
              <Pencil aria-hidden className="h-4 w-4" />
              Edit brand
            </Link>
          </div>
        </div>

        {swatches.length > 0 ? (
          <div className="border-t border-[var(--border-hairline)] pt-4">
            <div className="flex flex-wrap items-end gap-3">
              {swatches.map((color) => (
                <div className="min-w-0" key={color.hex + color.label}>
                  <span
                    className="block h-12 w-20 rounded-md border border-[var(--border-hairline)]"
                    style={{ backgroundColor: color.hex }}
                  />
                  <div className="mt-1.5 truncate text-xs font-semibold text-[var(--text-primary)]">{color.label || "Color"}</div>
                  <div className="font-mono text-[11px] uppercase text-[var(--text-muted)]">{color.hex}</div>
                </div>
              ))}
              {fonts.length > 0 ? (
                <div className="ml-1 self-start border-l border-[var(--border-hairline)] pl-4 text-xs text-[var(--text-secondary)]">
                  <div className="font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Type</div>
                  {profile.brandPalette.headingFont ? <div className="mt-1.5">Headings · {profile.brandPalette.headingFont}</div> : null}
                  {profile.brandPalette.bodyFont ? <div>Body · {profile.brandPalette.bodyFont}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-4 text-sm text-[var(--text-secondary)]">
            <span>No brand colors yet.</span>
            <Link className="font-semibold text-[var(--accent-contrast)] underline-offset-2 hover:underline" href="#edit-brand">
              Add your palette
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

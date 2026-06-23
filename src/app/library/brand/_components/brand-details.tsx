"use client";

import { Building2, ChevronDown, FileText, MessageSquareQuote, Pencil, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { buttonClasses } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import { INDUSTRY_TEMPLATES, type BusinessProfile } from "@/domain";

import { BrandProfileEditor } from "./brand-profile-editor";

export type ApprovedFact = { id: string; label: string; kind: string };

function formatTokenLabel(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatIndustryLabel(value: string | null | undefined) {
  if (!value) return "";
  const template = INDUSTRY_TEMPLATES.find((item) => item.id === value);
  return template ? template.label : formatTokenLabel(value);
}

function factType(kind: string) {
  switch (kind) {
    case "brand_fact":
      return "Fact";
    case "proof_point":
      return "Proof";
    case "persona":
      return "Persona";
    case "messaging_angle":
      return "Message";
    case "cta":
      return "CTA";
    case "service":
      return "Offering";
    default:
      return "Note";
  }
}

/**
 * Zone 3 — "Brand at a glance". A calm read-only summary of the profile Arc
 * uses. The full editor (BrandProfileEditor, with its own wired save action)
 * stays collapsed until the operator chooses to edit.
 */
export function BrandDetails({
  approvedFacts,
  profile,
}: {
  approvedFacts: ApprovedFact[];
  profile: BusinessProfile;
}) {
  const [editing, setEditing] = useState(false);

  // Open the editor when the page is targeted at #edit-brand (e.g. the masthead
  // "Edit brand" action), on initial load and on later hash changes.
  useEffect(() => {
    const openIfTargeted = () => {
      if (window.location.hash === "#edit-brand") setEditing(true);
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, []);

  return (
    <section aria-labelledby="brand-details-heading" id="edit-brand">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]" id="brand-details-heading">
          Brand at a glance
        </h2>
        <button
          aria-expanded={editing}
          className={buttonClasses({ variant: editing ? "ghost" : "primary", size: "sm" })}
          onClick={() => setEditing((value) => !value)}
          type="button"
        >
          <Pencil aria-hidden className="h-4 w-4" />
          {editing ? "Close editor" : "Edit brand details"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <GlanceCard
          icon={<Building2 aria-hidden />}
          label="Company"
          title={profile.displayName || "Company not set"}
          value={formatIndustryLabel(profile.industry) || profile.websiteUrl || "Add company basics"}
        />
        <GlanceCard
          icon={<MessageSquareQuote aria-hidden />}
          label="Voice"
          title={profile.tone ? formatTokenLabel(profile.tone) : "Tone not set"}
          value={profile.voiceGuidance || "Add voice guidance"}
        />
        <GlanceCard
          icon={<FileText aria-hidden />}
          label="Offerings"
          title={profile.services.length ? `${profile.services.length} saved` : "No offerings yet"}
          value={profile.services.slice(0, 3).join(", ") || "Add products, services, or offers"}
        />
        <GlanceCard
          icon={<ShieldCheck aria-hidden />}
          label="Rules"
          title={
            profile.guardrails.disallowedClaims.length
              ? `${profile.guardrails.disallowedClaims.length} blocked claims`
              : "No blocked claims"
          }
          value={
            profile.guardrails.disallowedClaims.slice(0, 3).join(", ") ||
            profile.guardrails.complianceNotes ||
            "Add claims and compliance notes"
          }
        />
      </div>

      {approvedFacts.length > 0 ? (
        <div className="mt-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">What Arc knows</h3>
            <Link className="text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]" href="/brain">
              Review all in Brain →
            </Link>
          </div>
          <ul className="mt-2 grid gap-1.5">
            {approvedFacts.map((fact) => (
              <li className="flex items-baseline gap-2 text-sm leading-6 text-[var(--text-secondary)]" key={fact.id}>
                <span className="shrink-0 text-xs font-semibold text-[var(--text-muted)]">{factType(fact.kind)}</span>
                <span className="min-w-0 truncate text-[var(--text-primary)]">{fact.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editing ? (
        <div className="mt-4">
          <BrandProfileEditor profile={profile} />
        </div>
      ) : (
        <button
          className={cx(
            "mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-3 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]",
          )}
          onClick={() => setEditing(true)}
          type="button"
        >
          <ChevronDown aria-hidden className="h-4 w-4" />
          Edit company, voice, offerings, palette, and rules
        </button>
      )}
    </section>
  );
}

function GlanceCard({
  icon,
  label,
  title,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  value: string;
}) {
  return (
    <article className="min-w-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4">
      <div className="flex gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-[var(--accent)] [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
          <h3 className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">{title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{value}</p>
        </div>
      </div>
    </article>
  );
}

import {
  FileText,
  FolderOpen,
  MessageSquareQuote,
  Pencil,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";

import { PageHeader, Panel, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import { INDUSTRY_TEMPLATES, NEUTRAL_DEFAULTS, type BusinessProfile } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getBusinessProfile } from "@/lib/brand-kit/persistence";
import { summarizeBrandSourceReadiness } from "@/lib/brand-knowledge/readiness";
import { listNodes, type BrainNode } from "@/lib/knowledge-graph/read-model";
import { getMediaLibraryData } from "@/lib/media-library/read-model";
import { type MediaAssetView } from "@/lib/media-library/types";
import { getAgentName } from "@/lib/settings/agent-name";
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import {
  brandSourceSortScore,
  classifyBrandSource,
  type BrandSourceClassification,
} from "@/lib/brand-knowledge/source-classifier";

import { BrandProfileEditor } from "./_components/brand-profile-editor";
import { BrandPersonas } from "./_components/brand-personas";
import { BrandKnowledgeSyncButton } from "./_components/brand-knowledge-sync-button";
import { BrandSourceUpload } from "./_components/brand-source-upload";
import { LibraryTabs } from "../_components/library-tabs";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Brand" };

export const dynamic = "force-dynamic";

const BRAND_KINDS = new Set(["brand_fact", "proof_point", "messaging_angle", "cta", "service", "persona"]);

const SECTION_TONE = {
  company: {
    bar: "bg-[var(--accent)]",
    border: "border-l-[var(--accent-border-strong)]",
    surface: "bg-[color-mix(in_srgb,var(--accent-soft)_20%,var(--surface-panel))]",
  },
  rules: {
    bar: "bg-[var(--warn)]",
    border: "border-l-[var(--warn-border)]",
    surface: "bg-[color-mix(in_srgb,var(--warn-soft)_18%,var(--surface-panel))]",
  },
  facts: {
    bar: "bg-[var(--ok)]",
    border: "border-l-[var(--ok-border)]",
    surface: "bg-[color-mix(in_srgb,var(--ok-soft)_18%,var(--surface-panel))]",
  },
  files: {
    bar: "bg-[var(--accent-contrast)]",
    border: "border-l-[var(--accent-border)]",
    surface: "bg-[color-mix(in_srgb,var(--accent-soft)_14%,var(--surface-panel))]",
  },
} as const;

type SectionTone = keyof typeof SECTION_TONE;
type BrandFileSource = { asset: MediaAssetView; classification: BrandSourceClassification };
type BrainSourceStats = { total: number; proposed: number; trusted: number };

async function loadBrandProfile(): Promise<BusinessProfile> {
  if (!isSupabaseAdminConfigured()) return NEUTRAL_DEFAULTS;

  try {
    const orgId = await getCurrentOrgId();
    return (await getBusinessProfile(orgId)) ?? NEUTRAL_DEFAULTS;
  } catch {
    return NEUTRAL_DEFAULTS;
  }
}

function brandFacts(nodes: BrainNode[]): BrainNode[] {
  return nodes
    .filter((node) => BRAND_KINDS.has(node.kind))
    .sort((a, b) => {
      const order = { trusted: 0, proposed: 1, observed: 2, rejected: 3, archived: 4 };
      return (order[a.trustTier] ?? 9) - (order[b.trustTier] ?? 9);
    })
    .slice(0, 6);
}

function brandFiles(assets: MediaAssetView[]): BrandFileSource[] {
  return assets
    .map((asset) => ({ asset, classification: classifyBrandSource(asset) }))
    .filter(({ asset, classification }) => {
      return asset.kind === "document" || asset.source === "google_drive" || asset.source === "url" || classification.confidence === "high";
    })
    .sort((a, b) => {
      return (
        brandSourceSortScore(a.classification, a.asset.availableToArc) -
        brandSourceSortScore(b.classification, b.asset.availableToArc)
      );
    });
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

function factStatus(tier: string) {
  if (tier === "trusted") return { label: "Approved", tone: "green" as const };
  if (tier === "proposed") return { label: "Needs review", tone: "amber" as const };
  if (tier === "rejected") return { label: "Rejected", tone: "red" as const };
  return { label: "Draft", tone: "gray" as const };
}

function sourceStats(nodes: BrainNode[], assetId: string): BrainSourceStats {
  const linked = nodes.filter((node) => node.refTable === "media_assets" && node.refId === assetId);
  return {
    total: linked.length,
    proposed: linked.filter((node) => node.trustTier === "proposed").length,
    trusted: linked.filter((node) => node.trustTier === "trusted").length,
  };
}

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

export default async function BrandPage() {
  const [profile, brain, library, agentName, personaData] = await Promise.all([
    loadBrandProfile(),
    listNodes({}, undefined, undefined, { demoFallback: false }),
    getMediaLibraryData(),
    getAgentName(),
    getPersonaIntelligenceData(),
  ]);

  const facts = brain.status === "live" ? brandFacts(brain.nodes) : [];
  const brainNodes = brain.status === "live" ? brain.nodes : [];
  const allFiles = library.status === "live" ? brandFiles(library.assets) : [];
  const files = allFiles.slice(0, 6);
  const sourceReadiness = summarizeBrandSourceReadiness(allFiles, brainNodes);
  const approvedFacts = facts.filter((fact) => fact.trustTier === "trusted").length;
  const needsReview = facts.filter((fact) => fact.trustTier === "proposed").length;

  return (
    <div className="flex flex-col gap-6">
      <LibraryTabs active="brand" />
      <PageHeader
        eyebrow="Brand"
        title={profile.displayName || "Company brand"}
        description={`${agentName} uses this page to understand the company: what it offers, how it should sound, what proof it can use, and which files it can learn from.`}
        aside={
          <>
            <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/library">
              <FolderOpen aria-hidden className="h-4 w-4" />
              Add files
            </Link>
            <Link className={buttonClasses({ variant: "primary", size: "sm" })} href="#edit-brand">
              <Pencil aria-hidden className="h-4 w-4" />
              Edit brand
            </Link>
          </>
        }
      />

      <Panel className="overflow-hidden p-0">
        <BrandSourceUpload placement="hero" />
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <div>
            <div className="signal-eyebrow">Brand basics</div>
            <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">What {agentName} uses first</h2>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">
              Keep this simple and durable. Add source material above when the brand changes, then edit locked details here when something needs to be exact.
            </p>
          </div>
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="#edit-brand">
            Edit details
          </Link>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          <SnapshotCard
            icon={<FolderOpen aria-hidden />}
            label="Company"
            title={profile.displayName || "Company not set"}
            value={formatIndustryLabel(profile.industry) || profile.websiteUrl || "Add company basics"}
            tone="company"
          />
          <SnapshotCard
            icon={<MessageSquareQuote aria-hidden />}
            label="Voice"
            title={profile.tone ? formatTokenLabel(profile.tone) : "Tone not set"}
            value={profile.voiceGuidance || "Add voice guidance"}
            tone="files"
          />
          <SnapshotCard
            icon={<FileText aria-hidden />}
            label="Offerings"
            title={profile.services.length ? `${profile.services.length} saved` : "No offerings yet"}
            value={profile.services.slice(0, 3).join(", ") || "Add products, services, or offers"}
            tone="facts"
          />
          <SnapshotCard
            icon={<ShieldCheck aria-hidden />}
            label="Rules"
            title={profile.guardrails.disallowedClaims.length ? `${profile.guardrails.disallowedClaims.length} blocked claims` : "No blocked claims"}
            value={profile.guardrails.disallowedClaims.slice(0, 3).join(", ") || profile.guardrails.complianceNotes || "Add claims and compliance notes"}
            tone="rules"
          />
        </div>
        {(() => {
          const slots = [
            profile.brandPalette.primary,
            profile.brandPalette.secondary,
            profile.brandPalette.accent,
            profile.brandPalette.dark,
            profile.brandPalette.light,
          ].filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.hex));
          if (slots.length === 0) return null;
          return (
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-hairline)] px-5 py-4">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Palette</span>
              {slots.map((c) => (
                <span key={c.hex + c.label} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span aria-hidden className="h-5 w-5 rounded border border-[var(--border-hairline)]" style={{ backgroundColor: c.hex }} />
                  {c.label || c.hex}
                </span>
              ))}
            </div>
          );
        })()}
      </Panel>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="grid gap-5">
          <Panel className={cx("overflow-hidden border-l-4 p-0", SECTION_TONE.facts.border)}>
            <div aria-hidden className={cx("h-1", SECTION_TONE.facts.bar)} />
            <SimpleHeader
              action={
                <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/brain">
                  Open Brain
                </Link>
              }
              eyebrow={needsReview ? `${needsReview} to review` : `${approvedFacts} approved`}
              tone="facts"
              title={needsReview ? "Needs review" : "Approved brand notes"}
            />
            <div className="divide-y divide-[var(--border-hairline)]">
              {facts.length > 0 ? (
                facts.map((fact) => <FactRow key={fact.id} node={fact} />)
              ) : (
                <EmptyBrandState
                  actionHref="/brain"
                  actionLabel="Add facts"
                  detail="Add facts, proof, offerings, messages, and CTAs that Arc is allowed to use."
                  title="No brand facts yet"
                />
              )}
            </div>
          </Panel>
        </div>

        <div className="grid gap-5">
          <Panel className={cx("overflow-hidden border-l-4 p-0", SECTION_TONE.files.border)}>
            <div aria-hidden className={cx("h-1", SECTION_TONE.files.bar)} />
            <SimpleHeader
              action={
                <div className="flex flex-wrap items-start gap-2">
                  <BrandKnowledgeSyncButton readyToLearn={sourceReadiness.readyToLearn} />
                  <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/library">
                    Library
                  </Link>
                </div>
              }
              eyebrow={`${sourceReadiness.learned} learned${sourceReadiness.readyToLearn ? `, ${sourceReadiness.readyToLearn} new` : ""}`}
              tone="files"
              title="Sources Arc can learn from"
            />
            <div className="divide-y divide-[var(--border-hairline)]">
              {files.length > 0 ? (
                files.map((file) => <FileRow file={file} key={file.asset.id} stats={sourceStats(brainNodes, file.asset.id)} />)
              ) : (
                <EmptyBrandState
                  actionHref="/library"
                  actionLabel="Import files"
                  detail={library.status === "live" ? "Add Google Drive links, PDFs, brand guidelines, voice docs, offerings, proof files, rules, or source docs." : library.message}
                  title="No knowledge sources yet"
                />
              )}
            </div>
          </Panel>
        </div>
      </section>

      <BrandPersonas data={personaData} />

      <BrandProfileEditor profile={profile} />
    </div>
  );
}

function SnapshotCard({
  icon,
  label,
  title,
  tone,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  tone: SectionTone;
  value: string;
}) {
  const toneStyle = SECTION_TONE[tone];
  return (
    <article className={cx("min-w-0 border-l-4 border border-[var(--border-hairline)] bg-[var(--surface-soft)]", toneStyle.border)}>
      <div aria-hidden className={cx("h-1", toneStyle.bar)} />
      <div className="flex gap-3 p-4">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-[var(--accent)] [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
          <h3 className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">{title}</h3>
          <p className="mt-1 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">{value}</p>
        </div>
      </div>
    </article>
  );
}

function SimpleHeader({
  action,
  eyebrow,
  tone,
  title,
}: {
  action?: React.ReactNode;
  eyebrow: string;
  tone: SectionTone;
  title: string;
}) {
  const toneStyle = SECTION_TONE[tone];
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-4", toneStyle.surface)}>
      <div>
        <div className="signal-eyebrow">{eyebrow}</div>
        <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function FactRow({ node }: { node: BrainNode }) {
  const status = factStatus(node.trustTier);

  return (
    <article className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        <span className="text-xs font-semibold text-[var(--text-muted)]">{factType(node.kind)}</span>
        {node.source ? <span className="text-xs text-[var(--text-muted)]">From {node.source}</span> : null}
      </div>
      <h3 className="mt-2 text-sm font-bold text-[var(--text-primary)]">{node.label}</h3>
      <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">
        {node.summary || node.body || "No details saved yet."}
      </p>
    </article>
  );
}

function sourceTone(classification: BrandSourceClassification, availableToArc: boolean) {
  if (!availableToArc) return "amber" as const;
  if (classification.confidence === "high") return "green" as const;
  return "blue" as const;
}

function sourceReadiness(asset: MediaAssetView, classification: BrandSourceClassification) {
  if (!asset.availableToArc) return "Needs Arc access";
  if (classification.confidence === "high") return "Arc can use it as brand context";
  return "Arc can use it after review";
}

function brainStatus(stats: BrainSourceStats) {
  if (stats.trusted > 0) return { label: `${stats.trusted} approved in Brain`, tone: "green" as const };
  if (stats.proposed > 0) return { label: `${stats.proposed} in Brain review`, tone: "amber" as const };
  if (stats.total > 0) return { label: `${stats.total} linked in Brain`, tone: "blue" as const };
  return { label: "Not in Brain yet", tone: "gray" as const };
}

function FileRow({ file, stats }: { file: BrandFileSource; stats: BrainSourceStats }) {
  const { asset, classification } = file;
  const linked = brainStatus(stats);

  return (
    <article className="flex min-w-0 items-start gap-3 px-5 py-4">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--accent)]">
        <FileText aria-hidden className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-bold text-[var(--text-primary)]">{asset.fileName}</h3>
          <StatusPill tone={sourceTone(classification, asset.availableToArc)}>
            {classification.label}
          </StatusPill>
          <StatusPill tone={asset.source === "google_drive" || asset.source === "url" ? "green" : "gray"}>
            {asset.source === "google_drive" ? "Drive" : asset.source === "url" ? "URL" : asset.badge}
          </StatusPill>
          <StatusPill tone={linked.tone}>{linked.label}</StatusPill>
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{classification.reason}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
          <span>{formatTokenLabel(asset.kind)}</span>
          {asset.size ? <span>{asset.size}</span> : null}
          <span>{sourceReadiness(asset, classification)}</span>
        </div>
      </div>
    </article>
  );
}

function EmptyBrandState({
  actionHref,
  actionLabel,
  detail,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  detail: string;
  title: string;
}) {
  return (
    <div className="px-5 py-6">
      <div className={cx("rounded-md border border-dashed border-[var(--border-hairline)] bg-[var(--surface-inset)] p-5")}>
        <div className="flex items-start gap-3">
          <UploadCloud aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-[var(--text-primary)]">{title}</div>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
            <Link className={buttonClasses({ variant: "ghost", size: "sm", className: "mt-3" })} href={actionHref}>
              {actionLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

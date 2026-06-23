import {
  FileText,
  FolderOpen,
  Pencil,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";

import { Panel, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { cx, theme } from "@/app/_components/theme";
import { MetricBand, MetricCell, WorkbenchFrame } from "@/app/_components/workbench";
import { NEUTRAL_DEFAULTS, type BusinessProfile } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getBusinessProfile } from "@/lib/brand-kit/persistence";
import { summarizeBrandSourceReadiness } from "@/lib/brand-knowledge/readiness";
import { listNodes, type BrainNode } from "@/lib/knowledge-graph/read-model";
import { getMediaLibraryData } from "@/lib/media-library/read-model";
import { type MediaAssetView } from "@/lib/media-library/types";
import { getAgentName } from "@/lib/settings/agent-name";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import {
  brandSourceSortScore,
  classifyBrandSource,
  type BrandSourceClassification,
} from "@/lib/brand-knowledge/source-classifier";

import { BrandProfileEditor } from "./_components/brand-profile-editor";
import { BrandKnowledgeSyncButton } from "./_components/brand-knowledge-sync-button";
import { BrandIntakePanel } from "./_components/brand-intake-panel";

export const dynamic = "force-dynamic";

const BRAND_KINDS = new Set(["brand_fact", "proof_point", "messaging_angle", "cta", "service", "persona"]);

const SECTION_TONE = {
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
      return asset.kind === "document" || asset.source === "google_drive" || classification.confidence === "high";
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

export default async function BrandPage() {
  const [profile, brain, library, agentName] = await Promise.all([
    loadBrandProfile(),
    listNodes({}, undefined, undefined, { demoFallback: false }),
    getMediaLibraryData(),
    getAgentName(),
  ]);

  const facts = brain.status === "live" ? brandFacts(brain.nodes) : [];
  const brainNodes = brain.status === "live" ? brain.nodes : [];
  const allFiles = library.status === "live" ? brandFiles(library.assets) : [];
  const files = allFiles.slice(0, 6);
  const sourceReadiness = summarizeBrandSourceReadiness(allFiles, brainNodes);
  const approvedFacts = facts.filter((fact) => fact.trustTier === "trusted").length;
  const needsReview = facts.filter((fact) => fact.trustTier === "proposed").length;

  return (
    <WorkbenchFrame
      actions={
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
      eyebrow="Brand brain"
      title={profile.displayName || "Company brand"}
      description={`${agentName} learns from uploaded brand files, notes, and the website. Review what it extracts, then edit the profile only when something needs a human correction.`}
    >
      <div className="flex flex-col gap-6 lg:gap-7">
        <BrandIntakePanel defaultWebsite={profile.websiteUrl ?? ""} />

        <MetricBand>
          <MetricCell label="Sources" value={sourceReadiness.total} delta={`${sourceReadiness.readyToLearn} ready to learn`} tone="accent" />
          <MetricCell label="Learned" value={sourceReadiness.learned} delta="Synced into Brain" tone={sourceReadiness.learned > 0 ? "ok" : "neutral"} />
          <MetricCell label="Approved facts" value={approvedFacts} delta={`${facts.length} visible facts`} tone={approvedFacts > 0 ? "ok" : "neutral"} />
          <MetricCell label="Needs review" value={needsReview} delta="Proposed claims" tone={needsReview > 0 ? "accent" : "ok"} />
        </MetricBand>

        <Panel className="overflow-hidden rounded-xl p-0 shadow-[var(--elev-panel)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_78%,var(--surface-panel))] px-5 py-5 sm:px-7 sm:py-6">
            <div>
              <div className="signal-eyebrow">Review</div>
              <h2 className="mt-1 text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">What Arc learned</h2>
              <p className="mt-1 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
                Brand files and notes autopopulate the profile where possible and create Brain notes for proof, personas, offers, voice, and rules.
              </p>
            </div>
            <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="#edit-brand">
              Manual edit
            </Link>
          </div>

          <section className="grid gap-0 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="min-w-0 border-b border-[var(--border-hairline)] xl:border-b-0 xl:border-r">
              <div aria-hidden className={cx("h-1", SECTION_TONE.facts.bar)} />
              <SimpleHeader
                action={
                  <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/brain">
                    Review facts
                  </Link>
                }
                eyebrow={`${approvedFacts} approved${needsReview ? `, ${needsReview} to review` : ""}`}
                tone="facts"
                title="Facts and personas"
              />
              <div className="divide-y divide-[var(--border-hairline)]">
                {facts.length > 0 ? (
                  facts.map((fact) => <FactRow key={fact.id} node={fact} />)
                ) : (
                  <EmptyBrandState
                    actionHref="/brain"
                    actionLabel="Add facts"
                    detail="Upload source files or add notes above. Arc will extract proof, offerings, messages, CTAs, and personas into Brain."
                    title="No brand facts yet"
                  />
                )}
              </div>
            </div>

            <div className="min-w-0">
              <div aria-hidden className={cx("h-1", SECTION_TONE.files.bar)} />
              <SimpleHeader
                action={
                  <div className="flex flex-wrap items-start gap-2">
                    <BrandKnowledgeSyncButton readyToLearn={sourceReadiness.readyToLearn} />
                    <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/library">
                      Add files
                    </Link>
                  </div>
                }
                eyebrow={`${sourceReadiness.readyToLearn} new, ${sourceReadiness.learned} learned`}
                tone="files"
                title="Knowledge sources"
              />
              <div className="divide-y divide-[var(--border-hairline)]">
                {files.length > 0 ? (
                  files.map((file) => <FileRow file={file} key={file.asset.id} stats={sourceStats(brainNodes, file.asset.id)} />)
                ) : (
                  <EmptyBrandState
                    actionHref="/library"
                    actionLabel="Import files"
                    detail={library.status === "live" ? "Add PDFs, brand guidelines, voice docs, persona docs, offers, proof files, logos, and source docs." : library.message}
                    title="No knowledge sources yet"
                  />
                )}
              </div>
            </div>
          </section>
        </Panel>

        <BrandProfileEditor profile={profile} />
      </div>
    </WorkbenchFrame>
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
    <div className={cx("flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-4 sm:px-6 sm:py-5", toneStyle.surface)}>
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
    <article className="px-5 py-[1.125rem] transition-colors hover:bg-[color-mix(in_srgb,var(--surface-inset)_45%,transparent)] sm:px-6 sm:py-5">
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
    <article className="flex min-w-0 items-start gap-3.5 px-5 py-[1.125rem] transition-colors hover:bg-[color-mix(in_srgb,var(--surface-inset)_45%,transparent)] sm:px-6 sm:py-5">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
        <FileText aria-hidden className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-bold text-[var(--text-primary)]">{asset.fileName}</h3>
          <StatusPill tone={sourceTone(classification, asset.availableToArc)}>
            {classification.label}
          </StatusPill>
          <StatusPill tone={asset.source === "google_drive" ? "green" : "gray"}>
            {asset.source === "google_drive" ? "Drive" : asset.badge}
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
    <div className="px-5 py-6 sm:px-6 sm:py-7">
      <div className={cx(theme.surface.dashedEmpty, "p-5 sm:p-6")}>
        <div className="flex items-start gap-3">
          <UploadCloud aria-hidden className="relative mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
          <div className="relative min-w-0">
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

import Link from "next/link";

import { BrandGlyph } from "../../_components/brand-logos";
import { StatusPill } from "../../_components/page-header";
import { cx } from "../../_components/theme";
import type {
  CrmRecordData,
  CrmRecordGraphNode,
  CrmRecordMetric,
  CrmRecordQualityItem,
  CrmRecordScoreBar,
} from "@/lib/crm/read-model";

/* ===========================================================================
   Premium CRM record detail layout.
   A strong header band (name + persona + score badge + key meta), a quick-stat
   strip, a two-column body (dense fields + connected records + activity) and a
   right intelligence rail (score bars, next-best-action, relationship graph,
   provenance / data quality). Linear/Vercel density, obsidian + antique gold.
   =========================================================================== */

const METRIC_TONE: Record<NonNullable<CrmRecordMetric["tone"]>, string> = {
  neutral: "text-[var(--text-primary)]",
  ok: "text-[var(--ok-text)]",
  amber: "text-[var(--warn-text)]",
  red: "text-[var(--priority-text)]",
  accent: "text-[var(--accent-contrast)]",
};

const GRAPH_KIND_LABEL: Record<CrmRecordGraphNode["kind"], string> = {
  self: "This record",
  company: "Company",
  contact: "Contact",
  property: "Asset",
  lead: "Lead",
  job: "Project",
  outcome: "Outcome",
};

/** Dates, money, ids and counts read better in tabular mono than in the sans UI face. */
function isHeaderMetricMono(value: string): boolean {
  return /^\$|\/100|^\d|\d{1,2},?\s\d{4}$|^[A-Z]{2,4}-\d|^BSR-/.test(value);
}

function scoreBadgeTone(value: number | null) {
  if (typeof value !== "number") return { ring: "var(--border-strong)", text: "var(--text-muted)" };
  if (value >= 80) return { ring: "var(--ok)", text: "var(--ok-text)" };
  if (value >= 55) return { ring: "var(--warn)", text: "var(--warn-text)" };
  return { ring: "var(--priority)", text: "var(--priority-text)" };
}

// --------------------------------------------------------------------------
// Header band
// --------------------------------------------------------------------------

export function RecordHeaderBand({ record }: { record: CrmRecordData }) {
  const primaryScore =
    record.key === "leads" ? record.leadScore : record.key === "companies" ? record.partnerScore : null;
  const scoreLabel = record.key === "leads" ? "Lead score" : record.key === "companies" ? "Relationship" : null;
  const badge = scoreBadgeTone(primaryScore);

  return (
    <section className="signal-panel module-rise overflow-hidden">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="blue">{record.persona}</StatusPill>
            <StatusPill tone={statusTone(record.lifecycleStatus)}>{record.lifecycleStatus}</StatusPill>
            {record.urgency ? <StatusPill tone={urgencyTone(record.urgency)}>{record.urgency}</StatusPill> : null}
            {record.origin === "agent" ? <StatusPill tone="gray">Added by Arc</StatusPill> : null}
          </div>
          <h1 className="mt-3 font-serif text-[clamp(1.5rem,2.4vw,2.15rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--text-primary)]">
            {record.name}
          </h1>
          <p className="mt-2 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">{record.detail}</p>

          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--border-hairline)] pt-4">
            {record.headerMetrics.map((metric) => {
              const mono = isHeaderMetricMono(metric.value);
              return (
                <div key={metric.label} className="min-w-0">
                  <dt className="text-[10px] font-medium text-[var(--text-muted)]">{metric.label}</dt>
                  <dd
                    className={cx(
                      "mt-1 truncate text-sm font-semibold",
                      mono && "font-mono text-[13px] tabular-nums tracking-tight",
                      metric.tone ? METRIC_TONE[metric.tone] : "text-[var(--text-primary)]",
                    )}
                  >
                    {metric.value}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>

        {scoreLabel ? (
          <div className="flex shrink-0 items-center gap-4 self-start rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
            <ScoreDial value={primaryScore} ring={badge.ring} />
            <div>
              <div className="text-[10px] font-medium text-[var(--text-muted)]">{scoreLabel}</div>
              <div className="mt-1 font-mono text-3xl font-semibold leading-none tabular-nums" style={{ color: badge.text }}>
                {typeof primaryScore === "number" ? primaryScore : "—"}
              </div>
              <div className="mt-1 text-[11px] text-[var(--text-muted)]">out of 100</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-2.5 text-[11px] text-[var(--text-muted)]">
        <LockGlyph />
        <span>Internal CRM record. No outreach, publishing, spend, or dispatch happens from this view.</span>
      </div>
    </section>
  );
}

function ScoreDial({ value, ring }: { value: number | null; ring: string }) {
  const pct = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90" aria-hidden>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--border-hairline)" strokeWidth="4" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke={ring}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3.5" y="7" width="9" height="6" rx="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

// --------------------------------------------------------------------------
// Quick stat strip (companies / jobs / outcomes)
// --------------------------------------------------------------------------

export function RecordQuickStats({ stats }: { stats: CrmRecordMetric[] }) {
  if (stats.length === 0) return null;
  return (
    <div
      className="module-rise grid gap-px overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--border-hairline)]"
      style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 6)}, minmax(0, 1fr))` }}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="bg-[var(--surface-panel)] px-4 py-3.5">
          <div className="truncate text-[10px] font-medium text-[var(--text-muted)]">{stat.label}</div>
          <div className={cx("mt-1.5 font-mono text-xl font-semibold tabular-nums tracking-tight", stat.tone ? METRIC_TONE[stat.tone] : "text-[var(--text-primary)]")}>
            {stat.value}
          </div>
          {stat.hint ? <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{stat.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// Section primitive (header + 1px-divided body, no nested boxes)
// --------------------------------------------------------------------------

export function DetailSection({
  eyebrow,
  title,
  count,
  action,
  children,
  className = "",
}: {
  eyebrow: string;
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("signal-panel module-rise overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
        <div className="min-w-0">
          <div className="signal-eyebrow">{eyebrow}</div>
          <h2 className="mt-0.5 text-[0.95rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {typeof count === "number" ? <StatusPill tone={count > 0 ? "blue" : "gray"}>{count}</StatusPill> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

// --------------------------------------------------------------------------
// Stored fields (two-column dense definition list)
// --------------------------------------------------------------------------

/** Long prose labels render on their own full-width row so values can wrap freely. */
const PROSE_FIELD_LABELS = new Set(["lead summary", "address", "loss summary", "summary"]);
/**
 * Contact-style labels whose values are long, single-token strings (URLs,
 * emails). They get a full-width row — label left, value right, no second
 * column to collide with — so the whole value shows without truncation.
 */
const WIDE_FIELD_LABELS = new Set(["website", "email"]);
/** Labels whose values should render in tabular mono (ids, numbers, contacts, dates). */
const MONO_FIELD_LABELS = new Set([
  "phone",
  "email",
  "website",
  "lead score",
  "estimated revenue",
  "revenue",
  "margin",
  "zip",
  "company id",
  "contact id",
  "project id",
  "project number",
]);

function isMonoFieldValue(label: string, value: string) {
  const lower = label.toLowerCase();
  if (MONO_FIELD_LABELS.has(lower)) return true;
  // ids, money, dates and scores read better as tabular mono
  return /^\$|\d{2,}|\/100|@|^https?:|^[0-9a-f-]{8,}$/i.test(value) && lower !== "name";
}

/** Strip a protocol prefix so a website value reads as a clean domain. */
function displayFieldValue(label: string, value: string) {
  if (label.toLowerCase() === "website") return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return value;
}

export function StoredFields({ record }: { record: CrmRecordData }) {
  const proseFields = record.fields.filter((f) => PROSE_FIELD_LABELS.has(f.label.toLowerCase()));
  const wideFields = record.fields.filter((f) => WIDE_FIELD_LABELS.has(f.label.toLowerCase()) && f.value !== "Missing");
  const scalarFields = record.fields.filter(
    (f) =>
      !PROSE_FIELD_LABELS.has(f.label.toLowerCase()) &&
      !(WIDE_FIELD_LABELS.has(f.label.toLowerCase()) && f.value !== "Missing"),
  );

  return (
    <DetailSection eyebrow="Stored fields" title="What the database knows">
      {proseFields.length > 0 ? (
        <div className="divide-y divide-[var(--border-hairline)] border-b border-[var(--border-hairline)]">
          {proseFields.map((field) => {
            const missing = field.value === "Missing";
            return (
              <div key={field.label} className="px-4 py-3">
                <dt className="text-[10px] font-medium text-[var(--text-muted)]">{field.label}</dt>
                <dd className={cx("mt-1.5 text-sm leading-6", missing ? "text-[var(--warn-text)]" : "text-[var(--text-secondary)]")}>
                  {field.value}
                </dd>
              </div>
            );
          })}
        </div>
      ) : null}

      <dl className="grid grid-cols-1 sm:grid-cols-2">
        {scalarFields.map((field, i) => {
          const missing = field.value === "Missing";
          const onLeft = i % 2 === 0;
          const isLast = i >= scalarFields.length - (scalarFields.length % 2 === 0 ? 2 : 1);
          const mono = !missing && isMonoFieldValue(field.label, field.value);
          return (
            <div
              key={field.label}
              className={cx(
                "flex items-baseline justify-between gap-4 px-4 py-3",
                onLeft ? "sm:border-r sm:border-[var(--border-hairline)]" : "",
                isLast ? "" : "border-b border-[var(--border-hairline)]",
              )}
            >
              <dt className="shrink-0 text-[11px] font-medium text-[var(--text-muted)]">{field.label}</dt>
              <dd
                className={cx(
                  "min-w-0 truncate text-right text-sm",
                  mono ? "font-mono text-[13px] tabular-nums tracking-tight" : "font-medium",
                  missing ? "font-medium text-[var(--warn-text)]" : "text-[var(--text-primary)]",
                )}
                title={field.value}
              >
                {field.value}
              </dd>
            </div>
          );
        })}
      </dl>

      {wideFields.length > 0 ? (
        <dl className="divide-y divide-[var(--border-hairline)] border-t border-[var(--border-hairline)]">
          {wideFields.map((field) => (
            <div key={field.label} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="shrink-0 text-[11px] font-medium text-[var(--text-muted)]">{field.label}</dt>
              <dd className="min-w-0 truncate text-right font-mono text-[13px] tracking-tight text-[var(--text-primary)]" title={field.value}>
                {displayFieldValue(field.label, field.value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </DetailSection>
  );
}

// --------------------------------------------------------------------------
// Evidence & sources (source-backed provenance the agent acted on)
// --------------------------------------------------------------------------

export function EvidenceSection({ record }: { record: CrmRecordData }) {
  const hasEvidence = record.evidence.length > 0;
  const hasProof = record.proofPoints.length > 0;
  if (!hasEvidence && !hasProof) return null;

  return (
    <DetailSection eyebrow="Provenance" title="Evidence & proof">
      {hasEvidence ? (
        <ul className="divide-y divide-[var(--border-hairline)] border-b border-[var(--border-hairline)]">
          {record.evidence.map((item, i) => {
            const inner = (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--accent)]">
                  {item.href ? <LinkGlyph /> : <DocGlyph />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--text-primary)] transition-colors group-hover/ev:text-[var(--accent)]">
                    {item.label}
                  </div>
                  {item.detail ? <div className="truncate text-[12px] text-[var(--text-muted)]">{item.detail}</div> : null}
                </div>
                {item.href ? <ChevronGlyph /> : null}
              </>
            );
            return (
              <li key={`${item.label}-${i}`}>
                {item.href ? (
                  <Link
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group/ev flex items-center gap-3 px-4 py-2.5 transition-colors duration-300 hover:bg-[var(--surface-raised)]"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="group/ev flex items-center gap-3 px-4 py-2.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {hasProof ? (
        <div className="px-4 py-3.5">
          <div className="text-[10px] font-medium text-[var(--text-muted)]">Proof points</div>
          <ul className="mt-2 space-y-1.5">
            {record.proofPoints.map((point) => (
              <li key={point} className="flex items-start gap-2 text-[13px] leading-5 text-[var(--text-secondary)]">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </DetailSection>
  );
}

function LinkGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 9.5 9.5 6.5M7 4.5 8 3.5a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1" />
    </svg>
  );
}

function DocGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2.5h5l3 3V13.5H4zM9 2.5V6h3M6 8.5h4M6 10.5h4" />
    </svg>
  );
}

// --------------------------------------------------------------------------
// Contact / company channels (real brand logos where available)
// --------------------------------------------------------------------------

export function ContactChannels({ record }: { record: CrmRecordData }) {
  const channels: Array<{ channel: string; label: string; value: string; href?: string }> = [];
  const field = (label: string) => record.fields.find((f) => f.label.toLowerCase() === label && f.value !== "Missing")?.value;

  const email = field("email");
  const website = field("website");
  const phone = field("phone");

  if (email) channels.push({ channel: "gmail", label: "Email", value: email, href: `mailto:${email}` });
  if (website) {
    const clean = website.replace(/^https?:\/\//, "").replace(/\/$/, "");
    channels.push({ channel: clean, label: "Website", value: clean, href: website.startsWith("http") ? website : `https://${clean}` });
  }
  if (phone) channels.push({ channel: "phone", label: "Phone", value: phone, href: `tel:${phone}` });

  if (channels.length === 0) return null;

  return (
    <DetailSection eyebrow="Reach" title="Channels">
      <ul className="divide-y divide-[var(--border-hairline)]">
        {channels.map((c) => {
          const inner = (
            <>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
                {c.channel === "phone" ? <PhoneGlyph /> : <BrandGlyph channel={c.channel} className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium text-[var(--text-muted)]">{c.label}</div>
                <div className="truncate font-mono text-[13px] tabular-nums text-[var(--text-primary)] transition-colors group-hover/ch:text-[var(--accent)]">
                  {c.value}
                </div>
              </div>
              {c.href ? <ChevronGlyph /> : null}
            </>
          );
          return (
            <li key={c.label}>
              {c.href ? (
                <Link
                  href={c.href}
                  className="group/ch flex items-center gap-3 px-4 py-2.5 transition-colors duration-300 hover:bg-[var(--surface-raised)]"
                >
                  {inner}
                </Link>
              ) : (
                <div className="group/ch flex items-center gap-3 px-4 py-2.5">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </DetailSection>
  );
}

function PhoneGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2.5h2.5l1 3-1.5 1a8 8 0 0 0 3.5 3.5l1-1.5 3 1V13a1 1 0 0 1-1 1A10.5 10.5 0 0 1 3 4.5a1 1 0 0 1 1-2Z" />
    </svg>
  );
}

// --------------------------------------------------------------------------
// Connected records (people & relationships list)
// --------------------------------------------------------------------------

/** Order connection groups the way a person reads an account: org → people → places → work → money. */
const REL_GROUP_ORDER = ["Company", "Contact", "Asset", "Lead", "Project", "Outcome"];

function relGroupPlural(label: string, n: number): string {
  const map: Record<string, [string, string]> = {
    Company: ["Company", "Companies"],
    Contact: ["Contact", "Contacts"],
    Asset: ["Asset", "Assets"],
    Lead: ["Lead", "Leads"],
    Project: ["Project", "Projects"],
    Outcome: ["Outcome", "Outcomes"],
  };
  const pair = map[label] ?? [label, `${label}s`];
  return n === 1 ? pair[0] : pair[1];
}

export function ConnectedRecords({ record, agentName }: { record: CrmRecordData; agentName: string }) {
  // Group the flat relationship list by type so it reads like Attio's linked
  // records — Company ↔ Contacts ↔ Assets ↔ Projects ↔ Outcomes — instead of a
  // single undifferentiated list.
  const groups = new Map<string, typeof record.relationships>();
  for (const rel of record.relationships) {
    const bucket = groups.get(rel.label) ?? [];
    bucket.push(rel);
    groups.set(rel.label, bucket);
  }
  const ordered = [...groups.entries()].sort(
    (a, b) => (REL_GROUP_ORDER.indexOf(a[0]) + 1 || 99) - (REL_GROUP_ORDER.indexOf(b[0]) + 1 || 99),
  );

  return (
    <DetailSection eyebrow="Relationships" title="Connected records" count={record.relationships.length}>
      {ordered.length > 0 ? (
        <div className="divide-y divide-[var(--border-hairline)]">
          {ordered.map(([label, rels]) => (
            <div key={label} className="px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] font-medium text-[var(--text-muted)]">
                  {relGroupPlural(label, rels.length)}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">{rels.length}</span>
                <span className="h-px flex-1 bg-[var(--border-hairline)]" />
              </div>
              <ul className="space-y-1">
                {rels.map((rel) => (
                  <li key={`${rel.label}-${rel.href}`}>
                    <Link
                      href={rel.href}
                      className="group/rel -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--surface-raised)] active:scale-[0.99]"
                    >
                      <RelGlyph kind={rel.label} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)] transition-colors group-hover/rel:text-[var(--accent)]">
                        {rel.value}
                      </span>
                      <span className="shrink-0 translate-x-0.5 text-[var(--text-muted)] opacity-0 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/rel:translate-x-0 group-hover/rel:text-[var(--accent)] group-hover/rel:opacity-100">
                        <ChevronGlyph />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 py-5 text-sm leading-6 text-[var(--text-secondary)]">
          No relationships are linked yet. {agentName} needs company, contact, or asset links before it can act on this record confidently.
        </p>
      )}
    </DetailSection>
  );
}

function RelGlyph({ kind }: { kind: string }) {
  const lower = kind.toLowerCase();
  let path = "M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 6a6 6 0 0 1 12 0";
  if (lower.includes("company")) path = "M3 14V4l5-2 5 2v10M6 7h0M10 7h0M6 10h0M10 10h0";
  else if (lower.includes("asset") || lower.includes("propert")) path = "M2.5 7 8 2.5 13.5 7M4 6.5V13h8V6.5";
  else if (lower.includes("project") || lower.includes("job")) path = "M3 5h10v8H3zM6 5V3.5h4V5";
  else if (lower.includes("lead")) path = "M8 2v12M3 6l5-3 5 3";
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--accent)]">
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

function ChevronGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 4 4 4-4 4" />
    </svg>
  );
}

// --------------------------------------------------------------------------
// Engagement summary
// --------------------------------------------------------------------------

export function EngagementSummary({ metrics }: { metrics: CrmRecordMetric[] }) {
  if (metrics.length === 0) return null;
  return (
    <DetailSection eyebrow="Activity signal" title="Engagement summary">
      <div className="grid grid-cols-2 gap-px bg-[var(--border-hairline)] sm:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="bg-[var(--surface-panel)] px-4 py-3.5">
            <div
              className={cx(
                "font-mono text-2xl font-semibold tabular-nums leading-none",
                m.tone ? METRIC_TONE[m.tone] : "text-[var(--text-primary)]",
              )}
            >
              {m.value}
            </div>
            <div className="mt-2 text-[11px] font-medium text-[var(--text-muted)]">{m.label}</div>
            {m.hint ? <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{m.hint}</div> : null}
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

// --------------------------------------------------------------------------
// Intelligence rail: score bars
// --------------------------------------------------------------------------

export function ScoreBars({ bars }: { bars: CrmRecordScoreBar[] }) {
  if (bars.length === 0) return null;
  return (
    <div className="space-y-3 border-b border-[var(--border-hairline)] px-4 py-4">
      {bars.map((bar) => {
        const max = bar.max ?? 100;
        const pct = typeof bar.value === "number" ? Math.max(0, Math.min(100, (bar.value / max) * 100)) : 0;
        const color =
          bar.tone === "ok" ? "var(--ok)" : bar.tone === "amber" ? "var(--warn)" : bar.tone === "red" ? "var(--priority)" : "var(--accent)";
        return (
          <div key={bar.label}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">{bar.label}</span>
              <span className="font-mono text-sm font-semibold tabular-nums" style={{ color }}>
                {typeof bar.value === "number" ? bar.value : "—"}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-inset)]">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            {bar.caption ? <div className="mt-1 text-[11px] text-[var(--text-muted)]">{bar.caption}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------
// Intelligence rail: persona intelligence panel
// --------------------------------------------------------------------------

export function PersonaIntelligence({ record }: { record: CrmRecordData }) {
  return (
    <section className="signal-panel module-rise overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
        <div>
          <div className="signal-eyebrow">Growth intelligence</div>
          <h2 className="mt-0.5 text-[0.95rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Persona &amp; signal</h2>
        </div>
        <StatusPill tone="amber">Outbound locked</StatusPill>
      </div>

      <dl className="grid grid-cols-2">
        <RailField label="Persona" value={record.persona} />
        <RailField label="Confidence" value={record.confidence} right />
        <RailField label="Journey stage" value={record.journeyStage} top />
        <RailField label="Urgency" value={record.urgency} right top />
      </dl>

      <ScoreBars bars={record.scoreBars} />

      <div className="space-y-3 px-4 py-4">
        <Narrative label="Attention reason" value={record.attentionReason} />
        <Narrative label="Recommended CTA" value={record.cta} />
        <Narrative label="Message angle" value={record.messageAngle} />
      </div>

      {record.proofPoints.length > 0 ? (
        <div className="border-t border-[var(--border-hairline)] px-4 py-4">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">Recommended proof points</div>
          <ul className="mt-2.5 space-y-1.5">
            {record.proofPoints.map((point) => (
              <li key={point} className="flex items-start gap-2 text-[13px] leading-5 text-[var(--text-secondary)]">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function RailField({ label, value, right = false, top = false }: { label: string; value: string; right?: boolean; top?: boolean }) {
  return (
    <div className={cx("px-4 py-3", !right && "border-r border-[var(--border-hairline)]", top && "border-t border-[var(--border-hairline)]")}>
      <dt className="text-[10px] font-medium text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold leading-5 text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function Narrative({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[11px] font-medium text-[var(--text-muted)]">{label}</div>
      <p className="mt-1 text-[13px] leading-6 text-[var(--text-secondary)]">{value}</p>
    </div>
  );
}

// --------------------------------------------------------------------------
// Next best action (gold card)
// --------------------------------------------------------------------------

export function NextBestAction({ record }: { record: CrmRecordData }) {
  return (
    <section className="module-rise overflow-hidden rounded-xl border border-[var(--accent-border-strong)] bg-[var(--accent-soft)]">
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]">
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 8 3 3 5-6" />
          </svg>
        </span>
        <div className="signal-eyebrow text-[var(--accent-contrast)]">Next best action</div>
      </div>
      <p className="px-4 pb-3 pt-2 text-sm font-semibold leading-6 text-[var(--text-primary)]">{record.nextBestAction}</p>
      <div className="border-t border-[var(--accent-border-strong)] px-4 py-2.5 text-[11px] text-[var(--accent-contrast)]">
        Requires human approval before any outbound step.
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
// Relationship graph (radial SVG)
// --------------------------------------------------------------------------

export function RelationshipGraph({ nodes }: { nodes: CrmRecordGraphNode[] }) {
  const self = nodes[0];
  const peers = nodes.slice(1);
  if (!self || peers.length === 0) return null;

  // Vertical hub-and-spoke: the record sits on the left, each connected record
  // is a labeled lane on the right with a connector elbow. Reads top-to-bottom
  // like a real graph and stays legible because every node carries its name.
  const rowH = 46;
  const padY = 18;
  const w = 360;
  const h = padY * 2 + peers.length * rowH;
  const hubX = 30;
  const hubY = h / 2;
  const spokeX = 120;

  return (
    <DetailSection eyebrow="Relationship map" title="Connected graph" count={nodes.length}>
      <div className="px-4 py-4">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Relationship graph">
          {/* connectors */}
          {peers.map((node, i) => {
            const y = padY + rowH * i + rowH / 2;
            return (
              <path
                key={`edge-${node.id}-${i}`}
                d={`M ${hubX} ${hubY} C ${hubX + 40} ${hubY}, ${spokeX - 40} ${y}, ${spokeX} ${y}`}
                fill="none"
                stroke="var(--border-strong)"
                strokeWidth="1.25"
              />
            );
          })}
          {/* hub */}
          <circle cx={hubX} cy={hubY} r="9" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
          <circle cx={hubX} cy={hubY} r="3" fill="var(--accent)" />
          {/* peer nodes + labels */}
          {peers.map((node, i) => {
            const y = padY + rowH * i + rowH / 2;
            const color = graphColor(node.kind);
            return (
              <g key={`node-${node.id}-${i}`}>
                <circle cx={spokeX} cy={y} r="5.5" fill="var(--surface-inset)" stroke={color} strokeWidth="2" />
                <text
                  x={spokeX + 14}
                  y={y - 4}
                  className="font-sans"
                  fontSize="8.5"
                  fontWeight={600}
                  letterSpacing="0.06em"
                  fill="var(--text-muted)"
                  style={{ textTransform: "uppercase" }}
                >
                  {GRAPH_KIND_LABEL[node.kind]}
                </text>
                <text x={spokeX + 14} y={y + 9} className="font-sans" fontSize="11.5" fontWeight={600} fill="var(--text-primary)">
                  {truncateLabel(node.label, 34)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </DetailSection>
  );
}

function truncateLabel(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function graphColor(kind: CrmRecordGraphNode["kind"]) {
  if (kind === "self") return "var(--accent)";
  if (kind === "company") return "var(--ok)";
  if (kind === "lead") return "var(--warn)";
  if (kind === "outcome") return "var(--priority)";
  return "var(--accent-contrast)";
}

// --------------------------------------------------------------------------
// Provenance & data quality
// --------------------------------------------------------------------------

export function DataQuality({ items, recordId, objectLabel }: { items: CrmRecordQualityItem[]; recordId: string; objectLabel: string }) {
  const present = items.filter((item) => item.present).length;
  const total = items.length || 1;
  const pct = Math.round((present / total) * 100);
  const tone = pct >= 80 ? "ok" : pct >= 50 ? "amber" : "red";
  const color = tone === "ok" ? "var(--ok)" : tone === "amber" ? "var(--warn)" : "var(--priority)";

  return (
    <DetailSection eyebrow="Provenance" title="Data quality">
      <div className="px-4 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Completeness</span>
          <span className="font-mono text-lg font-semibold tabular-nums" style={{ color }}>{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-inset)]">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
        <ul className="mt-4 space-y-1.5">
          {items.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="text-[var(--text-secondary)]">{item.label}</span>
              {item.present ? (
                <span className="inline-flex items-center gap-1 font-semibold text-[var(--ok-text)]">
                  <CheckGlyph /> Present
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-[var(--warn-text)]">
                  <DashGlyph /> Missing
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">
          <div className="text-[10px] font-medium text-[var(--text-muted)]">Record id</div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-secondary)]">{recordId}</div>
          <div className="mt-2 text-[10px] font-medium text-[var(--text-muted)]">Object</div>
          <div className="mt-0.5 text-[12px] font-semibold text-[var(--text-primary)]">{objectLabel}</div>
        </div>
      </div>
    </DetailSection>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

function DashGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 8h8" />
    </svg>
  );
}

// --------------------------------------------------------------------------
// Tone helpers
// --------------------------------------------------------------------------

function statusTone(status: string): "green" | "amber" | "red" | "blue" | "gray" {
  const lower = status.toLowerCase();
  if (["active", "validated", "qualified", "converted", "completed", "won", "paid"].some((s) => lower.includes(s))) return "green";
  if (["lost", "canceled", "written off", "archived", "inactive", "do not contact"].some((s) => lower.includes(s))) return "red";
  if (["running", "in progress", "scheduled"].some((s) => lower.includes(s))) return "blue";
  if (lower.includes("review") || lower.includes("new")) return "amber";
  return "gray";
}

function urgencyTone(urgency: string): "red" | "amber" | "gray" {
  const lower = urgency.toLowerCase();
  if (lower.includes("urgent") || lower.includes("high")) return "red";
  if (lower.includes("review") || lower.includes("next") || lower.includes("enrich")) return "amber";
  return "gray";
}

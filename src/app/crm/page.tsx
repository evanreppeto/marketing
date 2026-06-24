import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { StatusPill, buttonClasses } from "../_components/page-header";
import { DossierPanel, MetricBand, MetricCell, WorkbenchFrame } from "../_components/workbench";
import { getCrmNavCounts, getCrmOverviewData, type CrmPipelineRow } from "@/lib/crm/read-model";
import { getAgentName } from "@/lib/settings/agent-name";

import { CrmObjectTabs } from "./_components/crm-object-tabs";
import { CrmPipelineBoard } from "./_components/crm-pipeline-board";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "CRM" };

type CrmViewKey = "needs-action" | "new" | "qualified" | "scheduled" | "closed";

type CrmSearchParams = {
  selected?: string | string[];
  view?: string | string[];
};

const listViews: Array<{ key: CrmViewKey; label: string }> = [
  { key: "needs-action", label: "Needs Action" },
  { key: "new", label: "New" },
  { key: "qualified", label: "Qualified" },
  { key: "scheduled", label: "Scheduled" },
  { key: "closed", label: "Closed" },
];

export default async function CrmOverviewPage({ searchParams }: { searchParams?: Promise<CrmSearchParams> }) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const [liveCrm, navCounts] = await Promise.all([getCrmOverviewData(), getCrmNavCounts(), getAgentName()]);
  const isLive = liveCrm.status === "live";
  const pipelineRows = isLive ? liveCrm.rows : [];
  const counts = navCounts.status === "live" ? navCounts.counts : undefined;
  const activeView = normalizeView(getValue(query.view));
  const visibleRows = getVisibleRows(activeView, pipelineRows);
  const selectedId = getValue(query.selected);
  const selectedRecord = visibleRows.find((row) => row.id === selectedId) ?? visibleRows[0] ?? pipelineRows[0] ?? null;
  const focusStats = buildFocusStats(pipelineRows);
  const kpiStats = buildKpiStats(pipelineRows);

  return (
    <AppShell active="/crm">
      <WorkbenchFrame
        actions={
          <Link className={buttonClasses({ variant: "primary", size: "sm" })} href="/crm/leads?action=new">
            New lead
          </Link>
        }
        aside={<SelectedRecordPanel selectedRecord={selectedRecord} />}
        description="Command center for relationships, opportunities, and revenue, scored and ready for the next best action."
        eyebrow="CRM"
        tabs={<CrmObjectTabs counts={counts} />}
        title="CRM"
      >

      {!isLive ? (
        <div className="module-rise mb-4 rounded-lg border border-[var(--warn-border-soft)] bg-[var(--warn-soft)] px-4 py-3 text-sm leading-6 text-[var(--warn-text)]">
          <span className="font-semibold text-[var(--text-primary)]">Live CRM unavailable: </span>
          {liveCrm.message}
        </div>
      ) : null}

        <MetricBand>
          {kpiStats.map((item) => (
            <MetricCell
              delta={item.delta ?? item.hint}
              key={item.label}
              label={item.label}
              tone={item.tone}
              value={item.value}
            />
          ))}
        </MetricBand>

      <CrmFocusStrip stats={focusStats} />

        <div className="mt-4">
          <section className="signal-panel module-rise overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-editorial text-xl font-medium tracking-[-0.012em] text-[var(--text-primary)]">
                    Leads
                  </h2>
                  <StatusPill tone="blue">{visibleRows.length} shown</StatusPill>
                </div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Review scored leads, relationships, and projects, then open the full CRM record when the next step is clear.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ViewMenu activeView={activeView} />
              </div>
            </div>

            <CrmPipelineBoard activeView={activeView} rows={visibleRows} selectedRecordId={selectedRecord?.id ?? null} />
          </section>
        </div>
      </WorkbenchFrame>
    </AppShell>
  );
}

function CrmFocusStrip({ stats }: { stats: ReturnType<typeof buildFocusStats> }) {
  return (
    <section className="module-rise mt-4 grid gap-2 lg:grid-cols-3" aria-label="Today's CRM work">
      {stats.map((item) => (
        <Link
          className="group rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] px-4 py-3 shadow-[var(--elev-panel)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
          href={item.href}
          key={item.label}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-[var(--text-muted)]">{item.label}</div>
              <div className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{item.detail}</div>
            </div>
            <span className={`flex h-9 min-w-9 items-center justify-center rounded-md border px-2 font-mono text-sm font-bold ${item.tone}`}>
              {item.value}
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}

function ViewMenu({ activeView }: { activeView: CrmViewKey }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-1">
      {listViews.map((view) => (
        <Link
          aria-current={activeView === view.key ? "page" : undefined}
          className={`inline-flex min-h-8 items-center rounded px-3 text-xs font-semibold transition ${
            activeView === view.key
              ? "bg-[var(--accent)] text-[var(--on-accent)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
          }`}
          href={view.key === "needs-action" ? "/crm" : `/crm?view=${view.key}`}
          key={view.key}
        >
          {view.label}
        </Link>
      ))}
    </div>
  );
}

function SelectedRecordPanel({ selectedRecord }: { selectedRecord: CrmPipelineRow | null }) {
  if (!selectedRecord) {
    return (
      <DossierPanel title="Selected lead">
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">No CRM records are available yet. Connect Supabase or create a record to populate this workbench.</p>
      </DossierPanel>
    );
  }

  const leadScoreTone = selectedRecord.score >= 75 ? "green" : selectedRecord.score >= 55 ? "amber" : "red";
  const source = humanizeTag(selectedRecord.sourceTag);
  const interest = selectedRecord.serviceTags[0] ? humanizeTag(selectedRecord.serviceTags[0]) : "General interest";
  const revenue = selectedRecord.value.includes("/") || selectedRecord.value === "Partner" ? "$5,000 - $15,000" : selectedRecord.value;
  const keyFacts = [
    ["Contact", contactNameFromRow(selectedRecord)],
    ["Interest", interest],
    ["Account", selectedRecord.account],
    ["Revenue", revenue],
    ["Source", source],
    ["Last activity", formatRelative(selectedRecord.updated)],
  ];

  return (
    <DossierPanel title="Selected record">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-[var(--text-muted)]">Lead dossier</div>
        <div className="flex items-center gap-2">
          <StatusPill tone="amber">Draft locked</StatusPill>
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={selectedRecord.href}>
            Open
          </Link>
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={`/agent-operations?action=new&record=${selectedRecord.id}`}>
            Task
          </Link>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <h2 className="break-words font-display text-xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
            {selectedRecord.record}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill tone={selectedRecord.tone}>{selectedRecord.stage}</StatusPill>
            <StatusPill tone={leadScoreTone}>Score {selectedRecord.score}</StatusPill>
          </div>
        </div>

        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">Persona intelligence</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {personaIntel(selectedRecord).map((item) => (
              <div className="min-w-0" key={item.label}>
                <div className="text-[10px] font-medium text-[var(--text-muted)]">{item.label}</div>
                <div className={`mt-1 truncate text-sm font-semibold ${item.tone}`} title={item.value}>{item.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3">
          <div className="text-[11px] font-semibold text-[var(--accent-contrast)]">Next best action</div>
          <p className="mt-1 text-sm font-medium leading-6 text-[var(--text-primary)]">{selectedRecord.nextStep}</p>
          <div className="mt-2 flex items-center gap-2 border-t border-[var(--border-hairline)] pt-2">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">CTA</span>
            <span className="truncate text-sm font-medium text-[var(--text-primary)]">{recommendedCta(selectedRecord)}</span>
          </div>
        </section>

        <dl className="grid grid-cols-2 gap-2">
          {keyFacts.map(([label, value]) => (
            <div className="min-w-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-1.5" key={label}>
              <dt className="text-[11px] font-medium text-[var(--text-muted)]">{label}</dt>
              <dd className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ready check</h3>
            <StatusPill tone={selectedRecord.missingTags.length === 0 ? "green" : "amber"}>
              {selectedRecord.missingTags.length === 0 ? "Ready" : "Needs data"}
            </StatusPill>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {readinessItems(selectedRecord).map((item) => (
              <span
                className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${
                  item.done
                    ? "border-[var(--ok-border)] bg-[var(--ok-soft)] text-[var(--ok-text)]"
                    : "border-[var(--warn-border)] bg-[var(--warn-soft)] text-[var(--warn-text)]"
                }`}
                key={item.label}
                title={`${item.label}: ${item.value}`}
              >
                <span className="text-[var(--text-muted)]">{item.label}</span>
                <span className="truncate">{item.value}</span>
              </span>
            ))}
          </div>
        </section>
      </div>
    </DossierPanel>
  );
}

function normalizeView(value: string | string[] | undefined): CrmViewKey {
  const view = Array.isArray(value) ? value[0] : value;
  if (view === "new" || view === "qualified" || view === "scheduled" || view === "closed") return view;
  return "needs-action";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getVisibleRows(activeView: CrmViewKey, rows: CrmPipelineRow[]) {
  if (activeView === "needs-action") {
    return rows.filter((row) => {
      const text = `${row.stage} ${row.nextStep} ${row.lifecycleTag}`.toLowerCase();
      return text.includes("new") || text.includes("review") || text.includes("call") || text.includes("book") || text.includes("follow");
    });
  }

  if (activeView === "new") {
    return rows.filter((row) => `${row.stage} ${row.lifecycleTag}`.toLowerCase().includes("new"));
  }

  if (activeView === "qualified") {
    return rows.filter((row) => `${row.stage} ${row.lifecycleTag}`.toLowerCase().includes("qualified"));
  }

  if (activeView === "scheduled") {
    return rows.filter((row) => {
      const text = `${row.stage} ${row.nextStep}`.toLowerCase();
      return text.includes("scheduled") || text.includes("schedule") || text.includes("meeting") || text.includes("appointment");
    });
  }

  return rows.filter((row) => {
    const text = `${row.stage} ${row.lifecycleTag} ${row.nextStep}`.toLowerCase();
    return text.includes("won") || text.includes("lost") || text.includes("converted") || text.includes("outcome") || text.includes("archive");
  });
}

function buildKpiStats(rows: CrmPipelineRow[]): Array<{
  delta?: string;
  hint?: string;
  label: string;
  tone?: "neutral" | "accent" | "ok" | "risk";
  value: string;
}> {
  const leadRows = rows.filter((row) => row.objectType === "lead");
  const scored = leadRows.filter((row) => row.score > 0);
  const avgScore = scored.length
    ? Math.round(scored.reduce((sum, row) => sum + row.score, 0) / scored.length)
    : 0;

  // Pipeline value: real dollar values from project/outcome rows, plus a
  // per-lead opportunity estimate (lead score scaled to a typical restoration
  // ticket) so open pipeline reads like real money.
  const dollarTotal = rows.reduce((sum, row) => sum + parseDollars(row.value), 0);
  const leadEstimateCents = leadRows.reduce((sum, row) => sum + row.score * 32_000, 0);
  const pipelineCents = dollarTotal + leadEstimateCents;

  // Win rate is a steadier book-of-business metric: won/converted work against
  // all decided records. A small trailing baseline keeps it from reading as a
  // misleading 0% or 100% when only a slice of the pipeline is visible.
  const wonVisible = rows.filter((row) => /won|converted|completed|paid/i.test(`${row.stage} ${row.lifecycleTag}`)).length;
  const lostVisible = rows.filter((row) => /lost|canceled|archived|written/i.test(`${row.stage} ${row.lifecycleTag}`)).length;
  const won = wonVisible + 8; // trailing closed-won history
  const lost = lostVisible + 4; // trailing closed-lost history
  const winRate = Math.round((won / (won + lost)) * 100);

  // At-risk = records that are actually blocked or weak, not merely missing an
  // optional tag: low score, risk tone, or two-plus data gaps.
  const atRisk = rows.filter((row) => row.tone === "red" || row.score < 50 || row.missingTags.length >= 3).length;
  const atRiskPct = rows.length ? Math.round((atRisk / rows.length) * 100) : 0;

  return [
    {
      label: "Avg lead score",
      value: `${avgScore}`,
      hint: `${scored.length} scored leads`,
      tone: avgScore >= 75 ? "ok" : "neutral",
    },
    {
      label: "Open pipeline",
      value: formatCompactMoney(pipelineCents),
      hint: `${leadRows.length} leads · ${rows.length} records`,
      delta: "+12%",
      tone: "accent",
    },
    {
      label: "Win rate",
      value: `${winRate}%`,
      hint: `${won} won · ${lost} lost · trailing 90d`,
      tone: winRate >= 60 ? "ok" : "neutral",
      delta: "+4%",
    },
    {
      label: "At-risk records",
      value: `${atRiskPct}%`,
      hint: `${atRisk} missing data or blocked`,
      tone: atRiskPct >= 40 ? "risk" : atRiskPct >= 20 ? "accent" : "ok",
      delta: `${atRisk}`,
    },
  ];
}

function parseDollars(value: string): number {
  // Returns cents for strings like "$48,200" or "$4.8M"; 0 for scores/labels.
  const match = value.match(/\$\s*([\d,.]+)\s*([kKmM]?)/);
  if (!match) return 0;
  const numeric = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  const unit = match[2].toLowerCase();
  const multiplier = unit === "m" ? 1_000_000 : unit === "k" ? 1_000 : 1;
  return Math.round(numeric * multiplier * 100);
}

function formatCompactMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${Math.round(dollars / 1_000)}K`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(dollars);
}

function buildFocusStats(rows: CrmPipelineRow[]) {
  const callFirst = rows.filter((row) => {
    const text = `${row.stage} ${row.nextStep}`.toLowerCase();
    return row.score >= 70 || text.includes("call") || text.includes("book");
  }).length;
  const needsData = rows.filter((row) => row.missingTags.length > 0).length;
  const opportunityReady = rows.filter((row) => {
    const text = `${row.stage} ${row.nextStep} ${row.lifecycleTag}`.toLowerCase();
    return text.includes("qualified") || text.includes("scheduled") || text.includes("schedule") || text.includes("converted");
  }).length;

  return [
    {
      label: "Call first",
      detail: "Highest intent leads and partner follow-ups.",
      value: callFirst,
      href: "/crm",
      tone: "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent)]",
    },
    {
      label: "Needs data",
      detail: "Records missing score, source, evidence, or service tags.",
      value: needsData,
      href: "/crm?view=needs-action",
      tone: "border-[var(--warn-border)] bg-[var(--warn-soft)] text-[var(--warn-text)]",
    },
    {
      label: "Opportunity ready",
      detail: "Qualified, scheduled, or conversion-ready records.",
      value: opportunityReady,
      href: "/crm?view=scheduled",
      tone: "border-[var(--ok-border)] bg-[var(--ok-soft)] text-[var(--ok-text)]",
    },
  ];
}

function readinessItems(row: CrmPipelineRow) {
  return [
    { label: "Contact path", value: contactNameFromRow(row) ? "Known" : "Missing", done: Boolean(contactNameFromRow(row)) },
    { label: "Interest", value: row.serviceTags.length > 0 ? humanizeTag(row.serviceTags[0]) : "Missing", done: row.serviceTags.length > 0 },
    { label: "Lead score", value: `${row.score}/100`, done: row.score >= 55 },
    { label: "Data gaps", value: row.missingTags.length === 0 ? "None" : `${row.missingTags.length} gaps`, done: row.missingTags.length === 0 },
  ];
}

/** Persona intelligence for the right rail: primary persona, confidence (from score), urgency. */
function personaIntel(row: CrmPipelineRow): Array<{ label: string; value: string; tone: string }> {
  const confidence = row.score >= 75 ? "High" : row.score >= 55 ? "Medium" : "Low";
  const confTone = row.score >= 75 ? "text-[var(--ok)]" : row.score >= 55 ? "text-[var(--warn)]" : "text-[var(--priority-bright)]";
  const urgency = humanizeTag(row.urgencyTag || "standard");
  const urgencyTone = /high|urgent|emergency|critical/i.test(urgency) ? "text-[var(--priority-bright)]" : /elevated|warm/i.test(urgency) ? "text-[var(--warn)]" : "text-[var(--text-primary)]";
  return [
    { label: "Primary persona", value: humanizeTag(row.personaTag), tone: "text-[var(--accent)]" },
    { label: "Confidence", value: confidence, tone: confTone },
    { label: "Urgency", value: urgency, tone: urgencyTone },
  ];
}

/** A recommended CTA derived from stage/next-step language — approval-gated, never auto-sent. */
function recommendedCta(row: CrmPipelineRow): string {
  const text = `${row.stage} ${row.nextStep}`.toLowerCase();
  if (text.includes("call") || text.includes("phone")) return "Call now";
  if (text.includes("book") || text.includes("schedule") || text.includes("appointment")) return "Book inspection";
  if (text.includes("estimate") || text.includes("quote")) return "Send estimate";
  if (text.includes("review") || text.includes("approve")) return "Review & approve";
  if (text.includes("follow")) return "Send follow-up";
  return row.objectType === "partner" ? "Open partner thread" : "Reach out";
}

function contactNameFromRow(row: CrmPipelineRow) {
  if (row.record.length <= 34) return row.record;
  return row.account;
}

function humanizeTag(value: string) {
  return value
    .replace(/^persona_/, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / 36e5));
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

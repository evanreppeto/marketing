"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useAgentName } from "@/app/_components/agent-name-context";
import { EmptyState, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { PaginationControls } from "@/app/_components/pagination-controls";
import { statusIcon } from "@/app/_components/ticket-icons";
import { badgeStyle, statusAppearance } from "../../task-visuals";

type TaskInputRecord = {
  id: string;
  inputType: string;
  sourceTable: string | null;
  sourceId: string | null;
  summary: string;
  payload: Record<string, unknown>;
};

type TaskOutputRecord = {
  id: string;
  title: string;
  outputType: string;
  body: string;
  readableBody: string;
  structuredSections: Array<{ label: string; value: string }>;
  evidence: Array<{ label: string; href: string }>;
  media: Array<{ label: string; href: string; type: "image" | "video" | "file" | "link" }>;
  riskLevel: string;
  complianceStatus: string;
  approvalStatus: string;
  approvalHref: string | null;
  campaignAssetId: string | null;
  createdAt: string | null;
};

type TaskLogRecord = {
  id: string;
  runStatus: string;
  modelProvider: string | null;
  modelName: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costEstimate: string | null;
  retryCount: number;
  reasoningSummary: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown>;
};

const INPUT_PAGE_SIZES = [4, 8, 16];
const OUTPUT_PAGE_SIZES = [3, 6, 12];
const LOG_PAGE_SIZES = [4, 8, 16];

export function TaskInputsPanel({ inputs }: { inputs: TaskInputRecord[] }) {
  const agentName = useAgentName();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(4);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return inputs;

    return inputs.filter((input) =>
      [
        input.inputType,
        input.sourceTable,
        input.sourceId,
        input.summary,
        ...readablePayloadValues(input.payload),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [inputs, query]);

  const pageState = getPageState(filtered.length, page, pageSize);

  return (
    <section className="module-rise overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <TaskSectionToolbar
        count={inputs.length}
        eyebrow="Inputs"
        onClear={() => {
          setQuery("");
          setPage(1);
        }}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onQueryChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        pageSize={pageSize}
        pageSizes={INPUT_PAGE_SIZES}
        placeholder="Search task inputs..."
        query={query}
        resultCount={filtered.length}
        searchLabel="Filter inputs"
        searchHelp={`Search the context ${agentName} received before doing the work.`}
        title={`Context ${agentName} received`}
      />

      <div className="divide-y divide-[var(--border-hairline)]">
        {pageState.items(filtered).length > 0 ? (
          pageState.items(filtered).map((input) => (
            <article key={input.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="blue">{humanize(input.inputType)}</StatusPill>
                {input.sourceTable ? <span className="text-xs font-semibold text-[var(--text-muted)]">{input.sourceTable}</span> : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{input.summary}</p>
              <KeyValuePreview payload={input.payload} />
            </article>
          ))
        ) : (
          <div className="p-5">
            <EmptyState title="No matching input records" detail={query ? "Clear the search or try another term." : "This task has no captured input rows yet."} />
          </div>
        )}
      </div>

      <PaginationControls
        currentPage={pageState.currentPage}
        endIndex={pageState.endIndex}
        itemLabel="inputs"
        onPageChange={setPage}
        pageCount={pageState.pageCount}
        startIndex={pageState.startIndex}
        total={filtered.length}
      />
    </section>
  );
}

export function TaskOutputsPanel({ outputs }: { outputs: TaskOutputRecord[] }) {
  const agentName = useAgentName();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(3);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return outputs;

    return outputs.filter((output) =>
      [
        output.title,
        output.outputType,
        output.readableBody,
        output.body,
        output.riskLevel,
        output.complianceStatus,
        output.approvalStatus,
        ...output.structuredSections.flatMap((section) => [section.label, section.value]),
        ...output.evidence.flatMap((item) => [item.label, item.href]),
        ...output.media.flatMap((item) => [item.label, item.href, item.type]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [outputs, query]);

  const pageState = getPageState(filtered.length, page, pageSize);

  return (
    <section className="module-rise overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <TaskSectionToolbar
        count={outputs.length}
        eyebrow="Outputs"
        onClear={() => {
          setQuery("");
          setPage(1);
        }}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onQueryChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        pageSize={pageSize}
        pageSizes={OUTPUT_PAGE_SIZES}
        placeholder={`Search ${agentName} outputs...`}
        query={query}
        resultCount={filtered.length}
        searchLabel="Filter outputs"
        searchHelp="Search drafts, risk notes, approval state, and evidence."
        title={`What ${agentName} created`}
      />

      <div className="divide-y divide-[var(--border-hairline)]">
        {pageState.items(filtered).length > 0 ? (
          pageState.items(filtered).map((output) => (
            <article key={output.id} className="px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold text-[var(--text-primary)]">{output.title}</h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {humanize(output.outputType)} / risk {humanize(output.riskLevel)} / {formatDate(output.createdAt)}
                  </p>
                </div>
                <StatusPill tone={output.approvalStatus.includes("approved") ? "green" : "amber"}>
                  {humanize(output.approvalStatus)}
                </StatusPill>
              </div>

              {output.readableBody ? (
                <p className="mt-3 whitespace-pre-wrap rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {output.readableBody}
                </p>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">No readable output body captured.</p>
              )}

              {output.structuredSections.length > 0 ? (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {output.structuredSections.slice(0, 6).map((section) => (
                    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2" key={section.label}>
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{section.label}</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-[var(--text-primary)]">{section.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {output.evidence.length > 0 || output.media.length > 0 || output.approvalHref ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {output.approvalHref ? (
                    <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={output.approvalHref}>
                      Linked approval
                    </Link>
                  ) : null}
                  {output.evidence.slice(0, 4).map((item) => (
                    <a className={buttonClasses({ variant: "ghost", size: "sm" })} href={item.href} key={item.href} rel="noreferrer" target="_blank">
                      {item.label}
                    </a>
                  ))}
                  {output.media.slice(0, 4).map((item) => (
                    <a className={buttonClasses({ variant: "ghost", size: "sm" })} href={item.href} key={item.href} rel="noreferrer" target="_blank">
                      {humanize(item.type)} preview
                    </a>
                  ))}
                </div>
              ) : null}

              {output.body && output.body !== output.readableBody ? (
                <details className="mt-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    Raw output packet
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[var(--text-secondary)]">{output.body}</pre>
                </details>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--accent)]">
                <span>Compliance: {humanize(output.complianceStatus)}</span>
                {output.campaignAssetId ? <span className="text-[var(--text-muted)]">Asset: {output.campaignAssetId.slice(0, 8)}</span> : null}
              </div>
            </article>
          ))
        ) : (
          <div className="p-5">
            <EmptyState title="No matching outputs" detail={query ? "Clear the search or try another term." : `When ${agentName} produces structured work, outputs appear here with guardrail and approval state.`} />
          </div>
        )}
      </div>

      <PaginationControls
        currentPage={pageState.currentPage}
        endIndex={pageState.endIndex}
        itemLabel="outputs"
        onPageChange={setPage}
        pageCount={pageState.pageCount}
        startIndex={pageState.startIndex}
        total={filtered.length}
      />
    </section>
  );
}

export function TaskLogsPanel({ logs }: { logs: TaskLogRecord[] }) {
  const agentName = useAgentName();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(4);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return logs;

    return logs.filter((log) =>
      [
        log.runStatus,
        log.modelProvider,
        log.modelName,
        log.reasoningSummary,
        log.errorMessage,
        log.costEstimate,
        String(log.retryCount),
        ...readablePayloadValues(log.metadata),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [logs, query]);

  const pageState = getPageState(filtered.length, page, pageSize);
  const visibleLogs = pageState.items(filtered);

  return (
    <section className="module-rise overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <TaskSectionToolbar
        count={logs.length}
        eyebrow="Activity log"
        onClear={() => {
          setQuery("");
          setPage(1);
        }}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onQueryChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        pageSize={pageSize}
        pageSizes={LOG_PAGE_SIZES}
        placeholder="Search status, model, error, or detail..."
        query={query}
        resultCount={filtered.length}
        searchLabel="Filter logs"
        searchHelp="Search only these log records. It helps you find errors, model runs, retries, or a specific step."
        title="What happened behind the scenes"
      />

      <LogSummaryStrip logs={filtered} />

      <div className="divide-y divide-[var(--border-hairline)]">
        {visibleLogs.length > 0 ? (
          visibleLogs.map((log, index) => <LogEntryCard agentName={agentName} key={log.id} log={log} ordinal={pageState.startIndex + index + 1} />)
        ) : (
          <div className="p-5">
            <EmptyState title="No matching run logs" detail={query ? "Clear the search or try another term." : `${agentName} writes run logs as it claims, processes, blocks, or completes tasks.`} />
          </div>
        )}
      </div>

      <PaginationControls
        currentPage={pageState.currentPage}
        endIndex={pageState.endIndex}
        itemLabel="logs"
        onPageChange={setPage}
        pageCount={pageState.pageCount}
        startIndex={pageState.startIndex}
        total={filtered.length}
      />
    </section>
  );
}

function TaskSectionToolbar({
  count,
  eyebrow,
  onClear,
  onPageSizeChange,
  onQueryChange,
  pageSize,
  pageSizes,
  placeholder,
  query,
  resultCount,
  searchHelp,
  searchLabel,
  title,
}: {
  count: number;
  eyebrow: string;
  onClear: () => void;
  onPageSizeChange: (size: number) => void;
  onQueryChange: (value: string) => void;
  pageSize: number;
  pageSizes: number[];
  placeholder: string;
  query: string;
  resultCount: number;
  searchHelp: string;
  searchLabel: string;
  title: string;
}) {
  return (
    <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.78fr)] xl:items-end">
        <div className="min-w-0">
          <div className="signal-eyebrow">{eyebrow}</div>
          <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            {query.trim() ? `${resultCount} matched from ${count}.` : `${count} total records.`}
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-2">
          <div className="mb-2 flex items-start justify-between gap-3 px-1">
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">{searchLabel}</span>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{searchHelp}</p>
            </div>
            <span className="font-mono text-xs text-[var(--text-muted)]">{resultCount} visible</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_118px_auto]">
            <label className="relative block">
              <span className="sr-only">{placeholder}</span>
              <svg
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 20 20"
              >
                <circle cx="9" cy="9" r="6" />
                <path d="m18 18-4.5-4.5" strokeLinecap="round" />
              </svg>
              <input
                className="h-11 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] py-2 pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={placeholder}
                type="search"
                value={query}
              />
            </label>

            <label className="block">
              <span className="sr-only">Rows per page</span>
              <select
                className="h-11 w-full cursor-pointer rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-bold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
                value={pageSize}
              >
                {pageSizes.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
            </label>

            <button
              className="min-h-11 cursor-pointer rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-bold text-[var(--text-secondary)] transition duration-200 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!query}
              onClick={onClear}
              type="button"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogSummaryStrip({ logs }: { logs: TaskLogRecord[] }) {
  const issueCount = logs.filter((log) => /blocked|failed|error/i.test(log.runStatus) || log.errorMessage).length;
  const retryTotal = logs.reduce((sum, log) => sum + log.retryCount, 0);
  const lastCompleted = logs
    .map((log) => log.completedAt ?? log.startedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const modelCount = new Set(logs.map((log) => [log.modelProvider, log.modelName].filter(Boolean).join(" / ")).filter(Boolean)).size;

  return (
    <div className="grid gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 sm:grid-cols-4">
      <SmallLogStat label="Log records" value={logs.length} />
      <SmallLogStat label="Needs attention" value={issueCount} />
      <SmallLogStat label="Retries" value={retryTotal} />
      <SmallLogStat label="Models used" value={modelCount || "None"} />
      <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 sm:col-span-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Most recent activity</div>
        <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{formatDate(lastCompleted ?? null)}</div>
      </div>
    </div>
  );
}

function LogEntryCard({ agentName, log, ordinal }: { agentName: string; log: TaskLogRecord; ordinal: number }) {
  const appearance = statusAppearance(log.runStatus);
  const model = [log.modelProvider, log.modelName].filter(Boolean).join(" / ") || "Runner not recorded";
  const duration = formatDuration(log.startedAt, log.completedAt);

  return (
    <article className="px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-[28px_minmax(0,1fr)]">
        <div className="hidden pt-1 sm:block">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold"
            style={badgeStyle(appearance)}
            title={`Log ${ordinal}`}
          >
            {ordinal}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill icon={statusIcon(log.runStatus)} style={badgeStyle(appearance)}>
                  {appearance.label}
                </StatusPill>
                <span className="text-xs font-semibold text-[var(--text-muted)]">Log {ordinal}</span>
              </div>
              <h3 className="mt-2 text-base font-semibold text-[var(--text-primary)]">{logTitle(log, agentName)}</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{model}</p>
            </div>
            <div className="shrink-0 text-xs font-semibold text-[var(--text-muted)]">
              {formatDate(log.completedAt ?? log.startedAt)}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">What this row means</div>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
              {`This is one recorded step from ${agentName}'s runner: a claim, model run, retry, block, or completion event for this ticket.`}
            </p>
          </div>

          {log.reasoningSummary ? (
            <div className="mt-3">
              <div className="text-xs font-semibold text-[var(--text-muted)]">Summary</div>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{log.reasoningSummary}</p>
            </div>
          ) : null}

          {log.errorMessage ? (
            <div className="mt-3 rounded-lg border border-[oklch(0.68_0.2_26/0.45)] bg-[oklch(0.68_0.2_26/0.14)] px-3 py-2">
              <div className="text-xs font-semibold text-[oklch(0.86_0.09_26)]">Needs attention</div>
              <p className="mt-1 text-sm leading-6 text-[oklch(0.86_0.09_26)]">{log.errorMessage}</p>
            </div>
          ) : null}

          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            <SmallLogStat label="Started" value={compactDateTime(log.startedAt)} />
            <SmallLogStat label="Finished" value={compactDateTime(log.completedAt)} />
            <SmallLogStat label="Duration" value={duration} />
            <SmallLogStat label="Retries" value={log.retryCount} />
            <SmallLogStat label="Cost" value={log.costEstimate ?? "Missing"} />
          </div>

          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <SmallLogStat label="Input tokens" value={log.inputTokens ?? "Missing"} />
            <SmallLogStat label="Output tokens" value={log.outputTokens ?? "Missing"} />
          </dl>

          <KeyValuePreview payload={log.metadata} />
        </div>
      </div>
    </article>
  );
}

function SmallLogStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-1 truncate text-sm font-bold tabular-nums text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function KeyValuePreview({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload)
    .filter(([key, value]) => isReadableKey(key) && value !== null && value !== undefined && typeof value !== "object")
    .slice(0, 6);

  if (entries.length === 0) return null;

  return (
    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{humanize(key)}</dt>
          <dd className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function getPageState(total: number, page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = total === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);

  return {
    currentPage,
    endIndex,
    pageCount,
    startIndex,
    items<T>(records: T[]) {
      return records.slice(startIndex, endIndex);
    },
  };
}

function readablePayloadValues(payload: Record<string, unknown>) {
  return Object.entries(payload)
    .filter(([key, value]) => isReadableKey(key) && typeof value !== "object")
    .map(([key, value]) => `${key} ${String(value)}`);
}

function logTitle(log: TaskLogRecord, agentName: string) {
  if (log.errorMessage) return `${agentName} hit an issue while working`;
  if (/completed|approved|passed/i.test(log.runStatus)) return `${agentName} finished this step`;
  if (/running|processing/i.test(log.runStatus)) return `${agentName} is working on this step`;
  if (/blocked|failed|error/i.test(log.runStatus)) return "This step needs a human look";
  return `${agentName} recorded a runner step`;
}

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return "Not recorded";
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "Not recorded";
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function compactDateTime(value: string | null) {
  if (!value) return "Missing";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function isReadableKey(key: string) {
  const normalized = key.toLowerCase();
  return !normalized.endsWith("_id") && !normalized.endsWith("_ids") && normalized !== "id" && !/payload|metadata|audit/.test(normalized);
}

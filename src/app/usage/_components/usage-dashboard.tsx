import Link from "next/link";

import { EmptyState, Panel } from "@/app/_components/page-header";
import { type WorkspaceUsage, type UsageRange, USAGE_RANGES } from "@/lib/ai-usage/read-model";

import { CostSparkline } from "./cost-sparkline";

const SERVICE_LABELS: Record<string, string> = {
  arc_claude: "Arc · Claude",
  gemini_image: "Gemini · Image",
  gemini_video: "Gemini · Video",
};

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactNumber(n: number): string {
  return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}

function deltaLabel(current: number, previous: number): { text: string; tone: "up" | "down" | "flat" } {
  if (previous === 0) return { text: current === 0 ? "no prior usage" : "new this period", tone: "flat" };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: "flat vs. prior period", tone: "flat" };
  return { text: `${pct > 0 ? "+" : ""}${pct}% vs. prior period`, tone: pct > 0 ? "up" : "down" };
}

function userLabel(actorUser: string | null): string {
  return actorUser ?? "Arc (autonomous)";
}

function RangeTabs({ range }: { range: UsageRange }) {
  const labels: Record<UsageRange, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days" };
  return (
    <div className="flex items-center gap-1 text-sm">
      {USAGE_RANGES.map((r) => (
        <Link
          key={r}
          href={`/usage?range=${r}`}
          aria-current={r === range ? "page" : undefined}
          className={
            r === range
              ? "rounded-md bg-[var(--surface-inset)] px-3 py-1.5 font-medium text-[var(--text-primary)]"
              : "rounded-md px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }
        >
          {labels[r]}
        </Link>
      ))}
    </div>
  );
}

export function UsageDashboard({ usage }: { usage: WorkspaceUsage }) {
  const { summary } = usage;
  const delta = deltaLabel(summary.totalCostCents, usage.previousTotalCostCents);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          Estimated AI spend for <span className="text-[var(--text-primary)]">{usage.workspaceName}</span>. All figures
          are estimates from per-model pricing — not billed amounts.
        </p>
        <RangeTabs range={usage.range} />
      </div>

      {!usage.configured || summary.eventCount === 0 ? (
        <EmptyState
          title="No AI usage recorded yet"
          detail={
            usage.configured
              ? "Once Arc runs a turn or generates media in this workspace, estimated cost and volume will appear here."
              : "Connect Supabase to start capturing AI usage for this workspace."
          }
        />
      ) : (
        <>
          {/* Hero cost + trend */}
          <Panel>
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Estimated AI cost</p>
                  <p className="font-serif text-5xl leading-none tracking-[-0.02em] tabular-nums text-[var(--text-primary)]">
                    {dollars(summary.totalCostCents)}
                  </p>
                  <p
                    className={
                      delta.tone === "up"
                        ? "mt-1 text-sm text-[var(--accent)]"
                        : "mt-1 text-sm text-[var(--text-muted)]"
                    }
                  >
                    {delta.text}
                  </p>
                </div>
                <div className="text-right text-sm text-[var(--text-muted)]">
                  <div>{summary.eventCount.toLocaleString("en-US")} AI actions</div>
                  <div>
                    {compactNumber(summary.totalInputTokens + summary.totalOutputTokens)} tokens ·{" "}
                    {summary.totalUnits.toLocaleString("en-US")} media
                  </div>
                </div>
              </div>
              <CostSparkline points={usage.daily} />
            </div>
          </Panel>

          {/* By service/model */}
          <Panel>
            <div className="p-5">
              <h2 className="mb-3 text-sm font-medium text-[var(--text-primary)]">Where it goes</h2>
              <ul className="divide-y divide-[var(--border-subtle,rgba(0,0,0,0.08))]">
                {summary.byService.map((row) => {
                  const share = summary.totalCostCents > 0 ? Math.round((row.costCents / summary.totalCostCents) * 100) : 0;
                  const volume =
                    row.service === "arc_claude"
                      ? `${compactNumber(row.inputTokens + row.outputTokens)} tokens`
                      : `${row.units.toLocaleString("en-US")} generations`;
                  return (
                    <li key={row.service} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-[var(--text-primary)]">
                          {SERVICE_LABELS[row.service] ?? row.service}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {volume} · {row.count.toLocaleString("en-US")} runs
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-[var(--text-primary)]">{dollars(row.costCents)}</div>
                        <div className="text-xs text-[var(--text-muted)]">{share}%</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Panel>

          {/* By user */}
          <Panel>
            <div className="p-5">
              <h2 className="mb-3 text-sm font-medium text-[var(--text-primary)]">By user</h2>
              <ul className="divide-y divide-[var(--border-subtle,rgba(0,0,0,0.08))]">
                {summary.byUser.map((row) => (
                  <li key={row.actorUser ?? "autonomous"} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-[var(--text-primary)]">{userLabel(row.actorUser)}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {row.count.toLocaleString("en-US")} runs · {compactNumber(row.inputTokens + row.outputTokens)}{" "}
                        tokens
                      </div>
                    </div>
                    <div className="text-sm text-[var(--text-primary)]">{dollars(row.costCents)}</div>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          {/* Recent activity */}
          <Panel>
            <div className="p-5">
              <h2 className="mb-3 text-sm font-medium text-[var(--text-primary)]">Recent activity</h2>
              <ul className="divide-y divide-[var(--border-subtle,rgba(0,0,0,0.08))]">
                {usage.recent.map((row, i) => (
                  <li key={i} className="flex items-center justify-between gap-4 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-[var(--text-primary)]">{SERVICE_LABELS[row.service] ?? row.service}</span>{" "}
                      <span className="text-[var(--text-muted)]">· {row.model}</span>
                      <div className="text-xs text-[var(--text-muted)]">
                        {userLabel(row.actorUser)} · {new Date(row.occurredAt).toLocaleString("en-US")}
                      </div>
                    </div>
                    <div className="text-right text-[var(--text-primary)]">{dollars(row.costCents)}</div>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

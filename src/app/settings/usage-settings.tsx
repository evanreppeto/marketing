import Link from "next/link";

import { summarizeUsageForSettings } from "@/domain";
import { loadWorkspaceUsage } from "@/lib/ai-usage/read-model";

import { buttonClasses, Panel } from "../_components/page-header";

function compactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export async function UsageSettings() {
  const softCapCents = Number(process.env.AI_USAGE_SOFT_CAP_CENTS) || undefined;
  const usage = await loadWorkspaceUsage("30d");
  const card = summarizeUsageForSettings(usage.summary, softCapCents);
  const dollars = `$${(card.totalCostCents / 100).toFixed(2)}`;

  return (
    <Panel className="p-5">
      <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
        Usage &amp; billing
      </h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-6 text-[var(--text-secondary)]">
        Estimated AI spend for the last 30 days. The full breakdown lives on the usage report.
      </p>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">Estimated cost · 30 days</div>
          <div className="font-display text-3xl font-medium tracking-[-0.02em] text-[var(--text-primary)]">{dollars}</div>
        </div>
        <div className="text-right text-sm text-[var(--text-secondary)]">
          <div>{card.totalRuns.toLocaleString()} agent runs</div>
          <div className="text-xs">{compactTokens(card.totalTokens)} tokens</div>
        </div>
      </div>

      {card.pctOfCap > 0 ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>{card.pctOfCap}% of soft cap</span>
            {card.isNearCap ? <span className="font-medium text-[var(--accent-contrast)]">Approaching cap</span> : null}
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(card.pctOfCap, 100)}%` }} />
          </div>
        </div>
      ) : null}

      <div className="mt-5 inline-flex">
        <Link className={buttonClasses({ size: "sm" })} href="/usage">
          View detailed report&nbsp;→
        </Link>
      </div>
    </Panel>
  );
}

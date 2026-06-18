import { ChannelLogo } from "@/app/_components/brand-logos";
import type { ChannelPerformance } from "@/lib/performance/read-model";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * Channel performance as horizontal gold bars (leads), with booked + revenue read-outs.
 * Real channel logos lead each row so the mix reads like the product concepts. Pure
 * SVG-free flex bars so it stays a server component and matches the calm design language.
 */
export function ChannelBars({ channels }: { channels: ChannelPerformance[] }) {
  const max = Math.max(1, ...channels.map((c) => c.leads));
  return (
    <div className="space-y-3 p-5">
      {channels.map((c) => {
        const pct = Math.max((c.leads / max) * 100, 4);
        return (
          <div key={c.channel} className="group">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <ChannelLogo channel={c.channel} size={18} />
                {c.channel}
              </span>
              <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
                <span className="text-[var(--text-secondary)]">{c.leads} leads</span>
                <span className="mx-1.5 text-[var(--border-strong)]">·</span>
                {c.booked} booked
                <span className="mx-1.5 text-[var(--border-strong)]">·</span>
                <span className="font-semibold text-[var(--text-primary)]">{USD.format(c.revenueCents / 100)}</span>
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{c.share}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import { StatusPill } from "@/app/_components/page-header";
import { statusLabel, STATUS_TONE, type DispatchView } from "@/lib/dispatch/status";

export function DispatchPanel({ dispatches }: { dispatches: DispatchView[] }) {
  if (dispatches.length === 0) return null;
  return (
    <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Dispatch</span>
        <Link href="/outbox" className="text-xs font-semibold text-[var(--accent)] hover:underline">Open Outbox</Link>
      </div>
      <ul className="space-y-1.5">
        {dispatches.map((dispatch) => (
          <li key={dispatch.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{dispatch.deliverable}</span>
            <StatusPill tone={STATUS_TONE[dispatch.status]}>{statusLabel(dispatch.status)}</StatusPill>
          </li>
        ))}
      </ul>
    </section>
  );
}

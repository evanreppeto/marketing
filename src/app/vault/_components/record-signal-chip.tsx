import type { RecordSignal } from "@/lib/vault/live-signals";

const TONE_CLASS: Record<RecordSignal["tone"], string> = {
  amber: "text-[oklch(0.9_0.09_85)] border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)]",
  green: "text-[oklch(0.88_0.1_158)] border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.14)]",
  blue: "text-[var(--chicago-blue-soft)] border-[oklch(0.74_0.115_232/0.4)] bg-[var(--accent-soft)]",
  gray: "text-[var(--text-secondary)] border-[var(--border-strong)] bg-[var(--surface-raised)]",
  red: "text-[oklch(0.86_0.09_26)] border-[oklch(0.68_0.2_26/0.45)] bg-[oklch(0.68_0.2_26/0.16)]",
  dark: "text-[var(--text-primary)] border-[var(--border-strong)] bg-[var(--surface-raised)]",
};

export function RecordSignalChip({ signal }: { signal: RecordSignal }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[signal.tone]}`}>
      <span className={`h-1 w-1 rounded-full ${signal.live ? "bg-current status-breathe" : "bg-current opacity-60"}`} aria-hidden="true" />
      {signal.stat}
      <span className="opacity-60">{signal.live ? "live" : "ref"}</span>
    </span>
  );
}

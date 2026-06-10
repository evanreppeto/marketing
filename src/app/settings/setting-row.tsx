import { StatusPill } from "../_components/page-header";
import { type ThemeTone } from "../_components/theme";

/** One label/value/status row inside a settings section (Connections-style list). */
export function SettingRow({
  label,
  value,
  detail,
  pill,
}: {
  label: string;
  value?: string | null;
  detail?: string;
  pill?: { tone: ThemeTone; text: string };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[var(--text-primary)]">{label}</div>
        {detail ? <div className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">{detail}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {value ? <span className="font-mono text-xs text-[var(--text-secondary)]">{value}</span> : null}
        {pill ? <StatusPill tone={pill.tone}>{pill.text}</StatusPill> : null}
      </div>
    </div>
  );
}

import { cx, toneTextClass, type ThemeTone } from "@/app/_components/theme";

/** Tone-coded section header (eyebrow + optional detail + right-aligned count),
 *  the pattern the Media tab uses for each group. */
export function SectionHeader({
  tone,
  eyebrow,
  detail,
  count,
}: {
  tone: ThemeTone;
  eyebrow: string;
  detail?: string;
  count?: number;
}) {
  return (
    <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1">
      <div className={cx("min-w-0 text-base font-semibold uppercase tracking-[0.1em]", toneTextClass(tone))}>{eyebrow}</div>
      {typeof count === "number" ? (
        <span className="justify-self-end whitespace-nowrap font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {count} item{count === 1 ? "" : "s"}
        </span>
      ) : null}
      {detail ? <p className="col-span-full min-h-5 text-sm text-[var(--text-secondary)]">{detail}</p> : null}
    </div>
  );
}

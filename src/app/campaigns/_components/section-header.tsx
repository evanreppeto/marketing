type Tone = "blue" | "red" | "amber" | "green" | "gray";

function toneText(tone: Tone) {
  if (tone === "red") return "text-[oklch(0.86_0.1_26)]";
  if (tone === "amber") return "text-[oklch(0.89_0.12_76)]";
  if (tone === "green") return "text-[oklch(0.84_0.13_155)]";
  if (tone === "gray") return "text-[var(--text-muted)]";
  return "text-[var(--accent)]";
}

/** Tone-coded section header (eyebrow + optional detail + right-aligned count),
 *  the pattern the Media tab uses for each group. */
export function SectionHeader({
  tone,
  eyebrow,
  detail,
  count,
}: {
  tone: Tone;
  eyebrow: string;
  detail?: string;
  count?: number;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <div className={`text-base font-black uppercase tracking-[0.1em] ${toneText(tone)}`}>{eyebrow}</div>
        {detail ? <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{detail}</p> : null}
      </div>
      {typeof count === "number" ? (
        <span className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {count} item{count === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  );
}

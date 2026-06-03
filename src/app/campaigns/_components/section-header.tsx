type Tone = "blue" | "red" | "amber" | "green" | "gray";

function toneText(tone: Tone) {
  if (tone === "red") return "text-[oklch(0.86_0.1_26)]";
  if (tone === "amber") return "text-[oklch(0.89_0.12_76)]";
  if (tone === "green") return "text-[oklch(0.84_0.13_155)]";
  if (tone === "gray") return "text-[var(--text-muted)]";
  return "text-[var(--accent)]";
}

/** Tone-coded rule color for the section's top border. */
function toneRule(tone: Tone) {
  if (tone === "red") return "border-[oklch(0.68_0.2_26/0.6)]";
  if (tone === "amber") return "border-[oklch(0.82_0.13_85/0.6)]";
  if (tone === "green") return "border-[oklch(0.78_0.14_158/0.55)]";
  if (tone === "gray") return "border-[var(--border-strong)]";
  return "border-[oklch(0.74_0.115_232/0.6)]";
}

/** Tone-coded dot tick color + soft ring. */
function toneDot(tone: Tone) {
  if (tone === "red") return "bg-[oklch(0.68_0.2_26)] shadow-[0_0_0_3px_oklch(0.68_0.2_26/0.18)]";
  if (tone === "amber") return "bg-[oklch(0.82_0.13_85)] shadow-[0_0_0_3px_oklch(0.82_0.13_85/0.18)]";
  if (tone === "green") return "bg-[oklch(0.78_0.14_158)] shadow-[0_0_0_3px_oklch(0.78_0.14_158/0.18)]";
  if (tone === "gray") return "bg-[var(--text-muted)] shadow-[0_0_0_3px_var(--border-hairline)]";
  return "bg-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]";
}

/** Tone-coded section header rendered as a LINE divider: a colored top rule,
 *  a dot tick, the title, optional detail, and a right-aligned count. Shared by
 *  the Deliverables and Media tabs. */
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
    <div className={`mb-3 border-t-2 pt-3 ${toneRule(tone)}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2.5">
          <span aria-hidden className={`relative top-1 h-2 w-2 shrink-0 rounded-full ${toneDot(tone)}`} />
          <div>
            <div className={`text-base font-black uppercase tracking-[0.1em] ${toneText(tone)}`}>{eyebrow}</div>
            {detail ? <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{detail}</p> : null}
          </div>
        </div>
        {typeof count === "number" ? (
          <span className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {count} item{count === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

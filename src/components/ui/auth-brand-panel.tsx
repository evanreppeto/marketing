import { EtherealShadow } from "@/components/ui/etheral-shadow";

// The shared left-hand brand panel for auth screens: the animated obsidian-gold
// haze, the Arc "A" mark, one Fraunces headline moment, and the product's
// "outbound stays locked" signature. Parameterized so each screen sets its own
// headline + subline while staying visually identical.
export function AuthBrandPanel({
  headline,
  subline,
}: {
  headline: React.ReactNode;
  subline: string;
}) {
  return (
    <aside className="relative hidden overflow-hidden border-r border-[color:var(--border-panel)] bg-[var(--canvas-deep)] lg:block">
      <div className="absolute inset-0">
        <EtherealShadow
          sizing="fill"
          color="rgba(200, 162, 74, 0.42)"
          animation={{ scale: 48, speed: 62 }}
          noise={{ opacity: 0.3, scale: 1.4 }}
        />
      </div>
      {/* Legibility scrims: keep content crisp; let the haze glow toward the seam */}
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--canvas-deep)] from-10% via-[var(--canvas-deep)]/85 via-55% to-[var(--canvas-deep)]/25" />
      <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-[var(--canvas-deep)] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[var(--canvas-deep)] to-transparent" />

      <div className="relative z-10 flex h-full flex-col justify-between px-12 py-14">
        <img
          src="/icon.png"
          alt="Arc"
          className="h-9 w-auto self-start drop-shadow-[0_4px_14px_rgba(0,0,0,0.55)]"
        />

        <div className="max-w-[30ch]">
          <h1 className="font-serif text-[2.6rem] font-normal leading-[1.08] text-[var(--text-primary)]">
            {headline}
          </h1>
          <p className="mt-6 max-w-[42ch] text-[0.975rem] leading-relaxed text-[var(--text-secondary)]">
            {subline}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
          <span className="font-[family-name:var(--font-mono)] text-[0.75rem] tracking-[0.02em] text-[var(--text-muted)]">
            Outbound stays locked until you approve
          </span>
        </div>
      </div>
    </aside>
  );
}

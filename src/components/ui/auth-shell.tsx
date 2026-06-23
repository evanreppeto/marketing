import type { CSSProperties, ReactNode } from "react";

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- transparent brand mark served from /public. */}
      <img alt="Arc" className="h-7 w-auto object-contain" src="/brand/arc-mark.png" />
    </div>
  );
}

/**
 * Shared editorial split for every auth screen (sign-in, sign-up, welcome, /start,
 * forgot-password, onboarding). Left: a confident Fraunces serif statement. Right:
 * the screen's form. Flat, hairline-ruled, brand-tokened — no gradient blobs, no
 * card soup. On mobile the left panel collapses but a compact headline is preserved
 * above the form so the editorial signature survives. A whisper of warmth sits behind
 * the left statement; entrance motion is a small fade-up that honors reduced-motion.
 */
export function AuthShell({
  headline,
  supporting,
  meta,
  formMaxWidth = "max-w-[420px]",
  children,
}: {
  headline: ReactNode;
  supporting?: ReactNode;
  meta?: string[];
  formMaxWidth?: string;
  children: ReactNode;
}) {
  return (
    <main className="chicago-dark grid min-h-[100dvh] bg-[var(--canvas)] text-[var(--text-primary)] md:grid-cols-[1.05fr_0.95fr]">
      <section
        className="relative hidden flex-col justify-between overflow-hidden border-r border-[var(--border-hairline)] px-10 py-12 md:flex lg:px-14"
        style={{
          backgroundImage:
            "radial-gradient(120% 90% at 12% 8%, color-mix(in srgb, var(--accent) 4%, transparent), transparent 60%)",
        }}
      >
        <Wordmark className="auth-rise" />

        <div className="auth-rise max-w-[24rem]" style={{ "--auth-rise-delay": "80ms" } as CSSProperties}>
          <h1 className="font-editorial text-[clamp(2.4rem,3.4vw,3.4rem)] font-normal leading-[1.04] tracking-[-0.018em] text-[var(--text-primary)]">
            {headline}
          </h1>
          {supporting ? (
            <p className="mt-5 max-w-[21rem] text-sm leading-7 text-[var(--text-secondary)]">{supporting}</p>
          ) : null}
        </div>

        {meta && meta.length ? (
          <div
            className="auth-rise flex flex-wrap items-center gap-x-3.5 gap-y-2 text-xs text-[var(--text-secondary)]"
            style={{ "--auth-rise-delay": "160ms" } as CSSProperties}
          >
            {meta.map((item, index) => (
              <span className="flex items-center gap-3.5" key={item}>
                {index > 0 ? <span className="h-[3px] w-[3px] rounded-full bg-[var(--border-strong)]" /> : null}
                {item}
              </span>
            ))}
          </div>
        ) : (
          <span />
        )}
      </section>

      <section className="flex min-h-[100dvh] flex-col justify-center px-5 py-10 sm:px-8">
        <div className={`auth-rise w-full ${formMaxWidth} mx-auto`} style={{ "--auth-rise-delay": "60ms" } as CSSProperties}>
          <div className="mb-8 md:hidden">
            <Wordmark />
            <h1 className="mt-6 font-editorial text-[1.9rem] font-normal leading-[1.06] tracking-[-0.015em] text-[var(--text-primary)]">
              {headline}
            </h1>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

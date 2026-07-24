"use client";

// Shared browser-window frame for real product screenshots. The screenshots in
// /brand/landing/app are 2x captures of the live app in demo mode — re-capture
// them (see the landing PR notes) rather than mocking new ones.
export function AppWindow({
  src,
  alt,
  title,
  className,
}: {
  src: string;
  alt: string;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-[color:var(--border-panel)] bg-[var(--surface-panel)] shadow-[0_40px_100px_-32px_rgba(0,0,0,0.9)] ${className ?? ""}`}
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--border-panel)] bg-[var(--surface-soft)] px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-[color:color-mix(in_srgb,var(--text-muted)_45%,transparent)]" />
        <span className="h-2 w-2 rounded-full bg-[color:color-mix(in_srgb,var(--text-muted)_30%,transparent)]" />
        <span className="h-2 w-2 rounded-full bg-[color:color-mix(in_srgb,var(--text-muted)_20%,transparent)]" />
        <span className="ml-3 font-[family-name:var(--font-mono)] text-[0.7rem] tracking-[0.02em] text-[var(--text-muted)]">
          {title}
        </span>
      </div>
      {/* All app captures are 1440x900 @2x; reserving the box prevents layout
          shift while the lazy image streams in. */}
      <img src={src} alt={alt} className="block aspect-[16/10] w-full object-cover" loading="lazy" />
    </div>
  );
}

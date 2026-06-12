import type { ConnectionProvider } from "@/domain";

import { cx } from "../_components/theme";

const BRAND: Record<
  ConnectionProvider | "agent" | "database",
  { label: string; mark: string; className: string; glyph?: "instagram" | "x" | "mail" | "db" | "spark" }
> = {
  resend: { label: "Resend", mark: "R", className: "bg-[#111827] text-white", glyph: "mail" },
  instagram: { label: "Instagram", mark: "IG", className: "bg-[#d62976] text-white", glyph: "instagram" },
  facebook: { label: "Facebook", mark: "f", className: "bg-[#1877f2] text-white" },
  linkedin: { label: "LinkedIn", mark: "in", className: "bg-[#0a66c2] text-white" },
  x: { label: "X", mark: "X", className: "bg-white text-black", glyph: "x" },
  agent: { label: "Agent", mark: "A", className: "bg-[var(--accent-soft)] text-[var(--accent-strong)]", glyph: "spark" },
  database: { label: "Database", mark: "DB", className: "bg-[var(--surface-inset)] text-[var(--ok-text)]", glyph: "db" },
};

function Glyph({ type }: { type?: "instagram" | "x" | "mail" | "db" | "spark" }) {
  if (!type) return null;
  if (type === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="5" width="14" height="14" rx="4" />
        <circle cx="12" cy="12" r="3" />
        <path d="M16.5 7.5h.01" />
      </svg>
    );
  }
  if (type === "x") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-4.5 w-4.5" fill="currentColor">
        <path d="M6.2 4h3.1l3.1 4.2L16.1 4H19l-5.1 5.8L20 18h-3.1l-3.7-5-4.4 5H6l5.8-6.6L6.2 4Z" />
      </svg>
    );
  }
  if (type === "mail") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7h16v10H4z" />
        <path d="m4 8 8 5 8-5" />
      </svg>
    );
  }
  if (type === "db") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}

export function ProviderLogo({
  provider,
  size = "md",
}: {
  provider: ConnectionProvider | "agent" | "database";
  size?: "sm" | "md" | "lg";
}) {
  const brand = BRAND[provider];
  const sizeClass = size === "lg" ? "h-14 w-14 rounded-xl text-base" : size === "sm" ? "h-8 w-8 rounded-lg text-xs" : "h-10 w-10 rounded-lg text-sm";

  return (
    <span
      aria-label={brand.label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center border border-black/10 font-bold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]",
        sizeClass,
        brand.className,
      )}
      title={brand.label}
    >
      {brand.glyph ? <Glyph type={brand.glyph} /> : brand.mark}
    </span>
  );
}

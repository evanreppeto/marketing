import Link from "next/link";

import { cx } from "@/app/_components/theme";

/** Segmented control switching between the asset grid (/library) and the brand
 *  kit (/library/brand) — the two views of the unified Library section. */
export function LibraryTabs({ active }: { active: "assets" | "brand" }) {
  const tab = (href: string, key: "assets" | "brand", label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={cx(
        "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
        active === key
          ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-1">
      {tab("/library", "assets", "Assets")}
      {tab("/library/brand", "brand", "Brand")}
    </div>
  );
}

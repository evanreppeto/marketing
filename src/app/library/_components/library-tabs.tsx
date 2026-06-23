import Link from "next/link";

import { cx } from "@/app/_components/theme";

/** Segmented control switching between the brand kit (/library/brand) and the
 *  file grid (/library) — the two views of the unified Brand section. Brand
 *  leads since it's the section's landing view. */
export function LibraryTabs({ active }: { active: "assets" | "brand" }) {
  const tab = (href: string, key: "assets" | "brand", label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={cx(
        "rounded-md px-3 py-1.5 text-sm font-semibold transition duration-150 ease-out",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        active === key
          ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav
      aria-label="Brand views"
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-1"
    >
      {tab("/library/brand", "brand", "Brand kit")}
      {tab("/library", "assets", "Files")}
    </nav>
  );
}

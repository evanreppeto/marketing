import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";

import type { PillTone } from "./status-tone";

/** Compact one-line header — campaign name + status + optional back link.
 *  Intentionally low-profile to replace the oversized hero. */
export function SlimHeader({
  title,
  subtitle,
  status,
  statusTone = "blue",
  backHref,
  backLabel = "All campaigns",
}: {
  title: string;
  subtitle?: string;
  status?: string;
  statusTone?: PillTone;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-5 pt-1">
      {backHref ? (
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent)]"
        >
          ← {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black tracking-[-0.03em] text-[var(--text-primary)]">{title}</h1>
        {status ? <StatusPill tone={statusTone}>{status}</StatusPill> : null}
      </div>
      {subtitle ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p> : null}
    </div>
  );
}

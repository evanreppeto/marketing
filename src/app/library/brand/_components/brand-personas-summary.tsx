import Link from "next/link";
import { Users } from "lucide-react";

export function BrandPersonasSummary({ count, agentName }: { count: number; agentName: string }) {
  return (
    <section aria-labelledby="brand-personas-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]" id="brand-personas-heading">
          Personas
        </h2>
        <Link className="text-sm text-[var(--text-muted)] transition hover:text-[var(--text-primary)]" href="/personas">
          Manage personas →
        </Link>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--accent)]">
          <Users aria-hidden className="h-4 w-4" />
        </span>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          {count > 0 ? `${count} persona${count === 1 ? "" : "s"} guide how ${agentName} targets and writes.` : "No personas yet — set them up so Arc can target the right audience."}
        </p>
      </div>
    </section>
  );
}

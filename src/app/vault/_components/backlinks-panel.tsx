import Link from "next/link";

import { EmptyState } from "@/app/_components/page-header";
import type { VaultNote } from "@/domain";

export function BacklinksPanel({ backlinks }: { backlinks: VaultNote[] }) {
  if (backlinks.length === 0) {
    return <EmptyState title="No linked references" detail="When another note links here, it will show up as a backlink." />;
  }

  return (
    <ul className="space-y-2">
      {backlinks.map((note) => (
        <li key={note.slug}>
          <Link
            className="block rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 transition hover:border-[var(--border-strong)]"
            href={`/notebook/${note.slug}`}
          >
            <div className="text-sm font-semibold text-[var(--text-primary)]">{note.title}</div>
            <div className="mt-0.5 text-xs text-[var(--text-muted)]">{note.folder}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import type { VaultNote } from "@/domain";

function statusTone(status: VaultNote["status"]): "green" | "amber" | "gray" {
  if (status === "Published") return "green";
  if (status === "Needs review") return "amber";
  return "gray";
}

export function NoteCard({ note }: { note: VaultNote }) {
  return (
    <Link
      className="block rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 transition hover:border-[var(--border-strong)]"
      href={`/vault/${note.slug}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{note.title}</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">{note.folder} · {note.updated}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusPill tone={statusTone(note.status)}>{note.status}</StatusPill>
          {note.author === "Mark" ? <StatusPill tone="blue">Mark</StatusPill> : null}
        </div>
      </div>
      {note.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {note.tags.map((tag) => (
            <span className="rounded-full border border-[var(--border-hairline)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

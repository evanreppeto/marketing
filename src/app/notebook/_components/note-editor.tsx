import { buttonClasses } from "@/app/_components/page-header";
import { saveNoteAction } from "../actions";
import { vaultCollections } from "../_data/notebook";
import type { VaultNote } from "@/domain";

const STATUSES = ["Draft", "Needs review", "Published"] as const;
const FIELD = "w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const LABEL = "text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]";

export function NoteEditor({ note }: { note?: VaultNote }) {
  return (
    <form action={saveNoteAction} className="space-y-4">
      {note ? <input name="slug" type="hidden" value={note.slug} /> : null}

      <div>
        <label className={LABEL} htmlFor="title">Title</label>
        <input className={`${FIELD} mt-1`} defaultValue={note?.title ?? ""} id="title" name="title" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="folder">Collection</label>
          <select className={`${FIELD} mt-1`} defaultValue={note?.folder ?? vaultCollections[0].folder} id="folder" name="folder">
            {vaultCollections.map((c) => (
              <option key={c.folder} value={c.folder}>{c.folder}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="status">Status</label>
          <select className={`${FIELD} mt-1`} defaultValue={note?.status ?? "Draft"} id="status" name="status">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="author">Author</label>
          <input className={`${FIELD} mt-1`} defaultValue={note?.author ?? "Operator"} id="author" name="author" />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="tags">Tags (comma separated)</label>
        <input className={`${FIELD} mt-1`} defaultValue={note?.tags.join(", ") ?? ""} id="tags" name="tags" placeholder="partner, urgent" />
      </div>

      <div>
        <label className={LABEL} htmlFor="body">Markdown</label>
        <textarea className={`${FIELD} mt-1 min-h-[320px] font-mono`} defaultValue={note?.body ?? ""} id="body" name="body" />
        <p className="mt-1 text-xs text-[var(--text-muted)]">Use Obsidian-style <code>[[wiki-links]]</code> to link notes, CRM records, or personas.</p>
      </div>

      <div className="flex justify-end">
        <button className={buttonClasses({ variant: "primary" })} type="submit">{note ? "Save changes" : "Create note"}</button>
      </div>
    </form>
  );
}

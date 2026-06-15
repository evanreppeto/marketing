import { ActorBadge } from "./timeline";
import { EmptyState, Panel, StatusPill, buttonClasses } from "../../../_components/page-header";
import { addNoteAction, pinNoteAction } from "../../interactions-actions";
import { type NoteEntry } from "@/lib/interactions/read-model";
import { type CrmEntityType } from "@/domain";

const inputClass =
  "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]";

export function NotesPanel({
  entityType,
  entityId,
  notes,
  agentName = "Agent",
}: {
  entityType: CrmEntityType;
  entityId: string;
  notes: NoteEntry[];
  agentName?: string;
}) {
  return (
    <Panel className="module-rise">
      <div className="signal-eyebrow">Notes</div>
      <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">Notes</h2>

      <form action={addNoteAction} className="mt-4 space-y-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <textarea
          name="body"
          required
          rows={3}
          placeholder={`Add context for the team and ${agentName}...`}
          className={inputClass}
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
            <input type="checkbox" name="isInternal" /> Internal only
          </label>
          <button type="submit" className={buttonClasses({ variant: "primary", size: "sm" })}>
            Add note
          </button>
        </div>
      </form>

      <div className="mt-5 space-y-3">
        {notes.length === 0 ? (
          <EmptyState title="No notes yet" detail="Write the first note above." />
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <ActorBadge kind={note.actorKind} label={note.actorLabel} />
                {note.isPinned ? <StatusPill tone="amber">Pinned</StatusPill> : null}
                {note.isInternal ? <StatusPill tone="gray">Internal</StatusPill> : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{note.body}</p>
              <form action={pinNoteAction} className="mt-2">
                <input type="hidden" name="noteId" value={note.id} />
                <input type="hidden" name="entityType" value={entityType} />
                <input type="hidden" name="entityId" value={entityId} />
                <input type="hidden" name="isPinned" value={note.isPinned ? "false" : "true"} />
                <button type="submit" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                  {note.isPinned ? "Unpin" : "Pin"}
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

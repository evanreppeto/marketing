import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "../../_components/app-shell";
import { ActionFeedback, buttonClasses, EmptyState, OperatorBar, PageHeader, Panel, StatusPill } from "../../_components/page-header";
import { BacklinksPanel } from "../_components/backlinks-panel";
import { NoteBody } from "../_components/note-body";
import { NoteGraph } from "../_components/note-graph";
import { archiveNoteAction, publishNoteAction } from "../actions";
import { buildLinkContext } from "../_data/notebook";
import { getVaultNote, getVaultNotes } from "@/lib/vault/read-model";
import { computeBacklinks, extractLinks, type GraphEdge, type GraphNode } from "@/domain";

type NotePageProps = {
  params: Promise<{ noteSlug: string }>;
  searchParams?: Promise<{ action?: string | string[] }>;
};

const actionMessages: Record<string, string> = {
  saved: "Note saved.",
  published: "Note published.",
};

export default async function NotePage({ params, searchParams }: NotePageProps) {
  const { noteSlug } = await params;
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);

  const note = await getVaultNote(noteSlug);
  if (!note) notFound();

  const { notes } = await getVaultNotes();
  const ctx = buildLinkContext(notes);
  const outgoing = extractLinks(note.body, ctx);
  const backlinks = computeBacklinks(notes, note.slug);
  const needsReview = note.author === "Mark" && note.status === "Needs review";

  const nodes: GraphNode[] = [
    { id: note.slug, label: note.title, kind: "note" },
    ...outgoing.map((l) => ({ id: l.target, label: l.label, kind: l.kind })),
  ];
  const edges: GraphEdge[] = outgoing.map((l) => ({ from: note.slug, to: l.target }));

  const grouped = {
    note: outgoing.filter((l) => l.kind === "note"),
    record: outgoing.filter((l) => l.kind === "record"),
    persona: outgoing.filter((l) => l.kind === "persona"),
    unresolved: outgoing.filter((l) => l.kind === "unresolved"),
  };

  return (
    <AppShell active="/vault">
      <PageHeader
        eyebrow={note.folder}
        title={note.title}
        description={`${note.author === "Mark" ? "Drafted by Mark" : `By ${note.author}`} · Updated ${note.updated}`}
        aside={
          <div className="flex flex-col items-end gap-1.5">
            <StatusPill tone={note.status === "Published" ? "green" : note.status === "Needs review" ? "amber" : "gray"}>{note.status}</StatusPill>
            {note.author === "Mark" ? <StatusPill tone="blue">Mark</StatusPill> : null}
          </div>
        }
      />

      <div className="mb-4">
        <Link className="text-sm font-semibold text-[var(--accent)]" href="/vault">← All notes</Link>
      </div>

      {needsReview ? (
        <div className="mb-4 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Mark drafted this note. </span>
          It needs human review before it publishes.{" "}
          <Link className="font-semibold underline underline-offset-2" href={`/approvals?item=${note.slug}`}>Open review</Link>.
        </div>
      ) : null}

      <OperatorBar
        task="Work this note"
        detail="Edit the note, publish it, or archive it. Changes persist to Supabase."
        status="Editable"
        primary={
          note.status !== "Published" ? (
            <form action={publishNoteAction}>
              <input name="slug" type="hidden" value={note.slug} />
              <button className={buttonClasses({ variant: "primary" })} type="submit">Publish</button>
            </form>
          ) : (
            <Link className={buttonClasses({ variant: "primary" })} href={`/vault/${note.slug}/edit`}>Edit</Link>
          )
        }
        secondary={
          <>
            {note.status !== "Published" ? (
              <Link className={buttonClasses({ variant: "ghost" })} href={`/vault/${note.slug}/edit`}>Edit</Link>
            ) : null}
            <form action={archiveNoteAction}>
              <input name="slug" type="hidden" value={note.slug} />
              <button className={buttonClasses({ variant: "ghost" })} type="submit">Archive</button>
            </form>
          </>
        }
      />
      <ActionFeedback action={action} messages={actionMessages} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <NoteBody body={note.body} ctx={ctx} />
        </Panel>

        <div className="space-y-4">
          <Panel>
            <div className="signal-eyebrow">Linked references</div>
            <div className="mt-3">
              <BacklinksPanel backlinks={backlinks} />
            </div>
          </Panel>

          <Panel>
            <div className="signal-eyebrow">Links in this note</div>
            <div className="mt-3 space-y-3 text-sm">
              {(["record", "persona", "note", "unresolved"] as const).map((kind) =>
                grouped[kind].length > 0 ? (
                  <div key={kind}>
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{kindLabel(kind)}</div>
                    <ul className="mt-1.5 space-y-1">
                      {grouped[kind].map((link, i) => (
                        <li key={`${link.target}-${i}`}>
                          {link.kind === "unresolved" ? (
                            <span className="text-[var(--text-muted)]" title="Not imported yet">{link.label}</span>
                          ) : (
                            <Link className="font-semibold text-[var(--accent)] hover:underline" href={link.href}>{link.label}</Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
              {outgoing.length === 0 ? <EmptyState title="No outgoing links" detail="This note does not link to anything yet." /> : null}
            </div>
          </Panel>

          <Panel>
            <div className="signal-eyebrow">Local graph</div>
            <div className="mt-3">
              <NoteGraph edges={edges} focusId={note.slug} height={260} nodes={nodes} width={320} />
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function kindLabel(kind: "note" | "record" | "persona" | "unresolved") {
  if (kind === "record") return "CRM records";
  if (kind === "persona") return "Personas";
  if (kind === "note") return "Notes";
  return "Unresolved";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

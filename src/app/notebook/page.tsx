import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { ActionFeedback, buttonClasses, OperatorBar, PageHeader, Panel, StatusPill } from "../_components/page-header";
import { NoteCard } from "./_components/note-card";
import { NoteGraph } from "./_components/note-graph";
import { buildLinkContext, vaultCollections } from "./_data/notebook";
import { getVaultNotes } from "@/lib/vault/read-model";
import { extractLinks, type GraphEdge, type GraphNode } from "@/domain";

type VaultHomeProps = {
  searchParams?: Promise<{ action?: string | string[] }>;
};

const actionMessages: Record<string, string> = {
  sync: "Preview: Mark would read the markdown files from your Obsidian vault and queue each as a Needs-review note. No files were read.",
  "not-configured": "Saving needs Supabase env vars. Set them and apply the vault_notes migration to edit notes.",
  saved: "Note saved.",
  published: "Note published.",
  archived: "Note archived.",
  invalid: "That note was missing a title or collection.",
};

export default async function VaultHome({ searchParams }: VaultHomeProps) {
  await connection();
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);

  const model = await getVaultNotes();
  const notes = model.notes;
  const ctx = buildLinkContext(notes);

  const allLinks = notes.flatMap((note) => extractLinks(note.body, ctx));
  const resolved = allLinks.filter((l) => l.kind !== "unresolved").length;
  const unresolved = allLinks.length - resolved;
  const markDrafts = notes.filter((n) => n.author === "Mark" && n.status === "Needs review").length;

  const slugs = new Set(notes.map((n) => n.slug));
  const graphNodes: GraphNode[] = notes.map((n) => ({ id: n.slug, label: n.title, kind: "note" }));
  const graphEdges: GraphEdge[] = notes.flatMap((note) =>
    extractLinks(note.body, ctx)
      .filter((l) => l.kind === "note" && slugs.has(l.target))
      .map((l) => ({ from: note.slug, to: l.target })),
  );

  const stats = [
    { label: "Notes", value: String(notes.length) },
    { label: "Collections", value: String(vaultCollections.length) },
    { label: "Links resolved", value: String(resolved) },
    { label: "Unresolved", value: String(unresolved) },
    { label: "Mark drafts", value: String(markDrafts) },
  ];

  return (
    <AppShell active="/notebook">
      <PageHeader
        eyebrow="Vault"
        title="The shared brain for Mark and the team"
        description="Linked notes, playbooks, and partner intel. Wiki-links connect notes to live CRM records and personas. Mark drafts land in review before they publish."
        aside={<StatusPill tone={model.status === "live" ? "green" : "amber"}>{model.status === "live" ? "Live" : "Read-only"}</StatusPill>}
      />

      {model.status !== "live" ? (
        <div className="mb-4 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">{model.status === "fallback" ? "Read-only: " : "Vault error: "}</span>
          {model.message}
        </div>
      ) : null}

      <OperatorBar
        task="Keep the vault in sync"
        detail="Create a note now, or import from your Obsidian vault. New note and edits persist to Supabase; Sync vault is still a preview."
        status={model.status === "live" ? "Live" : "Read-only"}
        primary={<Link className={buttonClasses({ variant: "primary" })} href="/notebook/new">New note</Link>}
        secondary={<Link className={buttonClasses({ variant: "ghost" })} href="?action=sync">Sync vault</Link>}
      />
      <ActionFeedback action={action} messages={actionMessages} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3" key={stat.label}>
            <div className="text-xs text-[var(--text-muted)]">{stat.label}</div>
            <div className="mt-1 font-display text-3xl font-black tabular-nums tracking-[-0.04em]">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {vaultCollections
            .filter((collection) => notes.some((n) => n.folder === collection.folder))
            .map((collection) => (
              <Panel key={collection.folder}>
                <div className="signal-eyebrow">{collection.folder}</div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{collection.description}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {notes.filter((n) => n.folder === collection.folder).map((note) => (
                    <NoteCard key={note.slug} note={note} />
                  ))}
                </div>
              </Panel>
            ))}
        </div>

        <Panel>
          <div className="signal-eyebrow">Graph</div>
          <p className="mt-1 mb-3 text-sm text-[var(--text-secondary)]">How the notes connect.</p>
          <NoteGraph edges={graphEdges} focusId={notes[0]?.slug ?? ""} nodes={graphNodes} />
        </Panel>
      </div>
    </AppShell>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

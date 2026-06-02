import { notFound } from "next/navigation";

import { AppShell } from "../../../_components/app-shell";
import { PageHeader, Panel } from "../../../_components/page-header";
import { NoteEditor } from "../../_components/note-editor";
import { getVaultNote } from "@/lib/vault/read-model";

type EditPageProps = { params: Promise<{ noteSlug: string }> };

export default async function EditNotePage({ params }: EditPageProps) {
  const { noteSlug } = await params;
  const note = await getVaultNote(noteSlug);
  if (!note) notFound();

  return (
    <AppShell active="/notebook">
      <PageHeader eyebrow={note.folder} title={`Edit: ${note.title}`} description="Update the note and save. Changes persist to Supabase." />
      <Panel>
        <NoteEditor note={note} />
      </Panel>
    </AppShell>
  );
}

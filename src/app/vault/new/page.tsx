import { connection } from "next/server";

import { AppShell } from "../../_components/app-shell";
import { PageHeader, Panel } from "../../_components/page-header";
import { NoteEditor } from "../_components/note-editor";

export default async function NewNotePage() {
  await connection();
  return (
    <AppShell active="/vault">
      <PageHeader eyebrow="Vault" title="New note" description="Create a note. Use [[wiki-links]] to connect it to other notes, CRM records, and personas." />
      <Panel>
        <NoteEditor />
      </Panel>
    </AppShell>
  );
}

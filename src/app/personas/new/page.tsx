import { PageHeader } from "@/app/_components/page-header";
import { WorkspacePanel } from "@/app/_components/workspace";

import { NewPersonaForm } from "./_components/new-persona-form";

export default function NewPersonaPage() {
  return (
    <>
      <PageHeader
        backHref="/personas"
        backLabel="All personas"
        title="New persona"
        description="Define a new audience — who they are, where they sit in the lifecycle, and how to reach them."
      />
      <div className="max-w-3xl">
        <WorkspacePanel title="Persona details">
          <div className="px-5 py-5">
            <NewPersonaForm />
          </div>
        </WorkspacePanel>
      </div>
    </>
  );
}

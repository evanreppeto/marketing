"use client";

import { useActionState } from "react";

import { Button } from "../_components/page-header";
import { setActiveWorkspaceAction } from "./workspace-actions";

/** "Switch" button for an inactive workspace card. */
export function WorkspaceSwitcher({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState(setActiveWorkspaceAction, null);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input name="workspaceId" type="hidden" value={workspaceId} />
      <Button disabled={pending} size="sm" type="submit" variant="ghost">
        {pending ? "Switching…" : "Switch"}
      </Button>
      {state && !state.ok ? <span className="text-[11px] font-semibold text-[var(--priority-text)]">{state.message}</span> : null}
    </form>
  );
}

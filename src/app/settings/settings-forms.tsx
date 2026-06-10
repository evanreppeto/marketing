"use client";

import { useActionState } from "react";

import { Button } from "../_components/page-header";
import { saveGeneralSettingsAction, setMarkWebhookEnabledAction, type SettingsActionState } from "./app-settings-actions";

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

function Feedback({ state }: { state: SettingsActionState }) {
  if (!state) return null;
  return (
    <span className={`text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>
      {state.message}
    </span>
  );
}

export function GeneralSettingsForm({
  initialWorkspaceName,
  initialSupportEmail,
}: {
  initialWorkspaceName: string;
  initialSupportEmail: string;
}) {
  const [state, action, pending] = useActionState(saveGeneralSettingsAction, null);

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Workspace name</span>
        <input className={inputClass} defaultValue={initialWorkspaceName} name="workspaceName" />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Support email</span>
        <input
          className={inputClass}
          defaultValue={initialSupportEmail}
          name="supportEmail"
          placeholder="support@bigshouldersrestoration.com"
          type="email"
        />
        <span className="text-xs text-[var(--text-muted)]">Shown as a Contact support link in the console. Leave blank to hide it.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} size="sm" type="submit" variant="primary">
          Save changes
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function WebhookToggle({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(setMarkWebhookEnabledAction, null);

  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex items-center gap-3">
        <input name="enabled" type="hidden" value={enabled ? "false" : "true"} />
        <Button disabled={pending} size="sm" type="submit" variant={enabled ? "ghost" : "primary"}>
          {enabled ? "Pause webhook" : "Enable webhook"}
        </Button>
      </form>
      <Feedback state={state} />
    </div>
  );
}

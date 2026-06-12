"use client";

import { useActionState } from "react";

import { Button } from "../_components/page-header";
import {
  saveAppearanceSettingsAction,
  saveGeneralSettingsAction,
  saveMarkDefaultsAction,
  type SettingsActionState,
} from "./app-settings-actions";

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

const radioCardClass =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-secondary)] transition has-[:checked]:border-[var(--accent-border-strong)] has-[:checked]:bg-[var(--accent-soft)] has-[:checked]:text-[var(--text-primary)]";

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

export function MarkDefaultsForm({
  initialMode,
  initialRoute,
}: {
  initialMode: "ask" | "act" | "draft";
  initialRoute: "fast" | "standard";
}) {
  const [state, action, pending] = useActionState(saveMarkDefaultsAction, null);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Default Mark stance</span>
          <select className={inputClass} defaultValue={initialMode} name="markDefaultMode">
            <option value="ask">Ask - answer only</option>
            <option value="act">Act - work inside the app</option>
            <option value="draft">Draft - bias toward campaign assets</option>
          </select>
          <span className="text-xs text-[var(--text-muted)]">
            Applied to new Mark messages unless a slash command supplies a stronger instruction.
          </span>
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Default model route</span>
          <select className={inputClass} defaultValue={initialRoute} name="markDefaultRoute">
            <option value="fast">Fast - routine chat and lookup</option>
            <option value="standard">Standard - deeper drafting/reasoning</option>
          </select>
          <span className="text-xs text-[var(--text-muted)]">
            Sent to the agent as metadata so Hermes can choose the right runner path.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} size="sm" type="submit" variant="primary">
          Save Mark defaults
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function AppearanceSettingsForm({
  initialAccent,
  initialDensity,
  initialMotion,
}: {
  initialAccent: "gold" | "blue" | "red" | "steel" | "emerald";
  initialDensity: "comfortable" | "compact";
  initialMotion: "standard" | "reduced";
}) {
  const [state, action, pending] = useActionState(saveAppearanceSettingsAction, null);

  return (
    <form action={action} className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-[var(--text-primary)]">Accent color</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["gold", "Signal Gold", "#c8a24a"],
            ["blue", "Signal Blue", "#5bb7e8"],
            ["red", "Restoration Red", "#d98080"],
            ["steel", "Steel", "#aeb5c2"],
            ["emerald", "Emerald", "#7fb89a"],
          ].map(([value, label, color]) => (
            <label className={radioCardClass} key={value}>
              <input className="sr-only" defaultChecked={initialAccent === value} name="appearanceAccent" type="radio" value={value} />
              <span className="h-5 w-5 rounded-full border border-[var(--border-strong)]" style={{ backgroundColor: color }} />
              <span className="font-semibold">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-[var(--text-primary)]">Interface density</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={radioCardClass}>
            <input className="sr-only" defaultChecked={initialDensity === "comfortable"} name="appearanceDensity" type="radio" value="comfortable" />
            <span className="font-semibold">Comfortable</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">More breathing room</span>
          </label>
          <label className={radioCardClass}>
            <input className="sr-only" defaultChecked={initialDensity === "compact"} name="appearanceDensity" type="radio" value="compact" />
            <span className="font-semibold">Compact</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">Fits more on screen</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-[var(--text-primary)]">Motion</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={radioCardClass}>
            <input className="sr-only" defaultChecked={initialMotion === "standard"} name="appearanceMotion" type="radio" value="standard" />
            <span className="font-semibold">Standard</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">Normal transitions</span>
          </label>
          <label className={radioCardClass}>
            <input className="sr-only" defaultChecked={initialMotion === "reduced"} name="appearanceMotion" type="radio" value="reduced" />
            <span className="font-semibold">Reduced</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">Minimal animation</span>
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} size="sm" type="submit" variant="primary">
          Save appearance
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

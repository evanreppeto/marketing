"use client";

import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";
import { flushSync } from "react-dom";

import { cx } from "../_components/theme";
import { type SettingsActionState } from "./app-settings-actions";

/**
 * Apply a state update and submit the closest form. `flushSync` forces React to
 * commit the new value to the hidden input *before* `requestSubmit` serializes
 * the form — otherwise the previous value would be saved.
 */
function commitAndSubmit(el: HTMLElement, update: () => void) {
  flushSync(update);
  el.closest("form")?.requestSubmit();
}

/**
 * One Apple-style settings row: a title (+ optional description) on the left,
 * a single control on the right. Lives inside a `divide-y` list so rows read as
 * a clean, scannable stack. Wraps the control under the label on narrow screens.
 */
export function Row({
  title,
  description,
  control,
}: {
  title: string;
  description?: ReactNode;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
      <div className="min-w-[180px] flex-1">
        <div className="text-sm font-semibold text-[var(--text-primary)]">{title}</div>
        {description ? <div className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">{description}</div> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/**
 * A real on/off switch. Submits `onValue`/`offValue` under `name` and saves the
 * parent form instantly on flip. `onValue`/`offValue` default to a plain boolean
 * but can map to enum strings (e.g. "compact"/"comfortable").
 */
export function Toggle({
  name,
  defaultOn,
  onValue = "true",
  offValue = "false",
  label,
}: {
  name: string;
  defaultOn: boolean;
  onValue?: string;
  offValue?: string;
  label: string;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <span className="inline-flex items-center">
      <input name={name} type="hidden" value={on ? onValue : offValue} />
      <button
        aria-checked={on}
        aria-label={label}
        className={cx(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
          on ? "border-[var(--accent-border-strong)] bg-[var(--accent)]" : "border-[var(--border-hairline)] bg-[var(--surface-inset)]",
        )}
        onClick={(event) => commitAndSubmit(event.currentTarget, () => setOn((value) => !value))}
        role="switch"
        type="button"
      >
        <span
          className={cx(
            "inline-block h-5 w-5 rounded-full bg-[var(--text-primary)] shadow-sm transition-transform",
            on ? "translate-x-[1.375rem]" : "translate-x-0.5",
          )}
        />
      </button>
    </span>
  );
}

/** Connected pill group for 2–3 short choices. Saves instantly on select. */
export function Segmented({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-0.5" role="radiogroup">
      <input name={name} type="hidden" value={value} />
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            aria-checked={active}
            className={cx(
              "min-h-8 rounded-md px-3 text-xs font-semibold transition",
              active
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
            key={option.value}
            onClick={(event) => commitAndSubmit(event.currentTarget, () => setValue(option.value))}
            role="radio"
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Color swatch picker (accent). Saves instantly on select. */
export function Swatches({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue: string;
  options: { value: string; label: string; color: string }[];
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="inline-flex items-center gap-2.5">
      <input name={name} type="hidden" value={value} />
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            aria-label={option.label}
            aria-pressed={active}
            className={cx(
              "h-7 w-7 rounded-full border-2 transition",
              active ? "border-[var(--text-primary)]" : "border-transparent hover:border-[var(--border-strong)]",
            )}
            key={option.value}
            onClick={(event) => commitAndSubmit(event.currentTarget, () => setValue(option.value))}
            style={{ backgroundColor: option.color }}
            title={option.label}
            type="button"
          />
        );
      })}
    </div>
  );
}

/** A select that saves the parent form instantly on change. */
export function InstantSelect({
  name,
  defaultValue,
  children,
  className = "",
}: {
  name: string;
  defaultValue: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      className={cx(
        "min-h-9 min-w-[200px] rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]",
        className,
      )}
      defaultValue={defaultValue}
      name={name}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {children}
    </select>
  );
}

/** Quiet, persistent save indicator at the foot of an instant-save panel. */
export function SaveHint({ state, pending }: { state: SettingsActionState; pending: boolean }) {
  if (pending) {
    return <div className="px-5 py-3 text-xs font-semibold text-[var(--text-muted)]">Saving…</div>;
  }
  if (state?.ok) {
    return (
      <div className="flex items-center gap-1.5 px-5 py-3 text-xs font-semibold text-[var(--text-muted)]">
        <Check className="h-3.5 w-3.5 text-[var(--ok-text)]" />
        Saved
      </div>
    );
  }
  if (state && !state.ok) {
    return <div className="px-5 py-3 text-xs font-semibold text-[var(--priority-text)]">{state.message}</div>;
  }
  return <div className="px-5 py-3 text-xs text-[var(--text-muted)]">Changes save automatically.</div>;
}

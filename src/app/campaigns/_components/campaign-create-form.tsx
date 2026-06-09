"use client";

import { useActionState } from "react";

import { OFFICIAL_PERSONA_MAPPINGS, RESTORATION_FOCUS_VALUES } from "@/domain";

import { createCampaignAction, type CreateCampaignActionState } from "../actions";
import { Button } from "../../_components/page-header";
import { cx, theme } from "../../_components/theme";

function titleize(value: string) {
  return value.replace(/^persona_/, "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

export function CampaignCreateForm() {
  const [state, formAction, pending] = useActionState<CreateCampaignActionState, FormData>(createCampaignAction, null);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <Field label="Title">
        <input name="name" required placeholder="Spring flood response push" className={cx(theme.control.input, "w-full")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who it's for (persona)">
          <select name="persona" required defaultValue="" className={cx(theme.control.input, "w-full")}>
            <option value="" disabled>Select a persona…</option>
            {OFFICIAL_PERSONA_MAPPINGS.map((p) => (
              <option key={p} value={p}>{titleize(p)}</option>
            ))}
          </select>
        </Field>
        <Field label="Restoration focus">
          <select name="restorationFocus" required defaultValue="" className={cx(theme.control.input, "w-full")}>
            <option value="" disabled>Select a focus…</option>
            {RESTORATION_FOCUS_VALUES.map((f) => (
              <option key={f} value={f}>{titleize(f)}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Audience">
        <input name="audienceSummary" placeholder="North-side homeowners with recent storm exposure" className={cx(theme.control.input, "w-full")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Objective">
          <input name="objective" placeholder="Book emergency mitigation calls" className={cx(theme.control.input, "w-full")} />
        </Field>
        <Field label="Channel">
          <input name="channel" placeholder="social" className={cx(theme.control.input, "w-full")} />
        </Field>
      </div>
      <Field label="Offer">
        <input name="offerSummary" placeholder="Free 24-hour water-damage assessment" className={cx(theme.control.input, "w-full")} />
      </Field>

      <Field label="Photos">
        <input type="file" name="photos" accept="image/*" multiple className="text-sm text-[var(--text-secondary)]" />
      </Field>

      {state && !state.ok ? (
        <p className="text-sm text-[var(--priority-bright)]">{state.message}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create campaign"}</Button>
      </div>
    </form>
  );
}

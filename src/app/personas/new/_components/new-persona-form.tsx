"use client";

import Link from "next/link";
import { useActionState } from "react";

import { buttonClasses } from "@/app/_components/page-header";
import { createPersonaAction, type CreatePersonaState } from "../../actions";

const FIELD = "h-11 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const LABEL = "mb-1.5 block text-[10px] font-medium text-[var(--text-muted)]";

const SEGMENTS = [
  { value: "acquisition", label: "Acquisition" },
  { value: "engagement", label: "Engagement" },
  { value: "retention", label: "Retention" },
];
const STAGES = ["New", "Hot lead", "Active", "Champion", "At risk", "Dormant"];

export function NewPersonaForm() {
  const [state, action, pending] = useActionState<CreatePersonaState, FormData>(createPersonaAction, null);

  return (
    <form action={action} className="space-y-5">
      {state && !state.ok ? (
        <p className="rounded-lg border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--text-primary)]">{state.message}</p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>Persona name</span>
          <input className={FIELD} name="name" placeholder="e.g. New Prospect" required />
        </label>
        <label className="block">
          <span className={LABEL}>Lead score (0–100)</span>
          <input className={FIELD} name="score" type="number" min={0} max={100} defaultValue={50} />
        </label>
        <label className="block">
          <span className={LABEL}>Segment</span>
          <select className={FIELD} name="segment" defaultValue="acquisition">
            {SEGMENTS.map((segment) => (
              <option key={segment.value} value={segment.value}>{segment.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Lifecycle stage</span>
          <select className={FIELD} name="stage" defaultValue="New">
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={LABEL}>Message angle</span>
        <input className={FIELD} name="angle" placeholder="How to talk to this audience" />
      </label>

      <label className="block">
        <span className={LABEL}>Who they are</span>
        <input className={FIELD} name="audience" placeholder="A short description of this audience" />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>Recommended CTA</span>
          <input className={FIELD} name="cta" placeholder="e.g. Book a demo" />
        </label>
        <label className="block">
          <span className={LABEL}>Preferred channel</span>
          <input className={FIELD} name="channel" placeholder="e.g. Email & retargeting" />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[var(--border-hairline)] pt-5">
        <button type="submit" className={buttonClasses({ variant: "primary" })} disabled={pending}>
          {pending ? "Creating…" : "Create persona"}
        </button>
        <Link href="/personas" className={buttonClasses({ variant: "ghost" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { OFFICIAL_PERSONA_MAPPINGS, RESTORATION_FOCUS_VALUES } from "@/domain";

import { Button } from "../../_components/page-header";
import { cx, theme } from "../../_components/theme";
import { askMarkToBuildCampaignAction, createCampaignAction, type CreateCampaignActionState } from "../actions";

function titleize(value: string) {
  return value.replace(/^persona_/, "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-5 text-[var(--text-muted)]">{hint}</span> : null}
    </label>
  );
}

export function CampaignCreateForm({ assistantName, businessName }: { assistantName: string; businessName: string }) {
  const [state, formAction, pending] = useActionState<CreateCampaignActionState, FormData>(createCampaignAction, null);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-4">
          <span className="signal-eyebrow">Primary path</span>
          <h2 className="mt-1 text-xl font-bold text-[var(--text-primary)]">Manual setup</h2>
          <p className="mt-1 max-w-[64ch] text-sm leading-6 text-[var(--text-secondary)]">
            Use this when you know the goal, audience, offer, and where the campaign should go.
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4 p-4">
          <Field label="Campaign name">
            <input name="name" required placeholder="Spring flood response push" className={cx(theme.control.input, "w-full")} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who it is for">
              <select name="persona" required defaultValue="" className={cx(theme.control.input, "w-full")}>
                <option value="" disabled>Select an audience...</option>
                {OFFICIAL_PERSONA_MAPPINGS.map((p) => (
                  <option key={p} value={p}>
                    {titleize(p)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Service focus">
              <select name="restorationFocus" required defaultValue="" className={cx(theme.control.input, "w-full")}>
                <option value="" disabled>Select a focus...</option>
                {RESTORATION_FOCUS_VALUES.map((f) => (
                  <option key={f} value={f}>
                    {titleize(f)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Goal">
            <input name="objective" placeholder="Book emergency mitigation calls" className={cx(theme.control.input, "w-full")} />
          </Field>

          <Field label="Audience details" hint="Optional, but helpful. Example: North-side homeowners with recent storm exposure.">
            <input name="audienceSummary" placeholder="Who should this reach?" className={cx(theme.control.input, "w-full")} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Offer">
              <input name="offerSummary" placeholder="Free 24-hour water-damage assessment" className={cx(theme.control.input, "w-full")} />
            </Field>
            <Field label="Where it should go">
              <input name="channel" placeholder="Email, social, CRM, flyer..." className={cx(theme.control.input, "w-full")} />
            </Field>
          </div>

          <Field label="Photos or reference files" hint="Optional. Add anything your team should use as context.">
            <input type="file" name="photos" accept="image/*" multiple className="text-sm text-[var(--text-secondary)]" />
          </Field>

          {state && !state.ok ? <p className="text-sm text-[var(--priority-bright)]">{state.message}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create campaign"}
            </Button>
            <span className="text-xs leading-5 text-[var(--text-muted)]">You can review, edit, and send/export it from the campaign page.</span>
          </div>
        </form>
      </section>

      <aside className="space-y-3">
        <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
          <span className="signal-eyebrow">Optional helper</span>
          <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">Ask {assistantName} to draft it</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Use this if you know what {businessName} needs, but not exactly what campaign pieces to make.
          </p>

          <form action={askMarkToBuildCampaignAction} className="mt-3 space-y-3">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Tell {assistantName} what you want</span>
              <textarea
                name="prompt"
                required
                rows={5}
                placeholder={`Example: Help ${businessName} get more plumbing partner referrals. Suggest the campaign pieces and draft them for approval.`}
                className={cx(theme.control.input, "mt-2 w-full resize-y leading-6")}
              />
            </label>
            <Button type="submit" variant="ghost" size="sm">
              Ask {assistantName}
            </Button>
          </form>
        </section>

        <p className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-4 py-3 text-xs leading-5 text-[var(--text-muted)]">
          Nothing is sent, published, exported, or spent until your team approves it.
        </p>
      </aside>
    </div>
  );
}

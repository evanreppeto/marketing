"use client";

import { useActionState, useState } from "react";

import { OFFICIAL_PERSONA_MAPPINGS, RESTORATION_FOCUS_VALUES } from "@/domain";

import { Button } from "../../_components/page-header";
import { cx, theme } from "../../_components/theme";
import { askMarkToBuildCampaignAction, createCampaignAction, type CreateCampaignActionState } from "../actions";

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

const WORK_STARTERS = [
  {
    label: "I need more leads",
    prompt: "Find the best marketing move to bring in more qualified leads for our business. Recommend the audience, message, and channels.",
  },
  {
    label: "Reach partners",
    prompt: "Create partner outreach for local referral partners. Include the message, follow-up, and what should be approved before anything goes out.",
  },
  {
    label: "Promote a service",
    prompt: "Build marketing for one of our services. Decide whether this should be an email, social ad, flyer, landing page, CRM follow-up, or full campaign.",
  },
  {
    label: "Use these photos",
    prompt: "Turn the attached photos into useful marketing. Suggest the best audience, message, and pieces to create.",
  },
  {
    label: "Follow up with contacts",
    prompt: "Create a simple CRM follow-up plan for contacts who should hear from us. Include the message and what needs approval.",
  },
  {
    label: "Not sure",
    prompt: "I am not sure what marketing we need. Ask smart questions if needed, then recommend the best work to create first.",
  },
];

export function CampaignCreateForm({ assistantName, businessName }: { assistantName: string; businessName: string }) {
  const [state, formAction, pending] = useActionState<CreateCampaignActionState, FormData>(createCampaignAction, null);
  const [prompt, setPrompt] = useState("");

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <span className="signal-eyebrow">Fastest start</span>
            <h2 className="mt-1 text-xl font-bold text-[var(--text-primary)]">Tell {assistantName} what you want to accomplish</h2>
            <p className="mt-2 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">
              You do not need to know whether this should be a campaign, email, ad, flyer, lead list, or CRM follow-up.
              Describe the goal for {businessName}, and {assistantName} can turn it into work you review before anything goes out.
            </p>

            <form action={askMarkToBuildCampaignAction} className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">What should be made?</span>
                <textarea
                  name="prompt"
                  required
                  rows={7}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={`Example: Help ${businessName} get more plumbing partner referrals. Make whatever pieces are useful, and send them here for approval.`}
                  className={cx(theme.control.input, "mt-2 w-full resize-y leading-6")}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit">Ask {assistantName} to start</Button>
                <span className="text-xs leading-5 text-[var(--text-muted)]">
                  {assistantName} drafts. You approve before anything is sent, published, exported, or spent.
                </span>
              </div>
            </form>
          </div>

          <aside className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">What happens next</h3>
            <ol className="mt-3 space-y-2 text-sm">
              <Step number="1" title={`${assistantName} makes a plan`} detail="The work can become one piece or a full campaign." />
              <Step number="2" title="It appears in Campaigns" detail="Everything is collected where your team can review it." />
              <Step number="3" title="You approve it" detail="Nothing goes out until a person says yes." />
              <Step number="4" title="Send, export, or track" detail="Use the right channel when the work is ready." />
            </ol>
          </aside>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="signal-eyebrow">Starting points</span>
            <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">Pick one if you are not sure what to write</h2>
          </div>
          <p className="max-w-[48ch] text-sm leading-5 text-[var(--text-secondary)]">
            These are broad on purpose. {assistantName} can decide what kind of marketing work fits.
          </p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {WORK_STARTERS.map((starter) => (
            <button
              key={starter.label}
              type="button"
              onClick={() => setPrompt(starter.prompt)}
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-3 text-left transition hover:border-[var(--accent-border-strong)] hover:bg-[var(--accent-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              <span className="block text-sm font-bold text-[var(--text-primary)]">{starter.label}</span>
              <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[var(--text-secondary)]">{starter.prompt}</span>
            </button>
          ))}
        </div>
      </section>

      <details className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
          <div>
            <span className="signal-eyebrow">Manual setup</span>
            <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">Create a campaign yourself</h2>
            <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">Use this when you already know the audience, offer, channel, and photos.</p>
          </div>
          <span className="font-mono text-xs font-bold text-[var(--text-muted)]">Open</span>
        </summary>

        <form action={formAction} className="flex max-w-2xl flex-col gap-4 border-t border-[var(--border-hairline)] p-4">
          <Field label="Title">
            <input name="name" required placeholder="Spring flood response push" className={cx(theme.control.input, "w-full")} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who it's for (persona)">
              <select name="persona" required defaultValue="" className={cx(theme.control.input, "w-full")}>
                <option value="" disabled>Select a persona...</option>
                {OFFICIAL_PERSONA_MAPPINGS.map((p) => (
                  <option key={p} value={p}>{titleize(p)}</option>
                ))}
              </select>
            </Field>
            <Field label="Restoration focus">
              <select name="restorationFocus" required defaultValue="" className={cx(theme.control.input, "w-full")}>
                <option value="" disabled>Select a focus...</option>
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

          {state && !state.ok ? <p className="text-sm text-[var(--priority-bright)]">{state.message}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create campaign"}</Button>
          </div>
        </form>
      </details>
    </div>
  );
}

function Step({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <li className="flex gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-2.5 py-2">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] font-mono text-xs font-bold text-[var(--accent)]">
        {number}
      </span>
      <span>
        <strong className="block text-[var(--text-primary)]">{title}</strong>
        <span className="text-xs leading-5 text-[var(--text-secondary)]">{detail}</span>
      </span>
    </li>
  );
}

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { buttonClasses, Panel, StatusPill } from "./page-header";
import { theme } from "./theme";
import type { ActivationChecklist as ActivationChecklistData, ActivationStepKey } from "@/domain";
import { dismissActivationAction } from "@/app/start/actions";

const STEP_COPY: Record<
  ActivationStepKey,
  { title: string; detail: string; hrefTodo: string; hrefDone: string; ctaTodo: string }
> = {
  brand: {
    title: "Teach Arc your brand",
    detail: "Give Arc your website so it can learn your business, voice, and logo.",
    hrefTodo: "/start",
    hrefDone: "/settings?section=brand-kit",
    ctaTodo: "Start",
  },
  media: {
    title: "Add your real media",
    detail: "Upload authentic photos and assets Arc can package into campaigns.",
    hrefTodo: "/library",
    hrefDone: "/library",
    ctaTodo: "Add media",
  },
  campaign: {
    title: "Draft your first campaign",
    detail: "Ask Arc to prepare an approval-ready campaign packet.",
    hrefTodo: "/campaigns",
    hrefDone: "/campaigns",
    ctaTodo: "Open campaigns",
  },
  team: {
    title: "Invite your team",
    detail: "Bring teammates in to review and approve Arc's work.",
    hrefTodo: "/settings?section=team",
    hrefDone: "/settings?section=team",
    ctaTodo: "Invite",
  },
};

export function ActivationChecklist({
  checklist,
  orgName,
}: {
  checklist: ActivationChecklistData;
  orgName: string;
}) {
  if (!checklist.showChecklist) return null;

  const doneCount = checklist.steps.filter((step) => step.done).length;

  return (
    <Panel className="module-rise border-[var(--accent-border)] bg-[var(--accent-soft)] p-0" aria-labelledby="activation-title">
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className={theme.text.eyebrow}>Getting started</div>
          <h2 id="activation-title" className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
            Finish setting up {orgName}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            {doneCount} of {checklist.steps.length} done — a few quick steps so Arc can work for you.
          </p>
        </div>
        <form action={dismissActivationAction}>
          <button
            className="text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            type="submit"
          >
            Dismiss
          </button>
        </form>
      </div>

      <div className="divide-y divide-[var(--border-hairline)]">
        {checklist.steps.map((step) => {
          const copy = STEP_COPY[step.key];
          return (
            <Link
              key={step.key}
              href={step.done ? copy.hrefDone : copy.hrefTodo}
              className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-[var(--surface-soft)] sm:px-5"
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                  step.done
                    ? "border-[var(--ok-border-soft)] bg-[var(--ok-soft)] text-[var(--ok-text)]"
                    : "border-[var(--border-strong)] text-[var(--text-muted)]"
                }`}
              >
                {step.done ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[var(--text-primary)]">{copy.title}</div>
                <p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">{copy.detail}</p>
              </div>
              {step.done ? (
                <StatusPill tone="green">Done</StatusPill>
              ) : (
                <span className={buttonClasses({ variant: "ghost", size: "sm" })}>
                  {copy.ctaTodo}
                  <ArrowRight aria-hidden="true" className="ml-1 h-3.5 w-3.5" />
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

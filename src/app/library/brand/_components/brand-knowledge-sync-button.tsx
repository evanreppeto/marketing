"use client";

import { useActionState } from "react";
import { BrainCircuit, CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import { type BrandKnowledgeSyncActionState, syncBrandKnowledgeSourcesAction } from "@/app/library/brand/actions";

const initialState: BrandKnowledgeSyncActionState = null;

function resultTone(state: BrandKnowledgeSyncActionState) {
  if (!state) return "gray";
  return state.ok ? "green" : "red";
}

function fileLabel(count: number) {
  return `${count} new file${count === 1 ? "" : "s"}`;
}

export function BrandKnowledgeSyncButton({ readyToLearn }: { readyToLearn: number }) {
  const [state, action, pending] = useActionState(syncBrandKnowledgeSourcesAction, initialState);
  const label =
    readyToLearn > 0
      ? `Update brand from ${fileLabel(readyToLearn)}`
      : "Check brand files";

  return (
    <form action={action} className="grid gap-2">
      <button className={buttonClasses({ variant: "primary", size: "sm" })} disabled={pending} type="submit">
        {pending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <BrainCircuit aria-hidden className="h-4 w-4" />}
        {pending ? "Reading files..." : label}
      </button>
      {!state && readyToLearn > 0 ? (
        <p className="text-xs leading-5 text-[var(--text-muted)]">{fileLabel(readyToLearn)} ready for analysis.</p>
      ) : null}
      {state ? (
        <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={resultTone(state)}>{state.ok ? "Updated" : "Needs attention"}</StatusPill>
            <span className="text-sm font-bold text-[var(--text-primary)]">{state.message}</span>
          </div>
          <ul className="mt-2 grid gap-1.5">
            {state.items.map((item) => (
              <li className="flex gap-2 text-xs leading-5 text-[var(--text-secondary)]" key={item}>
                {state.ok ? (
                  <CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ok)]" />
                ) : (
                  <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--danger)]" />
                )}
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

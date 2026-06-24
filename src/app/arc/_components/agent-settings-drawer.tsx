"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { Button, buttonClasses } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import { saveAgentNameAction } from "@/app/settings/app-settings-actions";
import { getAgentConnectionInfoAction, type AgentConnectionInfo } from "../actions";
import { useDialogA11y } from "./use-dialog-a11y";

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

/**
 * In-context agent configuration, opened from the Arc header. Shows live
 * connection status, lets the operator rename the agent (persisted), and lists
 * the env credentials to set. Secrets are never entered or stored here.
 */
export function AgentSettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<AgentConnectionInfo | null>(null);
  const [state, action, pending] = useActionState(saveAgentNameAction, null);
  const panelRef = useDialogA11y<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    getAgentConnectionInfoAction()
      .then(setInfo)
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close agent settings" className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Agent settings"
        tabIndex={-1}
        className="relative h-full w-full max-w-[420px] overflow-y-auto border-l border-[var(--border-panel)] bg-[var(--surface-panel)] p-5 shadow-[var(--elev-panel)] outline-none"
      >
        <div className="-mx-5 -mt-5 mb-5 flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--surface-inset)]/40 px-5 py-3.5">
          <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Agent settings</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </div>

        <div className="mb-5 flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5">
          <span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full", info?.attached ? "bg-[var(--ok)]" : "bg-[var(--warn)]")} />
          <span className="text-sm text-[var(--text-secondary)]">
            {info
              ? info.attached
                ? `${info.name} is connected.`
                : "No agent attached — messages queue until one connects."
              : "Checking connection…"}
          </span>
        </div>

        {info ? (
          <form action={action} className="mb-6 grid gap-1.5">
            <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="agentName">
              Agent name
            </label>
            <input id="agentName" name="agentName" defaultValue={info.name} className={inputClass} />
            <span className="text-xs text-[var(--text-muted)]">How your agent is labeled across the app. Leave blank to use the deployment default.</span>
            <div className="mt-2 flex items-center gap-3">
              <Button disabled={pending} size="sm" type="submit" variant="primary">
                Save name
              </Button>
              {state ? (
                <span className={cx("text-xs font-semibold", state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]")}>
                  {state.message}
                </span>
              ) : null}
            </div>
          </form>
        ) : null}

        <h3 className="mb-2 text-[11px] font-medium text-[var(--text-muted)]">Connection</h3>
        <div className="divide-y divide-[var(--border-hairline)] rounded-lg border border-[var(--border-hairline)]">
          <ChecklistRow ok={Boolean(info?.runnerConfigured)} label="Runner endpoint" env="ARC_RUNNER_URL" hint="Where the app wakes your agent." />
          <ChecklistRow ok={Boolean(info?.tokenConfigured)} label="Agent API token" env="ARC_AGENT_API_TOKEN" hint="Bearer token your agent uses to reach the control-plane API." />
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Credentials are set via environment variables for security, not stored here.</p>

        <Link href="/settings" className={cx("mt-5 inline-flex", buttonClasses({ size: "sm", variant: "ghost" }))}>
          Open System status
        </Link>
      </div>
    </div>
  );
}

function ChecklistRow({ ok, label, env, hint }: { ok: boolean; label: string; env: string; hint: string }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5">
      <span aria-hidden className={cx("mt-0.5 shrink-0", ok ? "text-[var(--ok)]" : "text-[var(--text-muted)]")}>
        {ok ? (
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="10" r="7.5" />
            <path d="m6.8 10.2 2.2 2.3 4.2-4.8" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="10" r="7.5" strokeDasharray="2.5 2.5" />
          </svg>
        )}
      </span>
      <div className="min-w-0">
        <div className="text-sm text-[var(--text-primary)]">
          {label} <span className="font-mono text-[11px] text-[var(--text-muted)]">{env}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)]">{hint}</div>
      </div>
    </div>
  );
}

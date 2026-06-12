"use client";

import { useEffect, useState } from "react";

import { cx } from "@/app/_components/theme";
import { getMarkAgentStatusAction, type MarkAgentStatus } from "../actions";

/**
 * The production trust signal: is an agent attached to this workspace? Polls a
 * server action (which holds the runner config) every 30s. Green = attached;
 * amber = no agent, sends queue until one connects. The user never has to guess
 * whether their Hermes agent is wired up.
 */
export function MarkConnection() {
  const [status, setStatus] = useState<MarkAgentStatus | null>(null);

  useEffect(() => {
    let alive = true;
    function tick() {
      getMarkAgentStatusAction()
        .then((s) => {
          if (alive) setStatus(s);
        })
        .catch(() => {
          /* transient — keep the last known status */
        });
    }
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  if (!status) return null;
  const attached = status.attached;
  const lastSeen = status.lastSeenAt ? ` Last seen ${status.lastSeenAt}.` : "";

  return (
    <span
      title={
        attached
          ? `${status.name} is attached to this workspace.${lastSeen}`
          : "No agent attached — your messages queue and deliver when one connects."
      }
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)]"
    >
      <span
        aria-hidden
        className={cx(
          "h-1.5 w-1.5 rounded-full",
          attached ? "bg-[var(--ok)] shadow-[0_0_0_3px_var(--ok-soft)]" : "bg-[var(--warn)]",
        )}
      />
      {attached ? `${status.name} connected` : "Agent not attached"}
    </span>
  );
}

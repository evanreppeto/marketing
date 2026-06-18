"use client";

import { useEffect, useState } from "react";

import { cx } from "@/app/_components/theme";
import { getArcAgentStatusAction, type ArcAgentStatus } from "../actions";

/**
 * Production trust signal: is the Arc runner connected to this workspace? Polls
 * every 30s so the operator knows whether background work can move.
 */
export function ArcConnection() {
  const [status, setStatus] = useState<ArcAgentStatus | null>(null);

  useEffect(() => {
    let alive = true;
    function tick() {
      getArcAgentStatusAction()
        .then((s) => {
          if (alive) setStatus(s);
        })
        .catch(() => {
          /* transient: keep the last known status */
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
          : `Runner disconnected. Messages stay in the workspace until a runner connects.${lastSeen}`
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
      {attached ? `${status.name} connected` : "Runner disconnected"}
    </span>
  );
}

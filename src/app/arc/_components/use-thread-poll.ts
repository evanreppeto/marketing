"use client";

import { useEffect, useRef } from "react";

import type { ArcMessage } from "@/lib/arc-chat/persistence";

import { getThreadMessagesAction } from "../actions";

/** Cheap structural equality so an unchanged poll result doesn't trigger a
 *  re-render (and a forced auto-scroll) every tick. Compares status/body/media
 *  count and the live step list. */
export function sameMessages(a: ArcMessage[], b: ArcMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.status !== y.status ||
      x.body !== y.body ||
      x.media.length !== y.media.length ||
      x.actions.length !== y.actions.length ||
      x.steps.length !== y.steps.length ||
      x.steps.some((s, j) => s.status !== y.steps[j]?.status || s.label !== y.steps[j]?.label)
    ) {
      return false;
    }
  }
  return true;
}

/** Polls the active thread while a Arc reply is pending, updating `setMessages`
 *  only when something actually changed. ~10 min safety cap. */
export function useThreadPoll(
  activeId: string,
  messages: ArcMessage[],
  setMessages: (updater: (prev: ArcMessage[]) => ArcMessage[]) => void,
): void {
  const awaitingReply = messages.some((m) => m.role === "arc" && m.status === "pending");
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !awaitingReply) return;
    let cancelled = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    // Ramped cadence: check soon after the send, stay snappy for the first few
    // seconds (so Arc's reply starts streaming almost immediately), then back
    // off to a calm 2.5s so a long run doesn't hammer the server.
    function nextDelay(): number {
      if (polls <= 1) return 600;
      if (polls <= 6) return 1000;
      return 2500;
    }
    async function tick() {
      if (cancelled) return;
      if (polls++ > 240) return; // ~10 min safety cap so we never poll forever
      const fresh = await getThreadMessagesAction(activeIdRef.current);
      if (!cancelled && activeIdRef.current === activeId && fresh.length > 0) {
        setMessages((prev) => (sameMessages(prev, fresh) ? prev : fresh));
      }
      if (!cancelled) timer = setTimeout(tick, nextDelay());
    }
    timer = setTimeout(tick, nextDelay());
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeId, awaitingReply, setMessages]);
}

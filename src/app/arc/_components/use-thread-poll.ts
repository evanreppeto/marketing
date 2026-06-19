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
    // Consecutive polls where the server row didn't change. 0 == the reply is
    // actively producing new text right now (streaming).
    let idle = 0;
    let prevFresh: ArcMessage[] | null = null;
    let timer: ReturnType<typeof setTimeout>;
    // Activity-aware cadence: stay fast (~750ms) the whole time the reply is
    // actively streaming new text, so it reads as continuous typing rather than
    // arriving in 2.5s lumps. Only back off when the server goes quiet (tool
    // work / waiting), so an idle thread isn't polled hard. First check fires
    // soon after send.
    function nextDelay(): number {
      if (polls <= 1) return 600; // snappy first checks right after send
      if (idle === 0) return 750; // streaming — keep it smooth
      if (idle <= 4) return 1400; // just paused — stay responsive
      return 2500; // quiet — back off
    }
    async function tick() {
      if (cancelled) return;
      if (polls++ > 600) return; // safety cap so we never poll forever
      const fresh = await getThreadMessagesAction(activeIdRef.current);
      if (!cancelled && activeIdRef.current === activeId && fresh.length > 0) {
        setMessages((prev) => (sameMessages(prev, fresh) ? prev : fresh));
        // Compare consecutive fetches: still advancing => still streaming =>
        // keep polling fast; otherwise let the cadence ramp down.
        const advancing = prevFresh === null || !sameMessages(prevFresh, fresh);
        prevFresh = fresh;
        idle = advancing ? 0 : idle + 1;
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

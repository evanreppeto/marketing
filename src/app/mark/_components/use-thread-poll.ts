"use client";

import { useEffect, useRef } from "react";

import type { MarkMessage } from "@/lib/mark-chat/persistence";

import { getThreadMessagesAction } from "../actions";

/** Cheap structural equality so an unchanged poll result doesn't trigger a
 *  re-render (and a forced auto-scroll) every tick. Compares status/body/media
 *  count and the live step list. */
export function sameMessages(a: MarkMessage[], b: MarkMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.status !== y.status ||
      x.body !== y.body ||
      x.media.length !== y.media.length ||
      x.steps.length !== y.steps.length ||
      x.steps.some((s, j) => s.status !== y.steps[j]?.status || s.label !== y.steps[j]?.label)
    ) {
      return false;
    }
  }
  return true;
}

/** Polls the active thread while a Mark reply is pending, updating `setMessages`
 *  only when something actually changed. ~10 min safety cap. */
export function useThreadPoll(
  activeId: string,
  messages: MarkMessage[],
  setMessages: (updater: (prev: MarkMessage[]) => MarkMessage[]) => void,
): void {
  const awaitingReply = messages.some((m) => m.role === "mark" && m.status === "pending");
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !awaitingReply) return;
    let cancelled = false;
    let polls = 0;
    const timer = setInterval(async () => {
      if (polls++ > 240) {
        clearInterval(timer); // ~10 min safety cap so we never poll forever
        return;
      }
      const fresh = await getThreadMessagesAction(activeIdRef.current);
      if (cancelled || activeIdRef.current !== activeId || fresh.length === 0) return;
      setMessages((prev) => (sameMessages(prev, fresh) ? prev : fresh));
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeId, awaitingReply, setMessages]);
}

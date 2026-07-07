"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// A thin progress bar pinned to the very top edge of the viewport, giving a quiet
// cue that a slow page is loading — feedback without a content skeleton or flash.
//
// One global instance (mounted in the shell). It starts on a real internal-link
// click and ends when the pathname changes, so it spans the whole navigation
// including the destination's render. The 160ms "don't show yet" delay lives in
// CSS (see .navprogress in arc-app.css) so it runs on the compositor and can't be
// starved by a heavy render on the main thread — which is why fast pages show
// nothing while slow ones (e.g. Analytics) get the bar.
export function NavProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "run" | "end">("idle");
  const navigating = useRef(false);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start: a left-click on an internal link that will actually navigate.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      const href = a?.getAttribute("href");
      if (!a || !href || !href.startsWith("/") || a.target === "_blank") return;
      if (href.split(/[?#]/)[0] === pathname) return; // same page
      navigating.current = true;
      if (endTimer.current) clearTimeout(endTimer.current);
      if (failTimer.current) clearTimeout(failTimer.current);
      setPhase("run");
      // Safety net: if the route never actually changes (blocked nav), reset.
      failTimer.current = setTimeout(() => {
        navigating.current = false;
        setPhase("idle");
      }, 12000);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // End: the pathname changed, so the navigation committed.
  useEffect(() => {
    if (!navigating.current) return;
    navigating.current = false;
    if (failTimer.current) clearTimeout(failTimer.current);
    setPhase("end");
    endTimer.current = setTimeout(() => setPhase("idle"), 320);
    return () => {
      if (endTimer.current) clearTimeout(endTimer.current);
    };
  }, [pathname]);

  if (phase === "idle") return null;
  return <span className={`navprogress ${phase}`} aria-hidden="true" />;
}

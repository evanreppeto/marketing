"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Warms every top-level route (its JS bundle + data) in the background shortly
// after the app loads, so the FIRST click on each tab is already primed instead
// of a cold fetch.
//
// Why it's needed: these routes are dynamic, so Next does not prefetch them by
// default — each tab is slow the first time you open it and only fast on the
// revisit (once it's in the client cache). This walks the nav routes one at a
// time, staggered, so they warm without a thundering herd and without competing
// with the current page's render or your first interaction.
export function RoutePrewarm({ hrefs }: { hrefs: readonly string[] }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const queue = [...hrefs];

    const pump = () => {
      if (cancelled) return;
      const next = queue.shift();
      if (!next) return;
      router.prefetch(next);
      window.setTimeout(pump, 150);
    };

    // Let the initial page settle first, then warm routes one every ~150ms.
    const start = window.setTimeout(pump, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
  }, [router, hrefs]);

  return null;
}

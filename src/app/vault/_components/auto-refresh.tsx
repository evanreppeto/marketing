"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      router.refresh();
      setRefreshedAt(Date.now());
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, router]);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]"
      title={`Auto-refreshes every ${Math.round(intervalMs / 1000)}s · last ${new Date(refreshedAt).toLocaleTimeString()}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.14_158)] status-breathe" aria-hidden="true" />
      Live
    </span>
  );
}

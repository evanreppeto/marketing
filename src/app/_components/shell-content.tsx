"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { PageSkeleton } from "./page-skeleton";

type ShellContentProps = {
  children: React.ReactNode;
};

type PendingNavigation = {
  fromPath: string;
  href: string;
};

export function ShellContent({ children }: ShellContentProps) {
  const pathname = usePathname();
  const currentPath = pathname ?? "/";
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const showPending = pending?.fromPath === currentPath;

  useEffect(() => {
    function handleNavigationPending(event: Event) {
      const customEvent = event as CustomEvent<PendingNavigation>;
      setPending(customEvent.detail);
    }

    window.addEventListener("signal:navigation-pending", handleNavigationPending);

    return () => {
      window.removeEventListener("signal:navigation-pending", handleNavigationPending);
    };
  }, []);

  if (showPending) {
    return <PageSkeleton />;
  }

  return children;
}

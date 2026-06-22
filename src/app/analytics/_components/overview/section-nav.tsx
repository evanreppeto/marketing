"use client";

import { useEffect, useState } from "react";

import { theme } from "@/app/_components/theme";

export type SectionLink = { id: string; label: string };

/** Sticky in-page nav. Highlights the section currently in view; clicking smooth-scrolls to it. */
export function SectionNav({ links }: { links: SectionLink[] }) {
  const [active, setActive] = useState(links[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const link of links) {
      const el = document.getElementById(link.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [links]);

  return (
    <nav
      aria-label="Analytics sections"
      className="sticky top-2 z-10 mb-5 flex flex-wrap gap-1 border-b border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--canvas)_86%,transparent)] pb-3 backdrop-blur"
    >
      {links.map((link) => (
        <a
          key={link.id}
          href={`#${link.id}`}
          aria-current={active === link.id ? "true" : undefined}
          className={`relative rounded-[8px] px-3 py-2 text-sm font-semibold transition active:translate-y-px ${active === link.id ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
        >
          {link.label}
          {active === link.id ? <span aria-hidden className={theme.control.tabMarker} /> : null}
        </a>
      ))}
    </nav>
  );
}

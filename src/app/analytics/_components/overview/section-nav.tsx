"use client";

import { useEffect, useState } from "react";

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
    <nav className="sticky top-2 z-10 mb-5 flex flex-wrap gap-1 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]/95 p-1.5 backdrop-blur">
      {links.map((link) => (
        <a
          key={link.id}
          href={`#${link.id}`}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${active === link.id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]"}`}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

"use client";

import { useEffect, useState } from "react";

import { cx } from "../_components/theme";
import { SETTINGS_SECTIONS } from "./settings-sections";

/** Nearest scrollable ancestor — the settings content area is a nested overflow
 *  container, not the window, so we scroll it directly. */
function getScrollParent(node: HTMLElement): HTMLElement | null {
  let element = node.parentElement;
  while (element) {
    const overflowY = getComputedStyle(element).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

/** Smooth-scroll a section into view. `scrollIntoView({behavior:"smooth"})` does not
 *  drive nested scroll containers in Chromium, so scroll the container itself. */
function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const scroller = getScrollParent(target);
  const offset = 24;
  if (scroller) {
    const top = scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset;
    scroller.scrollTo({ top, behavior: "smooth" });
  } else {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/**
 * Sticky left rail for the settings page. Anchors jump to each section card and the
 * active item tracks the section currently in view (IntersectionObserver against the
 * viewport — the content area is the scroll container). Hidden below `lg`, where the
 * page is a single stacked column.
 */
export function SettingsNav() {
  const [active, setActive] = useState<string>(SETTINGS_SECTIONS[0].id);

  useEffect(() => {
    const sections = SETTINGS_SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (element): element is HTMLElement => Boolean(element),
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Settings sections" className="hidden lg:sticky lg:top-0 lg:block lg:self-start">
      <div className="signal-eyebrow mb-3 px-3">Settings</div>
      <ul className="space-y-1">
        {SETTINGS_SECTIONS.map((section) => {
          const isActive = active === section.id;
          return (
            <li key={section.id}>
              <a
                aria-current={isActive ? "true" : undefined}
                className={cx(
                  "block rounded-lg px-3 py-2 text-sm font-semibold transition",
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
                )}
                href={`#${section.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  scrollToSection(section.id);
                  setActive(section.id);
                }}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import { cx } from "../_components/theme";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./settings-sections";

/**
 * Settings tab rail. Controlled by the parent: clicking an item selects that tab,
 * which swaps the panel shown in the content area. Vertical sidebar on `lg`+, a
 * horizontal scrollable row of tabs below it.
 */
export function SettingsNav({
  active,
  onSelect,
}: {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}) {
  return (
    <nav aria-label="Settings sections" className="lg:sticky lg:top-0 lg:self-start">
      <div className="signal-eyebrow mb-3 hidden px-3 lg:block">Settings</div>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden">
        {SETTINGS_SECTIONS.map((section) => {
          const isActive = active === section.id;
          return (
            <button
              aria-current={isActive ? "true" : undefined}
              className={cx(
                "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-semibold transition lg:w-full",
                isActive
                  ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
              )}
              key={section.id}
              onClick={() => onSelect(section.id)}
              type="button"
            >
              {section.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

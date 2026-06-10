"use client";

import { type ReactNode, useState } from "react";

import { SettingsNav } from "./settings-nav";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./settings-sections";

/**
 * Tabbed settings shell. The left rail selects a tab; only the active panel shows.
 * Panels are server-rendered upstream (in the page) and passed in by id, so this
 * client component only owns the active-tab state. All panels stay mounted (hidden
 * when inactive) so switching tabs never drops a panel's state.
 */
export function SettingsShell({ panels }: { panels: Record<SettingsSectionId, ReactNode> }) {
  const [active, setActive] = useState<SettingsSectionId>(SETTINGS_SECTIONS[0].id);

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
      <SettingsNav active={active} onSelect={setActive} />

      <div className="min-w-0">
        {SETTINGS_SECTIONS.map((section) => (
          <div className={active === section.id ? "space-y-5" : "hidden"} key={section.id}>
            {panels[section.id]}
          </div>
        ))}
      </div>
    </div>
  );
}

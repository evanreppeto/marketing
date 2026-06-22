import { type ReactNode } from "react";

import { SettingsNav } from "./settings-nav";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./settings-sections";

export function SettingsShell({
  active,
  panels,
}: {
  active: SettingsSectionId;
  panels: Record<SettingsSectionId, ReactNode>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-10">
      <SettingsNav active={active} />

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

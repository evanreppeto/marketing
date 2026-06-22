import Link from "next/link";
import {
  BriefcaseBusiness,
  Building2,
  CircleDollarSign,
  ContactRound,
  Home,
  MapPin,
  SlidersHorizontal,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { crmObjects } from "../../_data/growth-engine";
import { cx, theme } from "../../_components/theme";

type CrmObjectKey = (typeof crmObjects)[number]["key"];

const objectTabOrder = [
  { key: "home", label: "Home", href: "/crm" },
  ...crmObjects.map((object) => ({
    key: object.key,
    label: object.label,
    href: object.href,
  })),
  { key: "builder", label: "Object studio", href: "/crm/customize" },
];

const tabIcons: Record<string, LucideIcon> = {
  accounts: Building2,
  builder: SlidersHorizontal,
  contacts: ContactRound,
  home: Home,
  leads: Trophy,
  opportunities: BriefcaseBusiness,
  outcomes: CircleDollarSign,
  properties: MapPin,
};

export function CrmObjectTabs({
  activeObject,
  activeBuilder = false,
  counts,
}: {
  activeObject?: CrmObjectKey;
  activeBuilder?: boolean;
  counts?: Partial<Record<CrmObjectKey, number>>;
}) {
  return (
    <section className="module-rise [animation-delay:40ms]">
      <nav
        aria-label="CRM object tabs"
        className="flex gap-1 overflow-x-auto border-b border-[var(--border-hairline)] pb-3"
      >
        {objectTabOrder.map((tab) => {
          const isHome = tab.key === "home";
          const isBuilder = tab.key === "builder";
          const isActive = isBuilder ? activeBuilder : isHome ? !activeObject && !activeBuilder : tab.key === activeObject;
          const count = !isHome && !isBuilder ? counts?.[tab.key as CrmObjectKey] : undefined;
          const Icon = tabIcons[tab.key] ?? BriefcaseBusiness;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cx(`relative flex min-h-10 shrink-0 items-center gap-2 rounded-[8px] px-3 text-sm font-semibold transition duration-150 ease-out active:translate-y-px ${
                isActive
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`)}
              href={tab.href}
              key={tab.key}
            >
              <Icon aria-hidden className={isActive ? "h-4 w-4 text-[var(--accent)]" : "h-4 w-4 text-[var(--text-muted)]"} strokeWidth={1.8} />
              <span>{tab.label}</span>
              {typeof count === "number" ? (
                <span
                  className={`font-mono text-[11px] tabular-nums ${isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}
                >
                  {count.toLocaleString("en-US")}
                </span>
              ) : null}
              {isActive ? (
                <span aria-hidden className={theme.control.tabMarker} />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

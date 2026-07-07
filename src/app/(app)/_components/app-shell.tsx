"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { AccountMenu } from "./account-menu";

function initials(name: string): string {
  return (
    (name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "A"
  );
}

const IconArc = (
  <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 12.5h5" /></svg>
);
const IconHome = <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
const IconCampaigns = <svg viewBox="0 0 24 24"><path d="M4 5h16v6H4z" /><path d="M4 15h10v4H4z" /></svg>;
const IconCrm = <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M4 20c0-3 2-5 5-5s5 2 5 5" /><path d="M16 6h5M16 10h5" /></svg>;
const IconOpp = <svg viewBox="0 0 24 24"><path d="M12 3l2.5 5 5.5.8-4 4 1 5.5L12 21l-5-2.7 1-5.5-4-4 5.5-.8z" /></svg>;
const IconAnalytics = <svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-8" /></svg>;
const IconBrain = <svg viewBox="0 0 24 24"><path d="M12 4a4 4 0 00-4 4 3 3 0 00-1 6 3 3 0 003 3 3 3 0 006 0 3 3 0 003-3 3 3 0 00-1-6 4 4 0 00-4-4z" /></svg>;
const IconPersonas = <svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="2.5" /><circle cx="16" cy="9" r="2.5" /><path d="M3 19c0-3 2-4.5 5-4.5M21 19c0-3-2-4.5-5-4.5M9 19c0-2 1.5-3 3-3s3 1 3 3" /></svg>;
const IconStudio = <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z" /><path d="M4 14l5-4 4 3 3-2 4 3" /><circle cx="9" cy="9" r="1.4" /></svg>;
const IconLibrary = <svg viewBox="0 0 24 24"><path d="M4 7h6l2 2h8v10H4z" /></svg>;
const IconBrand = <svg viewBox="0 0 24 24"><path d="M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z" /></svg>;
const IconOutbox = <svg viewBox="0 0 24 24"><path d="M3 12l18-8-8 18-2-7z" /></svg>;

// Home + Campaigns are real routes; the rest still point at the mockup screens
// until each is ported.
const NAV_GROUPS: { group: string; items: { label: string; href: string; icon: React.ReactNode }[] }[] = [
  {
    group: "Workspace",
    items: [
      { label: "Arc", href: "/build-arc-v2.html", icon: IconArc },
      { label: "Home", href: "/home", icon: IconHome },
      { label: "Campaigns", href: "/campaigns", icon: IconCampaigns },
      { label: "CRM", href: "/crm", icon: IconCrm },
      { label: "Opportunities", href: "/opportunities", icon: IconOpp },
    ],
  },
  { group: "Growth", items: [{ label: "Analytics", href: "/analytics", icon: IconAnalytics }] },
  {
    group: "Intelligence",
    items: [
      { label: "Brain", href: "/brain", icon: IconBrain },
      { label: "Personas", href: "/personas", icon: IconPersonas },
    ],
  },
  {
    group: "Assets",
    items: [
      { label: "Studio", href: "/studio", icon: IconStudio },
      { label: "Library", href: "/library", icon: IconLibrary },
      { label: "Brand", href: "/brand", icon: IconBrand },
      { label: "Outbox", href: "/outbox", icon: IconOutbox },
    ],
  },
];

const CRUMBS: Record<string, string> = {
  "/home": "Home",
  "/campaigns": "Campaigns",
  "/crm": "CRM",
  "/analytics": "Analytics",
  "/brain": "Brain",
  "/opportunities": "Opportunities",
  "/personas": "Personas",
  "/outbox": "Outbox",
  "/library": "Library",
  "/brand": "Brand",
  "/studio": "Studio",
};

export function AppShell({
  workspaceName,
  orgName,
  userName,
  userEmail,
  children,
}: {
  workspaceName: string;
  orgName: string;
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const displayName = userName || orgName;
  const firstName = userName.split(/\s+/)[0] || "there";
  const crumb = CRUMBS[pathname] ?? "Home";

  // The static mockup gallery can load a ported real screen inside its crossfade
  // iframe. When that happens the gallery host already provides the sidebar, so
  // this shell must drop its own rail (the two would stack — the double-sidebar
  // bug). Mirrors the mockup pages' own `is-embedded` contract. Read via
  // useSyncExternalStore so the server renders "not embedded" and the client
  // corrects after hydration without a mismatch (the value never changes).
  const embedded = useSyncExternalStore(
    () => () => {},
    () => window.self !== window.top,
    () => false,
  );

  return (
    <div className={embedded ? "arc-app is-embedded" : "arc-app"}>
      <div className="app">
        <aside className="rail">
          <div className="ws">
            <span className="mk">{initials(orgName)}</span>
            <div>
              <div className="nm">{workspaceName}</div>
              <div className="pl">{orgName}</div>
            </div>
          </div>
          <div className="indtag">
            <i />
            {orgName.split(/\s+/)[0]?.toUpperCase()} workspace
          </div>
          <div className="navwrap">
            {NAV_GROUPS.map((g) => (
              <div key={g.group}>
                <div className="grp">{g.group.toUpperCase()}</div>
                {g.items.map((it) => {
                  const active = pathname === it.href;
                  return (
                    <Link key={it.label} href={it.href} className={`nav${active ? " on" : ""}`}>
                      {active && <span className="tick" />}
                      {it.icon}
                      {it.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
          <AccountMenu
            firstName={firstName}
            displayName={displayName}
            email={userEmail}
            initials={initials(displayName)}
            settingsHref="/settings/team"
          />
        </aside>

        <div className="main">
          <header className="top">
            <span className="crumb">{crumb}</span>
            <div className="search">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              Search or jump to…
              <span className="k">⌘K</span>
            </div>
            <span className="topav">{initials(displayName)}</span>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}

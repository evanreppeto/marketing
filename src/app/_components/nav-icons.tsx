export type NavIconName =
  | "campaigns"
  | "crm"
  | "outbox"
  | "gallery"
  | "arc"
  | "settings"
  | "board"
  | "analytics"
  | "brain"
  | "activity";

const paths: Record<NavIconName, React.ReactNode> = {
  // Three columns — kanban task board
  board: (
    <>
      <rect height="14" rx="1" width="4.2" x="4" y="5" />
      <rect height="9" rx="1" width="4.2" x="9.9" y="5" />
      <rect height="11" rx="1" width="4.2" x="15.8" y="5" />
    </>
  ),
  // Activity pulse over timeline - workspace log
  activity: (
    <>
      <path d="M6 5.8v12.4" />
      <circle cx="6" cy="6" fill="currentColor" r="2" stroke="none" />
      <circle cx="6" cy="12" fill="currentColor" r="2" stroke="none" />
      <circle cx="6" cy="18" fill="currentColor" r="2" stroke="none" />
      <rect fill="currentColor" height="2.4" rx="1.2" stroke="none" width="9.8" x="10" y="4.8" />
      <rect fill="currentColor" height="2.4" rx="1.2" stroke="none" width="6.6" x="10" y="10.8" />
      <rect fill="currentColor" height="2.4" rx="1.2" stroke="none" width="8.2" x="10" y="16.8" />
      <path d="m17.5 11.8 1.1-1.9 1.8 4 1.1-1.7" />
    </>
  ),
  // Megaphone — campaign broadcast
  campaigns: (
    <>
      <path d="M4 9.5v4a1.5 1.5 0 0 0 1.5 1.5H7l3.5 3.2c.6.55 1.5.1 1.5-.7V5.5c0-.8-.9-1.25-1.5-.7L7 8H5.5A1.5 1.5 0 0 0 4 9.5Z" />
      <path d="M15.5 9.2a4 4 0 0 1 0 4.6" />
      <path d="M18 6.8a8 8 0 0 1 0 9.4" />
    </>
  ),
  // Two people — contacts/relationships
  crm: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.8 19c.6-3 2.8-4.5 5.2-4.5s4.6 1.5 5.2 4.5" />
      <path d="M15.5 5.9a3 3 0 0 1 0 5.2" />
      <path d="M17.4 14.9c1.6.7 2.6 2.1 2.9 4.1" />
    </>
  ),
  // Send tray — queued outbound
  outbox: (
    <>
      <path d="M6 13h3.5l1.5 2h2l1.5-2H18" />
      <path d="M6 13v4a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 17v-4" />
      <path d="M12 10V3.5" />
      <path d="m9 6.5 3-3 3 3" />
    </>
  ),
  // Frame with horizon — media gallery
  gallery: (
    <>
      <rect height="14" rx="1.5" width="16" x="4" y="5" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m4 16 4.2-4 3.3 3.2 2.7-2.6L20 18" />
    </>
  ),
  // Message square — the Arc conversation
  arc: (
    <>
      <path d="M5.5 4.5h13A1.5 1.5 0 0 1 20 6v9a1.5 1.5 0 0 1-1.5 1.5H10L6 20v-3.5H5.5A1.5 1.5 0 0 1 4 15V6a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M8.5 9h7" />
      <path d="M8.5 12.2h4.5" />
    </>
  ),
  // Trend line over an axis — analytics
  analytics: (
    <>
      <path d="M4.5 4.5v13a1.5 1.5 0 0 0 1.5 1.5h13" />
      <path d="m7.5 14 3.3-3.6 2.7 2.3L19 7" />
    </>
  ),
  // Connected nodes — knowledge graph / marketing brain
  brain: (
    <>
      <circle cx="7" cy="7" r="2.1" />
      <circle cx="17" cy="9" r="2.1" />
      <circle cx="10" cy="17.2" r="2.1" />
      <path d="m9 7.4 5.9 1.2" />
      <path d="m7.6 9 1.8 6.1" />
      <path d="m15.4 10.7-4 4.8" />
    </>
  ),
  // Sliders — configuration
  settings: (
    <>
      <path d="M5 7h10" />
      <circle cx="17.5" cy="7" r="1.8" />
      <path d="M19 13.5H9" />
      <circle cx="6.5" cy="13.5" r="1.8" />
      <path d="M5 19.5h6" />
      <circle cx="13.5" cy="19.5" r="1.8" />
    </>
  ),
};

export function NavIcon({ name, className = "h-5 w-5" }: { name: NavIconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}

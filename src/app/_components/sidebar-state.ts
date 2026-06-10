export type SidebarInputs = { pinned: boolean; hovered: boolean; focusWithin: boolean };

/** The rail is expanded when pinned open, hovered, or holding keyboard focus. */
export function isSidebarExpanded({ pinned, hovered, focusWithin }: SidebarInputs): boolean {
  return pinned || hovered || focusWithin;
}

const PIN_KEY = "signal.sidebar.pinned";
type Readable = Pick<Storage, "getItem">;
type Writable = Pick<Storage, "setItem">;

/** Read the persisted pin preference. Safe when storage is missing (SSR/privacy). */
export function readPinnedPreference(storage: Readable | null | undefined): boolean {
  try {
    return storage?.getItem(PIN_KEY) === "true";
  } catch {
    return false;
  }
}

/** Persist the pin preference. Swallows storage errors. */
export function writePinnedPreference(storage: Writable | null | undefined, pinned: boolean): void {
  try {
    storage?.setItem(PIN_KEY, pinned ? "true" : "false");
  } catch {
    /* ignore */
  }
}

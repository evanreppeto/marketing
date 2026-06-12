import { describe, expect, it } from "vitest";

import { isSidebarExpanded, readPinnedPreference, writePinnedPreference } from "./sidebar-state";

describe("isSidebarExpanded", () => {
  it("is collapsed only when nothing is active", () => {
    expect(isSidebarExpanded({ pinned: false, hovered: false, focusWithin: false })).toBe(false);
  });
  it("expands when pinned, hovered, or focused within", () => {
    expect(isSidebarExpanded({ pinned: true, hovered: false, focusWithin: false })).toBe(true);
    expect(isSidebarExpanded({ pinned: false, hovered: true, focusWithin: false })).toBe(true);
    expect(isSidebarExpanded({ pinned: false, hovered: false, focusWithin: true })).toBe(true);
  });
});

describe("pin preference persistence", () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const store = { ...initial };
    return {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };
  }
  it("round-trips the pinned flag", () => {
    const storage = fakeStorage();
    expect(readPinnedPreference(storage)).toBe(false);
    writePinnedPreference(storage, true);
    expect(readPinnedPreference(storage)).toBe(true);
  });
  it("never throws when storage is unavailable", () => {
    expect(readPinnedPreference(null)).toBe(false);
    expect(() => writePinnedPreference(null, true)).not.toThrow();
  });
});

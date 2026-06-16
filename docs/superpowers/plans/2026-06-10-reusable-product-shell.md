# Reusable Product Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app shell feel like a connectable product — a collapsible icon-rail sidebar, agent identity as configuration, a connect-your-agent onboarding state, and an Agent settings drawer in the Arc tab — all built on the existing Signal design system and the existing `agent-config.ts` seam.

**Architecture:** Extend `src/lib/arc-chat/agent-config.ts` (the existing agent identity/connection seam) rather than duplicate it. Pure helpers (`agentProfile`, `getAgentDisplayName`, `isAgentConfigured`, `isSidebarExpanded`) feed thin presentational changes in `ConsoleFrame`/`SideNav`, a reusable `ConnectAgentPanel`, and an `AgentSettingsDrawer` reached from the Arc header. Agent name becomes operator-editable via `app_settings` (layered over the `ARC_DISPLAY_NAME` env default). No secrets in the DB. No new dependencies.

**Tech Stack:** Next.js 16 (server + client components, server actions), React 19 (`useActionState`), TypeScript, Tailwind, Vitest. Existing seams: `theme.ts`, `page-header.tsx`, `nav-icons.tsx`, `arc-chat/agent-config.ts`, `settings/store.ts`, `settings/app-settings-actions.ts`, `arc/actions.ts`.

---

## Deviations / decisions (read first)

1. **Build on `agent-config.ts`, don't duplicate.** The existing module already owns agent name (`getMarkDisplayName`), runner config (`isMarkRunnerConfigured`), and keys. We add `agentProfile`, `getAgentDisplayName(override)`, and `isAgentConfigured(env)` there.
2. **Agent name editable via `app_settings` (default `""`), layered over env.** `getAgentDisplayName(settings.agentName)` = DB value → `ARC_DISPLAY_NAME` → `"Arc"`. No behavior change until overridden.
3. **No in-UI secrets.** The Arc drawer edits the display *name* and shows env-credential status + instructions only. Full in-UI credential storage is a deferred follow-up.
4. **Campaigns "Talk to Arc" rename deferred to Sub-project 2** (which reworks that tab).

## File structure

**Create:**
- `src/lib/arc-chat/agent-config.test.ts` — tests for new helpers.
- `src/app/_components/sidebar-state.ts` + `.test.ts` — pure rail-state helpers.
- `src/app/_components/connect-agent-panel.tsx` — onboarding panel.
- `src/app/arc/_components/agent-settings-drawer.tsx` — the Arc drawer.

**Modify:**
- `src/lib/arc-chat/agent-config.ts` — add `agentProfile`, `getAgentDisplayName`, `isAgentConfigured`.
- `src/lib/settings/store.ts` (+ `.test.ts`) — add `agentName` (default `""`).
- `src/app/settings/app-settings-actions.ts` — add `saveAgentNameAction`.
- `src/app/arc/actions.ts` — add `getAgentConnectionInfoAction` + type.
- `src/app/_components/side-nav.tsx` — `collapsed` prop.
- `src/app/_components/console-frame.tsx` — collapsible rail, pin, agent label/monogram.
- `src/app/layout.tsx` — async; resolve agent name; pass to `ConsoleFrame`.
- `src/app/campaigns/page.tsx` — `ConnectAgentPanel` when unconfigured.
- `src/app/settings/system-status.tsx` — `ConnectAgentPanel` block when unconfigured.
- `src/app/arc/_components/arc-chat.tsx` — gear button + drawer.

---

## Task 1: Agent identity helpers (extend agent-config.ts)

**Files:**
- Modify: `src/lib/arc-chat/agent-config.ts`
- Test: `src/lib/arc-chat/agent-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/arc-chat/agent-config.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { agentProfile, getAgentDisplayName, isAgentConfigured } from "./agent-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("agentProfile", () => {
  it("defaults to Arc/M for empty input", () => {
    expect(agentProfile("")).toEqual({ name: "Arc", shortName: "Arc", monogram: "M" });
    expect(agentProfile(undefined)).toEqual({ name: "Arc", shortName: "Arc", monogram: "M" });
  });

  it("derives first-word shortName and uppercase monogram", () => {
    expect(agentProfile("Arc")).toEqual({ name: "Arc", shortName: "Arc", monogram: "H" });
    expect(agentProfile("Ada Lovelace")).toEqual({ name: "Ada Lovelace", shortName: "Ada", monogram: "A" });
    expect(agentProfile("@nova").monogram).toBe("N");
  });
});

describe("getAgentDisplayName", () => {
  it("prefers the operator override, then env, then Arc", () => {
    vi.stubEnv("ARC_DISPLAY_NAME", "Arc");
    expect(getAgentDisplayName("Nova")).toBe("Nova");
    expect(getAgentDisplayName("")).toBe("Arc");
    expect(getAgentDisplayName(null)).toBe("Arc");
    vi.stubEnv("ARC_DISPLAY_NAME", "");
    expect(getAgentDisplayName(undefined)).toBe("Arc");
  });
});

describe("isAgentConfigured", () => {
  it("is false when neither runner nor token is set", () => {
    expect(isAgentConfigured({})).toBe(false);
  });
  it("is true when a runner URL or the API token is set", () => {
    expect(isAgentConfigured({ ARC_RUNNER_URL: "https://r" })).toBe(true);
    expect(isAgentConfigured({ ARC_WEBHOOK_URL: "https://w" })).toBe(true);
    expect(isAgentConfigured({ ARC_AGENT_API_TOKEN: "tok" })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/arc-chat/agent-config.test.ts`
Expected: FAIL — `agentProfile` / `getAgentDisplayName` / `isAgentConfigured` are not exported.

- [ ] **Step 3: Add the helpers**

Append to `src/lib/arc-chat/agent-config.ts`:

```ts
export type AgentProfile = { name: string; shortName: string; monogram: string };

/** Derive display identity from a resolved name. Pure; empty falls back to "Arc". */
export function agentProfile(rawName: string | null | undefined): AgentProfile {
  const name = (rawName ?? "").trim() || "Arc";
  const shortName = name.split(/\s+/)[0] || name;
  const firstAlnum = name.replace(/[^A-Za-z0-9]/g, "")[0] ?? "M";
  return { name, shortName, monogram: firstAlnum.toUpperCase() };
}

/** Resolve the agent's display name: operator override (DB) → env → "Arc". */
export function getAgentDisplayName(override: string | null | undefined): string {
  return override?.trim() || getMarkDisplayName();
}

/** Whether any agent link is configured (runner endpoint or inbound API token). */
export function isAgentConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ARC_RUNNER_URL ?? env.ARC_WEBHOOK_URL) || Boolean(env.ARC_AGENT_API_TOKEN?.trim());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/arc-chat/agent-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/arc-chat/agent-config.ts src/lib/arc-chat/agent-config.test.ts
git commit -m "feat(agent): agentProfile + name resolver + isAgentConfigured"
```

---

## Task 2: Editable agent name in settings store

**Files:**
- Modify: `src/lib/settings/store.ts` (type `:9-13`, defaults `:15-19`, merge `:38-43`)
- Test: `src/lib/settings/store.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

If `src/lib/settings/store.test.ts` exists, add these cases to it; else create:

```ts
// src/lib/settings/store.test.ts
import { describe, expect, it } from "vitest";

import { DEFAULT_APP_SETTINGS, getAppSettings } from "./store";

describe("app settings agentName", () => {
  it("defaults agentName to empty string (falls through to env/Arc elsewhere)", () => {
    expect(DEFAULT_APP_SETTINGS.agentName).toBe("");
  });

  it("returns defaults incl. agentName when Supabase is not configured", async () => {
    const settings = await getAppSettings();
    expect(settings.agentName).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/settings/store.test.ts`
Expected: FAIL — `agentName` is `undefined`.

- [ ] **Step 3: Add `agentName`**

Type:

```ts
export type AppSettings = {
  workspaceName: string;
  supportEmail: string;
  markWebhookEnabled: boolean;
  agentName: string;
};
```

Default:

```ts
export const DEFAULT_APP_SETTINGS: AppSettings = {
  workspaceName: "Big Shoulders Restoration M&P",
  supportEmail: "",
  markWebhookEnabled: true,
  agentName: "",
};
```

Merge (add after the `markWebhookEnabled` line in the object returned by `mergeRows`):

```ts
    agentName: str("agent_name", DEFAULT_APP_SETTINGS.agentName),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/settings/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings/store.ts src/lib/settings/store.test.ts
git commit -m "feat(settings): operator-editable agentName (layered over env)"
```

---

## Task 3: saveAgentNameAction

**Files:**
- Modify: `src/app/settings/app-settings-actions.ts`

(No unit test — server action with auth/IO, covered by the manual pass. Mirrors `saveGeneralSettingsAction`.)

- [ ] **Step 1: Add the action**

Append to `src/app/settings/app-settings-actions.ts` (imports `requireOperator`, `saveAppSettings`, `getSupabaseAdminClient`, `isSupabaseAdminConfigured`, `revalidatePath`, and `NOT_CONFIGURED` already exist in this file):

```ts
/** Save the operator-editable agent display name (empty = fall back to env default). */
export async function saveAgentNameAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const agentName = String(formData.get("agentName") ?? "").trim().slice(0, 60);

  try {
    await saveAppSettings(getSupabaseAdminClient(), { agent_name: agentName });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save the agent name." };
  }

  revalidatePath("/settings");
  revalidatePath("/arc");
  revalidatePath("/", "layout"); // refresh the shell nav label
  return { ok: true, message: "Agent name saved." };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/app-settings-actions.ts
git commit -m "feat(settings): saveAgentNameAction"
```

---

## Task 4: Sidebar expansion state (pure module)

**Files:**
- Create: `src/app/_components/sidebar-state.ts`
- Test: `src/app/_components/sidebar-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/_components/sidebar-state.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/_components/sidebar-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/_components/sidebar-state.ts

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/_components/sidebar-state.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/sidebar-state.ts src/app/_components/sidebar-state.test.ts
git commit -m "feat(shell): pure sidebar expansion + pin-preference helpers"
```

---

## Task 5: ConnectAgentPanel component

**Files:**
- Create: `src/app/_components/connect-agent-panel.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/_components/connect-agent-panel.tsx
import Link from "next/link";

import { buttonClasses, EmptyState } from "./page-header";

/**
 * Onboarding state shown when no agent is configured. Mounted on the Campaigns
 * library and in System status. Reuses the shared EmptyState surface.
 */
export function ConnectAgentPanel({ agentName }: { agentName: string }) {
  return (
    <EmptyState
      title={`Connect your ${agentName} agent`}
      detail={`No agent is wired up yet. Point this workspace at your Arc agent by setting its runner endpoint (ARC_RUNNER_URL) and API token (ARC_AGENT_API_TOKEN) in the environment. Once connected, ${agentName}'s drafts and approvals appear here automatically. Check status anytime in System status.`}
      action={
        <Link href="/settings" className={buttonClasses({ size: "sm" })}>
          Open System status
        </Link>
      }
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/connect-agent-panel.tsx
git commit -m "feat(shell): ConnectAgentPanel onboarding state"
```

---

## Task 6: Collapsible icon-rail ConsoleFrame + SideNav + layout wiring

**Files:**
- Modify: `src/app/_components/side-nav.tsx`
- Modify: `src/app/_components/console-frame.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add a `collapsed` prop to `SideNav`**

In `src/app/_components/side-nav.tsx`, change the type:

```ts
type SideNavProps = {
  active: string;
  items: ShellNavItem[];
  /** When true, labels are visually hidden at lg (icon rail). Mobile always shows labels. */
  collapsed?: boolean;
};
```

Change the signature:

```ts
export function SideNav({ active, items, collapsed = false }: SideNavProps) {
```

On the `<Link>`, add a `title` prop:

```tsx
            title={item.label}
```

Replace the label span:

```tsx
            <span className={collapsed ? "lg:hidden" : ""}>{item.label}</span>
```

- [ ] **Step 2: Rebuild `ConsoleFrame`**

Replace the entire contents of `src/app/_components/console-frame.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ShellContent } from "./shell-content";
import { SideNav, type ShellNavItem } from "./side-nav";
import { isSidebarExpanded, readPinnedPreference, writePinnedPreference } from "./sidebar-state";
import { cx, theme } from "./theme";

/**
 * Persistent application chrome, rendered ONCE in the root layout so the sidebar
 * and SideNav pending state survive navigations. The rail is a compact icon strip
 * by default (lg+) and expands on hover, keyboard focus, or when pinned.
 * `agentName`/`agentMonogram` come from the server layout so the connected agent's
 * identity threads through nav + brand. Auth pages render bare.
 */
export function ConsoleFrame({
  agentName,
  agentMonogram,
  children,
}: {
  gateEnabled: boolean;
  agentName: string;
  agentMonogram: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";

  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);

  useEffect(() => {
    setPinned(readPinnedPreference(typeof window === "undefined" ? null : window.localStorage));
  }, []);

  function togglePinned() {
    setPinned((prev) => {
      const next = !prev;
      writePinnedPreference(typeof window === "undefined" ? null : window.localStorage, next);
      return next;
    });
  }

  const navItems: ShellNavItem[] = [
    { label: agentName, href: "/arc", icon: "arc", matches: ["/arc", "/"] },
    { label: "Campaigns", href: "/campaigns", icon: "campaigns", matches: ["/campaigns"] },
  ];

  if (pathname === "/login" || pathname === "/sign-in" || pathname === "/forgot-password") {
    return <>{children}</>;
  }

  const expanded = isSidebarExpanded({ pinned, hovered, focusWithin });
  const collapsed = !expanded;

  const layout = cx(
    "min-h-screen lg:grid lg:h-screen lg:min-h-0",
    "lg:transition-[grid-template-columns] lg:duration-200 motion-reduce:lg:transition-none",
    expanded ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[72px_minmax(0,1fr)]",
  );

  return (
    <main className={theme.shell.canvas}>
      <div className={layout}>
        <aside
          className={theme.shell.sidebar}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocusWithin(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
          }}
        >
          <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pr-1 [&::-webkit-scrollbar]:hidden">
            <Link
              href="/arc"
              className="group mb-2 flex items-center px-1.5 leading-none transition hover:opacity-90"
              aria-label="Big Shoulders Marketing — go to home"
              title="Big Shoulders Marketing"
            >
              <span
                aria-hidden
                className={cx(
                  "hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] font-display text-sm font-semibold text-[var(--accent)]",
                  collapsed && "lg:flex",
                )}
              >
                BS
              </span>
              <span className={cx("flex flex-col", collapsed && "lg:hidden")}>
                <span
                  className="text-[1.15rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Big Shoulders
                </span>
                <span className="mt-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.34em] text-[var(--accent)]">
                  Marketing
                </span>
              </span>
            </Link>

            <SideNav active={pathname} items={navItems} collapsed={collapsed} />

            <button
              type="button"
              onClick={togglePinned}
              aria-pressed={pinned}
              title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
              className="mt-2 hidden h-8 items-center gap-2 rounded-lg border border-transparent px-2.5 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--border-hairline)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-secondary)] lg:inline-flex"
            >
              <span aria-hidden className="text-base leading-none">
                {pinned ? "⇤" : "⇥"}
              </span>
              <span className={collapsed ? "lg:hidden" : ""}>{pinned ? "Unpin" : "Pin open"}</span>
            </button>
          </div>

          <OperatorProfile collapsed={collapsed} />
        </aside>

        <section
          className={
            pathname.startsWith("/arc")
              ? "min-w-0 min-h-screen lg:h-screen lg:min-h-0 lg:overflow-hidden"
              : theme.shell.content
          }
        >
          <ShellContent>{children}</ShellContent>
        </section>
      </div>
    </main>
  );
}

function OperatorProfile({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cx("mt-4 hidden border-t pb-6 pt-4 lg:block", theme.surface.divider)}>
      <div className="flex items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5 transition hover:border-[var(--border-panel)]">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] font-display text-xs font-semibold text-[var(--accent)]">
          ER
          <span
            aria-label="Active"
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-inset)] bg-[var(--ok)]"
          />
        </div>
        <div className={cx("min-w-0 flex-1", collapsed && "lg:hidden")}>
          <div className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Evan</div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">Operator</div>
        </div>
      </div>
    </div>
  );
}
```

Note: `agentMonogram` is passed for layout-contract stability/future agent-avatar use; if lint flags it unused, keep it in the prop type and reference it with a `void agentMonogram;` line after the `navItems` declaration, or remove the prop from the destructure while keeping it in the type. `gateEnabled` is retained in the type for call-site compatibility.

- [ ] **Step 3: Make `RootLayout` async and pass agent identity**

In `src/app/layout.tsx`, add imports (keep the single existing `getAppSettings` import):

```ts
import { agentProfile, getAgentDisplayName } from "@/lib/arc-chat/agent-config";
```

Replace `RootLayout`:

```tsx
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { agentName } = await getAppSettings();
  const profile = agentProfile(getAgentDisplayName(agentName));

  return (
    <html
      lang="en"
      className={`h-full antialiased ${display.variable} ${serif.variable} ${body.variable} ${mono.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <ConsoleFrame
          gateEnabled={isOperatorGateEnabled()}
          agentName={profile.name}
          agentMonogram={profile.monogram}
        >
          {children}
        </ConsoleFrame>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Typecheck + full unit suite**

Run: `pnpm lint` → no errors.
Run: `pnpm test` → PASS (existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/side-nav.tsx src/app/_components/console-frame.tsx src/app/layout.tsx
git commit -m "feat(shell): collapsible icon-rail sidebar with pin + agent identity"
```

---

## Task 7: Mount ConnectAgentPanel on Campaigns + System status

**Files:**
- Modify: `src/app/campaigns/page.tsx`
- Modify: `src/app/settings/system-status.tsx`

- [ ] **Step 1: Campaigns library**

In `src/app/campaigns/page.tsx`, add imports:

```ts
import { isAgentConfigured } from "@/lib/arc-chat/agent-config";
import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";
import { ConnectAgentPanel } from "../_components/connect-agent-panel";
```

(Combine the two `agent-config` imports into one line.) After `const { campaigns } = list;` add:

```ts
  const configured = isAgentConfigured();
  const { agentName } = await getAppSettings();
  const displayName = getAgentDisplayName(agentName);
```

Replace the empty-state branch:

```tsx
      {campaigns.length > 0 ? (
        <CampaignLibrary campaigns={campaigns} activeStatus={getParam(params.status)} nowMs={nowMs} />
      ) : configured ? (
        <EmptyState
          title="No campaigns yet"
          detail="When Arc drafts a campaign it appears here with its creative, the leads and reasoning behind it, and a human-gate approval record. Outbound stays locked until you approve."
        />
      ) : (
        <ConnectAgentPanel agentName={displayName} />
      )}
```

- [ ] **Step 2: System status**

In `src/app/settings/system-status.tsx`, add imports:

```ts
import { getAgentDisplayName, isAgentConfigured } from "@/lib/arc-chat/agent-config";
import { ConnectAgentPanel } from "../_components/connect-agent-panel";
```

After `const settings = await getAppSettings();` add:

```ts
  const agentConfigured = isAgentConfigured();
  const agentDisplayName = getAgentDisplayName(settings.agentName);
```

Wrap the return in a `<div className="space-y-4">`, with the panel above the section when unconfigured. Change `return (` to:

```tsx
  return (
    <div className="space-y-4">
      {agentConfigured ? null : <ConnectAgentPanel agentName={agentDisplayName} />}
      <SettingsSection
```

…and add a closing `</div>` after the `</SettingsSection>` closing tag (before the final `);`).

- [ ] **Step 3: Typecheck**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns/page.tsx src/app/settings/system-status.tsx
git commit -m "feat(shell): surface ConnectAgentPanel on campaigns + system status"
```

---

## Task 8: Agent connection info action

**Files:**
- Modify: `src/app/arc/actions.ts`

- [ ] **Step 1: Add the action + type**

In `src/app/arc/actions.ts`, after the `getMarkAgentStatusAction` definition (it already imports `isMarkRunnerConfigured` from `@/lib/arc-chat/agent-config`), add:

```ts
export type AgentConnectionInfo = {
  attached: boolean;
  name: string;
  runnerConfigured: boolean;
  tokenConfigured: boolean;
};

/** Full connection snapshot for the Agent settings drawer: live attach state +
 *  which env credentials are present. No secrets returned, only booleans. */
export async function getAgentConnectionInfoAction(): Promise<AgentConnectionInfo> {
  const status = await getMarkAgentStatusAction();
  return {
    attached: status.attached,
    name: status.name,
    runnerConfigured: isMarkRunnerConfigured(),
    tokenConfigured: Boolean(process.env.ARC_AGENT_API_TOKEN?.trim()),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/arc/actions.ts
git commit -m "feat(arc): getAgentConnectionInfoAction for the settings drawer"
```

---

## Task 9: Agent settings drawer + Arc header gear

**Files:**
- Create: `src/app/arc/_components/agent-settings-drawer.tsx`
- Modify: `src/app/arc/_components/arc-chat.tsx`

- [ ] **Step 1: Write the drawer component**

```tsx
// src/app/arc/_components/agent-settings-drawer.tsx
"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button, buttonClasses } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import { saveAgentNameAction } from "@/app/settings/app-settings-actions";
import { getAgentConnectionInfoAction, type AgentConnectionInfo } from "../actions";

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

/**
 * In-context agent configuration, opened from the Arc header. Shows live
 * connection status, lets the operator rename the agent (persisted), and lists
 * the env credentials to set. Secrets are never entered or stored here.
 */
export function AgentSettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<AgentConnectionInfo | null>(null);
  const [state, action, pending] = useActionState(saveAgentNameAction, null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    getAgentConnectionInfoAction()
      .then(setInfo)
      .catch(() => {});
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close agent settings" className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Agent settings"
        tabIndex={-1}
        className="relative h-full w-full max-w-[420px] overflow-y-auto border-l border-[var(--border-panel)] bg-[var(--surface-panel)] p-5 shadow-[var(--elev-panel)] outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Agent settings</h2>
          <button onClick={onClose} aria-label="Close" className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
            ✕
          </button>
        </div>

        <div className="mb-5 flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5">
          <span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full", info?.attached ? "bg-[var(--ok)]" : "bg-[var(--warn)]")} />
          <span className="text-sm text-[var(--text-secondary)]">
            {info
              ? info.attached
                ? `${info.name} is connected.`
                : "No agent attached — messages queue until one connects."
              : "Checking connection…"}
          </span>
        </div>

        {info ? (
          <form action={action} className="mb-6 grid gap-1.5">
            <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="agentName">
              Agent name
            </label>
            <input id="agentName" name="agentName" defaultValue={info.name} className={inputClass} />
            <span className="text-xs text-[var(--text-muted)]">How your agent is labeled across the app. Leave blank to use the deployment default.</span>
            <div className="mt-2 flex items-center gap-3">
              <Button disabled={pending} size="sm" type="submit" variant="primary">
                Save name
              </Button>
              {state ? (
                <span className={cx("text-xs font-semibold", state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]")}>
                  {state.message}
                </span>
              ) : null}
            </div>
          </form>
        ) : null}

        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Connection</h3>
        <div className="divide-y divide-[var(--border-hairline)] rounded-lg border border-[var(--border-hairline)]">
          <ChecklistRow ok={Boolean(info?.runnerConfigured)} label="Runner endpoint" env="ARC_RUNNER_URL" hint="Where the app wakes your agent." />
          <ChecklistRow ok={Boolean(info?.tokenConfigured)} label="Agent API token" env="ARC_AGENT_API_TOKEN" hint="Bearer token your agent uses to reach the control-plane API." />
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Credentials are set via environment variables for security, not stored here.</p>

        <Link href="/settings" className={cx("mt-5 inline-flex", buttonClasses({ size: "sm", variant: "ghost" }))}>
          Open System status
        </Link>
      </div>
    </div>
  );
}

function ChecklistRow({ ok, label, env, hint }: { ok: boolean; label: string; env: string; hint: string }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5">
      <span aria-hidden className={cx("mt-0.5 text-sm", ok ? "text-[var(--ok-text)]" : "text-[var(--text-muted)]")}>
        {ok ? "✓" : "○"}
      </span>
      <div className="min-w-0">
        <div className="text-sm text-[var(--text-primary)]">
          {label} <span className="font-mono text-[11px] text-[var(--text-muted)]">{env}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)]">{hint}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the gear button + drawer into `arc-chat.tsx`**

In `src/app/arc/_components/arc-chat.tsx`:

(a) Add imports near the other `_components` imports:

```ts
import { IconButton } from "./icon-button";
import { AgentSettingsDrawer } from "./agent-settings-drawer";
```

(If `IconButton` is already imported, keep one import.)

(b) Inside the `MarkChat` component body (with the other `useState` hooks), add:

```ts
  const [agentSettingsOpen, setAgentSettingsOpen] = useState(false);
```

(c) In the header action cluster, add the gear button immediately before `<MarkConnection />` (the `<div className="flex shrink-0 items-center gap-2">` block):

```tsx
              <IconButton label="Agent settings" onClick={() => setAgentSettingsOpen(true)}>
                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H8a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </IconButton>
```

(d) Render the drawer once near the end of the component's returned JSX (just before the outermost closing tag):

```tsx
      <AgentSettingsDrawer open={agentSettingsOpen} onClose={() => setAgentSettingsOpen(false)} />
```

- [ ] **Step 3: Typecheck + full suite**

Run: `pnpm lint` → no errors.
Run: `pnpm test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/arc/_components/agent-settings-drawer.tsx src/app/arc/_components/arc-chat.tsx
git commit -m "feat(arc): Agent settings drawer with connect-your-agent guidance"
```

---

## Task 10: Verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run: `pnpm test` → all green.
- [ ] **Step 2: Lint + build** — Run: `pnpm lint` (clean); `pnpm build` (succeeds — confirms the async root layout + server/client boundaries are sound).
- [ ] **Step 3: Manual checks** (`pnpm dev`):
  - Rail is a 72px icon strip at `lg`; hover expands to 280px with labels; leaving collapses.
  - `Tab` into the nav expands the rail (focus-within); labels visible while focused.
  - Pin locks it open; reload keeps it pinned (localStorage); unpin reverts.
  - Collapsed icons show tooltips; brand shows "BS" collapsed, full wordmark expanded.
  - With no agent env set, `/campaigns` (no campaigns) and `/settings` show "Connect your Arc agent"; set `ARC_RUNNER_URL` or `ARC_AGENT_API_TOKEN` → reverts.
  - On `/arc`, the gear opens the Agent settings drawer: status pill, editable name, credential checklist, System status link. Escape and backdrop-click close it. Saving a name (with Supabase configured) updates the nav label after refresh.
  - Set the agent name to "Arc" in the drawer → nav label + onboarding copy read "Arc". Clear it → falls back to env/`Arc`.
  - OS reduce-motion → rail snaps instead of animating.
  - Below `lg`, the sidebar is unchanged.
- [ ] **Step 4: Final commit** (if manual fixes were needed):

```bash
git add -A
git commit -m "fix(shell): manual verification adjustments"
```

---

## Self-review notes

- **Spec coverage:** Unit 1 (rail) → Tasks 4, 6. Unit 2 (identity) → Tasks 1, 2, 3, 6. Unit 3 (onboarding) → Tasks 1, 5, 7. Unit 4 (Arc drawer) → Tasks 1, 2, 3, 8, 9. No-new-deps → honored.
- **Reconciliation:** all agent identity/connection logic lives in `arc-chat/agent-config.ts`; no parallel `src/lib/agent/` module.
- **Type consistency:** `agentProfile()` → `{name,shortName,monogram}`; `getAgentDisplayName(override)`; `isAgentConfigured(env?)`; `AgentConnectionInfo {attached,name,runnerConfigured,tokenConfigured}`; `saveAgentNameAction(prev,formData)` returns `SettingsActionState` (reused from `app-settings-actions.ts`). Drawer reads `info.name` for the name field default (no separate prop). `app_settings.agentName` defaults to `""` so the resolver falls through to env.
- **Deferred (documented):** full in-UI credential storage; Arc-surface campaigns "Talk to Arc" rename (Sub-project 2).
```

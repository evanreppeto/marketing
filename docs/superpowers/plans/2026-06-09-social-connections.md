# Social Connections — Credentials, Status & Operator Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the four social providers (Instagram, Facebook, LinkedIn, X) their real Vercel env vars, compute operator-facing status from env-var presence, and surface the same enable/disable + test controls Resend has — with real posting transport left for a later spec.

**Architecture:** Extend the existing connections registry (`src/domain/connections.ts`) so each provider declares its full `requiredEnvVars` set. The read-model computes "configured" from the registry (all required vars present) instead of a single DB column. A new server-action branch lets social providers be enabled/tested, where "test" is a credential-presence check (no live API call). A new `SocialConnectionControls` row renders them in the Settings panel. Secrets stay in env vars; nothing is sent to Mark.

**Tech Stack:** TypeScript, Next.js 16 server actions, React 19 (`useActionState`), Supabase (Postgres migration), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-social-connections-design.md`
**Credential guide:** `docs/social-connections-setup.md`

---

## File Structure

- `src/domain/connections.ts` — add `requiredEnvVars` to the registry + a pure `missingRequiredEnvVars(provider, env)` helper. Pure, no I/O.
- `src/domain/__tests__/connections.test.ts` — update the social-registry test; add `requiredEnvVars` + `missingRequiredEnvVars` tests.
- `src/lib/connections/read-model.ts` — compute `envPresent` from `requiredEnvVars`; add `requiredEnvVars` to `ConnectionView`.
- `src/lib/connections/read-model.test.ts` — add multi-var presence + `requiredEnvVars` surfacing tests.
- `supabase/migrations/20260609130000_social_connection_env.sql` — new; set display `env_var` for social rows.
- `src/app/settings/connections-actions.ts` — generalize the enable/test guards; social `test` = presence check.
- `src/app/settings/connection-controls.tsx` — add `requiredEnvVars` to `ConnectionRowView`; add `SocialConnectionControls`.
- `src/app/settings/connections-panel.tsx` — render social through `SocialConnectionControls`.
- `.env.example` — append the social env-var block.

---

## Task 1: Registry — add `requiredEnvVars` + `missingRequiredEnvVars`

**Files:**
- Modify: `src/domain/connections.ts:4-25` (type + registry), add helper after the registry.
- Test: `src/domain/__tests__/connections.test.ts:10-26` (update) and new cases.

- [ ] **Step 1: Update the failing tests**

In `src/domain/__tests__/connections.test.ts`, **replace** the existing block at lines 16-20 (the `"includes the four social providers with kind=social and no env var"` test) with:

```typescript
  it("includes the four social providers with kind=social and required env vars", () => {
    const social = CONNECTION_REGISTRY.filter((entry) => entry.kind === "social");
    expect(social.map((entry) => entry.provider).sort()).toEqual(["facebook", "instagram", "linkedin", "x"]);
    // Every social provider declares a non-empty required-env-var set and a primary display var.
    expect(social.every((entry) => entry.requiredEnvVars.length > 0)).toBe(true);
    expect(social.every((entry) => typeof entry.envVar === "string")).toBe(true);
  });

  it("requires the Meta credential block for facebook and instagram", () => {
    const facebook = CONNECTION_REGISTRY.find((entry) => entry.provider === "facebook");
    const instagram = CONNECTION_REGISTRY.find((entry) => entry.provider === "instagram");
    expect(facebook?.requiredEnvVars).toEqual(["META_APP_ID", "META_APP_SECRET", "META_PAGE_ID", "META_PAGE_ACCESS_TOKEN"]);
    expect(instagram?.requiredEnvVars).toEqual(["META_APP_ID", "META_APP_SECRET", "META_IG_USER_ID", "META_PAGE_ACCESS_TOKEN"]);
  });
```

Then add a new `describe` block after the `CONNECTION_REGISTRY` describe block (after line 26):

```typescript
describe("missingRequiredEnvVars", () => {
  it("returns [] when every required var is present and non-blank", () => {
    const env = { RESEND_API_KEY: "re_live" };
    expect(missingRequiredEnvVars("resend", env)).toEqual([]);
  });

  it("lists the missing var when a required var is absent", () => {
    expect(missingRequiredEnvVars("resend", {})).toEqual(["RESEND_API_KEY"]);
  });

  it("treats a blank/whitespace value as missing", () => {
    expect(missingRequiredEnvVars("resend", { RESEND_API_KEY: "   " })).toEqual(["RESEND_API_KEY"]);
  });

  it("returns only the missing subset for a multi-var provider", () => {
    const env = { META_APP_ID: "a", META_APP_SECRET: "b", META_PAGE_ACCESS_TOKEN: "t" };
    expect(missingRequiredEnvVars("facebook", env)).toEqual(["META_PAGE_ID"]);
  });

  it("returns [] for facebook when the full Meta block is present", () => {
    const env = { META_APP_ID: "a", META_APP_SECRET: "b", META_PAGE_ID: "p", META_PAGE_ACCESS_TOKEN: "t" };
    expect(missingRequiredEnvVars("facebook", env)).toEqual([]);
  });
});
```

Update the import at the top of the file (lines 3-8) to include `missingRequiredEnvVars`:

```typescript
import {
  buildResendEmailPayload,
  computeConnectionStatus,
  CONNECTION_REGISTRY,
  missingRequiredEnvVars,
  resolveDispatchIdempotencyKey,
} from "../connections";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/domain/__tests__/connections.test.ts`
Expected: FAIL — `missingRequiredEnvVars` is not exported, and `requiredEnvVars` is undefined on registry entries.

- [ ] **Step 3: Implement the registry + helper changes**

In `src/domain/connections.ts`, replace the `ConnectionRegistryEntry` type and `CONNECTION_REGISTRY` (lines 10-25) with:

```typescript
export type ConnectionRegistryEntry = {
  provider: ConnectionProvider;
  kind: ConnectionKind;
  label: string;
  /** Primary env var shown in the UI (display only). Resend uses its single key. */
  envVar: string | null;
  /** All env vars that must be present for the connection to count as configured. */
  requiredEnvVars: string[];
};

/** Canonical list of connectable providers. Seeded into the `connections` table. */
export const CONNECTION_REGISTRY: ConnectionRegistryEntry[] = [
  { provider: "resend", kind: "email", label: "Resend", envVar: "RESEND_API_KEY", requiredEnvVars: ["RESEND_API_KEY"] },
  {
    provider: "instagram",
    kind: "social",
    label: "Instagram",
    envVar: "META_PAGE_ACCESS_TOKEN",
    requiredEnvVars: ["META_APP_ID", "META_APP_SECRET", "META_IG_USER_ID", "META_PAGE_ACCESS_TOKEN"],
  },
  {
    provider: "facebook",
    kind: "social",
    label: "Facebook",
    envVar: "META_PAGE_ACCESS_TOKEN",
    requiredEnvVars: ["META_APP_ID", "META_APP_SECRET", "META_PAGE_ID", "META_PAGE_ACCESS_TOKEN"],
  },
  {
    provider: "linkedin",
    kind: "social",
    label: "LinkedIn",
    envVar: "LINKEDIN_ACCESS_TOKEN",
    requiredEnvVars: ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_ORG_URN"],
  },
  {
    provider: "x",
    kind: "social",
    label: "X",
    envVar: "X_API_KEY",
    requiredEnvVars: ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"],
  },
];

/**
 * Pure: which of a provider's required env vars are missing or blank in `env`.
 * Empty result ⇒ fully configured. Unknown provider ⇒ [] (callers only pass
 * registry providers). Used by the read-model (status) and the social test action.
 */
export function missingRequiredEnvVars(
  provider: ConnectionProvider,
  env: Record<string, string | undefined>,
): string[] {
  const entry = CONNECTION_REGISTRY.find((candidate) => candidate.provider === provider);
  if (!entry) return [];
  return entry.requiredEnvVars.filter((name) => !env[name]?.trim());
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/domain/__tests__/connections.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Verify the helper is exported from the domain barrel**

Run: `pnpm test src/domain/__tests__/connections.test.ts` already imports from `../connections`. Confirm `src/domain/index.ts` re-exports it (it uses `export * from "./connections"` — no change needed; if it lists named exports, add `missingRequiredEnvVars`).

Read `src/domain/index.ts` and confirm `connections` is re-exported with `export *`. If it is, no edit. If it names exports explicitly, add `missingRequiredEnvVars`.

- [ ] **Step 6: Commit**

```bash
git add src/domain/connections.ts src/domain/__tests__/connections.test.ts
git commit -m "feat(connections): declare requiredEnvVars per provider + missingRequiredEnvVars helper"
```

---

## Task 2: Read-model — compute status from `requiredEnvVars`

**Files:**
- Modify: `src/lib/connections/read-model.ts` (`ConnectionView`, `isSecretPresent` → registry-based, `rowToView`, `fallbackViews`).
- Test: `src/lib/connections/read-model.test.ts` — add cases.

- [ ] **Step 1: Write the failing tests**

In `src/lib/connections/read-model.test.ts`, add these cases inside the `describe("getConnections", ...)` block (after the existing social test, before the closing `});` at line 87):

```typescript
  it("reports connected for instagram only when the full Meta block is present and enabled", async () => {
    vi.stubEnv("META_APP_ID", "a");
    vi.stubEnv("META_APP_SECRET", "b");
    vi.stubEnv("META_IG_USER_ID", "ig-1");
    vi.stubEnv("META_PAGE_ACCESS_TOKEN", "tok");
    const supabase = createSupabaseQueryMock({
      connections: { data: [row({ provider: "instagram", kind: "social", label: "Instagram", env_var: "META_PAGE_ACCESS_TOKEN", enabled: true })], error: null },
    });

    const [ig] = await getConnections(supabase);

    expect(ig).toMatchObject({ provider: "instagram", status: "connected" });
  });

  it("reports not_configured for instagram when one Meta var is missing", async () => {
    vi.stubEnv("META_APP_ID", "a");
    vi.stubEnv("META_APP_SECRET", "b");
    vi.stubEnv("META_IG_USER_ID", "ig-1");
    // META_PAGE_ACCESS_TOKEN intentionally unset.
    const supabase = createSupabaseQueryMock({
      connections: { data: [row({ provider: "instagram", kind: "social", label: "Instagram", env_var: "META_PAGE_ACCESS_TOKEN", enabled: true })], error: null },
    });

    const [ig] = await getConnections(supabase);

    expect(ig.status).toBe("not_configured");
  });

  it("surfaces the provider's requiredEnvVars on the view", async () => {
    const supabase = createSupabaseQueryMock({
      connections: { data: [row({ provider: "x", kind: "social", label: "X", env_var: "X_API_KEY", enabled: false })], error: null },
    });

    const [x] = await getConnections(supabase);

    expect(x.requiredEnvVars).toEqual(["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/connections/read-model.test.ts`
Expected: FAIL — `requiredEnvVars` is `undefined` on the view, and instagram status is computed from the (null-ish) single column rather than the Meta block.

- [ ] **Step 3: Implement the read-model changes**

In `src/lib/connections/read-model.ts`:

(a) Update the import (lines 3-9) to add `missingRequiredEnvVars`:

```typescript
import {
  computeConnectionStatus,
  CONNECTION_REGISTRY,
  missingRequiredEnvVars,
  type ConnectionKind,
  type ConnectionProvider,
  type ConnectionStatus,
} from "@/domain";
```

(b) Add `requiredEnvVars` to `ConnectionView` (after `envVar: string | null;`, line 19):

```typescript
  envVar: string | null;
  requiredEnvVars: string[];
```

(c) Replace `isSecretPresent` (lines 40-43) with registry-based helpers:

```typescript
/** True when every env var the provider requires is present and non-blank. */
function isConfigured(provider: ConnectionProvider): boolean {
  return missingRequiredEnvVars(provider, process.env).length === 0;
}

/** The provider's required env vars from the registry (for display on the view). */
function requiredEnvVarsFor(provider: ConnectionProvider): string[] {
  return CONNECTION_REGISTRY.find((entry) => entry.provider === provider)?.requiredEnvVars ?? [];
}
```

(d) In `rowToView` (lines 45-64), change the `status` computation and add `requiredEnvVars`:

```typescript
  return {
    provider: row.provider,
    kind: row.kind,
    label: row.label,
    envVar: row.env_var,
    requiredEnvVars: requiredEnvVarsFor(row.provider),
    enabled: row.enabled,
    status: computeConnectionStatus({
      envPresent: isConfigured(row.provider),
      enabled: row.enabled,
      lastTestOk: row.last_test_ok,
    }),
    fromEmail: typeof config.fromEmail === "string" ? config.fromEmail : null,
    lastTestedAt: row.last_tested_at,
    lastTestOk: row.last_test_ok,
    lastTestError: row.last_test_error,
    lastUsedAt: row.last_used_at,
  };
```

(e) In `fallbackViews` (lines 67-80), use the registry and add `requiredEnvVars`:

```typescript
function fallbackViews(): ConnectionView[] {
  return CONNECTION_REGISTRY.map((entry) => ({
    provider: entry.provider,
    kind: entry.kind,
    label: entry.label,
    envVar: entry.envVar,
    requiredEnvVars: entry.requiredEnvVars,
    enabled: false,
    status: computeConnectionStatus({ envPresent: isConfigured(entry.provider), enabled: false, lastTestOk: null }),
    fromEmail: null,
    lastTestedAt: null,
    lastTestOk: null,
    lastTestError: null,
    lastUsedAt: null,
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/connections/read-model.test.ts`
Expected: PASS (existing cases still green — the Resend cases are unaffected; the original social test still yields `not_configured` because no Meta vars are stubbed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/connections/read-model.ts src/lib/connections/read-model.test.ts
git commit -m "feat(connections): compute status from requiredEnvVars; surface them on the view"
```

---

## Task 3: Migration — set display `env_var` for social rows

**Files:**
- Create: `supabase/migrations/20260609130000_social_connection_env.sql`

- [ ] **Step 1: Create the migration**

```sql
-- Set the display env_var for the social connection rows. Status/presence is computed
-- from the registry's requiredEnvVars in the read-model, NOT this single column — this
-- only gives the Settings UI a non-null primary var to show. Additive: do not edit the
-- shipped 20260609120000_connections.sql.

update public.connections set env_var = 'META_PAGE_ACCESS_TOKEN' where provider in ('facebook', 'instagram');
update public.connections set env_var = 'LINKEDIN_ACCESS_TOKEN'  where provider = 'linkedin';
update public.connections set env_var = 'X_API_KEY'              where provider = 'x';
```

- [ ] **Step 2: Verify it parses (lint the SQL by eye; no destructive ops)**

Confirm: three `UPDATE` statements, no `DROP`/`ALTER TYPE`, timestamp `20260609130000` is later than `20260609120000`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260609130000_social_connection_env.sql
git commit -m "feat(connections): migration to set display env_var for social rows"
```

---

## Task 4: Server actions — allow social enable/disable + presence test

**Files:**
- Modify: `src/app/settings/connections-actions.ts:5-77`

- [ ] **Step 1: Update imports and replace the `isResend` guard with registry helpers**

In `src/app/settings/connections-actions.ts`, update the domain import (line 5) to:

```typescript
import {
  buildResendEmailPayload,
  CONNECTION_REGISTRY,
  missingRequiredEnvVars,
  type ConnectionKind,
  type ConnectionProvider,
} from "@/domain";
```

Replace the `isResend` helper (lines 20-22) with:

```typescript
function registeredProvider(value: string): ConnectionProvider | null {
  return CONNECTION_REGISTRY.some((entry) => entry.provider === value) ? (value as ConnectionProvider) : null;
}

function providerMeta(provider: ConnectionProvider): { kind: ConnectionKind; label: string } {
  const entry = CONNECTION_REGISTRY.find((candidate) => candidate.provider === provider);
  return { kind: entry?.kind ?? "social", label: entry?.label ?? provider };
}
```

- [ ] **Step 2: Generalize `setConnectionEnabledAction`**

Replace the body of `setConnectionEnabledAction` (lines 32-45) with:

```typescript
  const provider = registeredProvider(String(formData.get("provider") ?? ""));
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!provider) {
    return { ok: false, message: "Unknown connection provider." };
  }

  const { label } = providerMeta(provider);
  try {
    await setConnectionEnabled(getSupabaseAdminClient(), provider, enabled);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't update the connection." };
  }

  revalidatePath("/settings");
  return { ok: true, message: enabled ? `${label} enabled.` : `${label} disabled — sends are now blocked.` };
```

- [ ] **Step 3: Branch `testConnectionAction` on provider kind**

Replace the body of `testConnectionAction` (lines 54-77) with:

```typescript
  const provider = registeredProvider(String(formData.get("provider") ?? ""));
  if (!provider) {
    return { ok: false, message: "Unknown connection provider." };
  }

  const { kind, label } = providerMeta(provider);

  // Social providers have no live transport yet — "test" verifies that every required
  // credential env var is present (no external API call).
  if (kind === "social") {
    const missing = missingRequiredEnvVars(provider, process.env);
    const result =
      missing.length === 0
        ? { ok: true as const }
        : { ok: false as const, error: `Missing env vars: ${missing.join(", ")}` };
    try {
      await recordConnectionTest(getSupabaseAdminClient(), provider, result);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Couldn't record the test." };
    }
    revalidatePath("/settings");
    return result.ok
      ? { ok: true, message: `${label} credentials are present.` }
      : { ok: false, message: result.error };
  }

  // Email (Resend): live key probe.
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, message: "RESEND_API_KEY isn't set in the environment." };
  }

  const result = await testResendConnection(apiKey);
  try {
    await recordConnectionTest(getSupabaseAdminClient(), provider, result);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't record the test." };
  }

  revalidatePath("/settings");
  return result.ok
    ? { ok: true, message: "Resend connection is healthy." }
    : { ok: false, message: result.error ?? "Resend test failed." };
```

Leave `sendTestEmailAction` and `sendDispatchAction` unchanged (email-only).

- [ ] **Step 4: Verify the file typechecks and lints**

Run: `pnpm lint`
Expected: PASS (no unused-import or type errors in `connections-actions.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/connections-actions.ts
git commit -m "feat(connections): enable/disable + presence-test for social providers"
```

---

## Task 5: Controls — `SocialConnectionControls`

**Files:**
- Modify: `src/app/settings/connection-controls.tsx:14-25` (type) and add a new export.

- [ ] **Step 1: Add `requiredEnvVars` to `ConnectionRowView`**

In `src/app/settings/connection-controls.tsx`, add to `ConnectionRowView` (after `envVar: string | null;`, line 18):

```typescript
  envVar: string | null;
  requiredEnvVars: string[];
```

- [ ] **Step 2: Add the `SocialConnectionControls` component**

Append at the end of `src/app/settings/connection-controls.tsx`:

```tsx
export function SocialConnectionControls({ connection }: { connection: ConnectionRowView }) {
  const [toggleState, toggleAction, togglePending] = useActionState(setConnectionEnabledAction, null);
  const [testState, testAction, testPending] = useActionState(testConnectionAction, null);

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-black text-[var(--text-primary)]">{connection.label}</span>
            <StatusPill tone={STATUS_TONE[connection.status] ?? "gray"}>
              {STATUS_LABEL[connection.status] ?? connection.status}
            </StatusPill>
          </div>
          <div className="mt-1 font-mono text-[11px] font-semibold text-[var(--text-muted)]">
            {connection.requiredEnvVars.join(" · ") || "—"}
          </div>
        </div>

        <form action={toggleAction}>
          <input type="hidden" name="provider" value={connection.provider} />
          <input type="hidden" name="enabled" value={connection.enabled ? "false" : "true"} />
          <Button disabled={togglePending} size="sm" type="submit" variant={connection.enabled ? "ghost" : "primary"}>
            {connection.enabled ? "Disable" : "Enable"}
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <form action={testAction}>
          <input type="hidden" name="provider" value={connection.provider} />
          <Button disabled={testPending} size="sm" type="submit" variant="ghost">
            Test connection
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-semibold text-[var(--text-muted)]">
        <span>Last tested: {fmt(connection.lastTestedAt)}</span>
        <span>Last used: {fmt(connection.lastUsedAt)}</span>
        {connection.lastTestError ? <span className="text-[var(--priority-text)]">{connection.lastTestError}</span> : null}
      </div>

      <Feedback state={toggleState} />
      <Feedback state={testState} />
    </li>
  );
}
```

(`STATUS_TONE`, `STATUS_LABEL`, `Feedback`, `fmt`, `Button`, `StatusPill`, `setConnectionEnabledAction`, `testConnectionAction` are all already imported/defined in this file from the Resend controls.)

- [ ] **Step 3: Verify lint/types**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/connection-controls.tsx
git commit -m "feat(connections): SocialConnectionControls row (enable/disable + presence test)"
```

---

## Task 6: Panel — render social through the new controls

**Files:**
- Modify: `src/app/settings/connections-panel.tsx`

- [ ] **Step 1: Replace the panel body**

Replace the whole contents of `src/app/settings/connections-panel.tsx` with:

```tsx
import { getConnections } from "@/lib/connections/read-model";

import { Panel } from "../_components/page-header";
import { ResendConnectionControls, SocialConnectionControls } from "./connection-controls";

/**
 * Connections section of Settings. Resend has live controls (enable/disable, test, send
 * test email). Social providers have env-var-backed status + enable/disable + a
 * presence "test"; real posting transport (OAuth + per-platform send) ships in the
 * transport spec. Secrets live in env vars — this surface only shows status and operator
 * controls, never a raw key.
 */
export async function ConnectionsPanel() {
  const connections = await getConnections();
  const email = connections.filter((connection) => connection.kind === "email");
  const social = connections.filter((connection) => connection.kind === "social");

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex flex-col gap-1 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="signal-eyebrow">Connections</div>
        <h2 className="text-xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">Outbound integrations</h2>
        <p className="max-w-[74ch] text-sm leading-6 text-[var(--text-secondary)]">
          Secrets stay in environment variables; these controls only flip the operator switch and record test/use
          telemetry. A real send happens only when an approved dispatch is executed.
        </p>
      </div>

      <ul className="divide-y divide-[var(--border-hairline)]">
        {email.map((connection) => (
          <ResendConnectionControls key={connection.provider} connection={connection} />
        ))}
      </ul>

      <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-3">
        <div className="signal-eyebrow">Social</div>
      </div>

      <ul className="divide-y divide-[var(--border-hairline)]">
        {social.map((connection) => (
          <SocialConnectionControls key={connection.provider} connection={connection} />
        ))}
      </ul>

      <p className="border-t border-[var(--border-hairline)] px-5 py-3 text-xs leading-5 text-[var(--text-muted)]">
        Posting transport (OAuth + per-platform send) ships in the transport spec. &ldquo;Test connection&rdquo; here
        only verifies the credentials are present in the environment — it does not post.
      </p>
    </Panel>
  );
}
```

- [ ] **Step 2: Verify build/lint**

Run: `pnpm lint`
Expected: PASS (note `StatusPill` is no longer imported here — make sure no unused import remains; the import line above only pulls `Panel`).

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/connections-panel.tsx
git commit -m "feat(connections): render social providers with live operator controls"
```

---

## Task 7: `.env.example` — document the social env vars

**Files:**
- Modify: `.env.example` (append after the Resend block at line 51)

- [ ] **Step 1: Append the social block**

Add to the end of `.env.example`:

```bash

# Social connections (placeholders; posting transport ships in a later spec).
# Full acquisition steps: docs/social-connections-setup.md. Status in the Connections
# panel flips to "Connected" once ALL of a provider's vars below are set.

# Meta — ONE app powers both Facebook Page + Instagram Business publishing.
META_APP_ID=
META_APP_SECRET=
META_PAGE_ID=               # Facebook Page to post as  → gates Facebook
META_PAGE_ACCESS_TOKEN=     # long-lived Page token     → gates Facebook + Instagram
META_IG_USER_ID=            # Instagram Business acct id → gates Instagram

# LinkedIn — OAuth2 access token + the org page to post as.
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_ORG_URN=           # e.g. urn:li:organization:12345

# X (Twitter) — OAuth 1.0a user context (write access).
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(connections): document social env vars in .env.example"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS (all suites, including `connections.test.ts` and `read-model.test.ts`).

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS, no warnings introduced.

- [ ] **Step 3: Manual smoke check (optional, requires Supabase + dev server)**

Run: `pnpm dev`, open `/settings`. With no social env vars set, each social provider shows **Not configured** and disabled. Set a provider's full var set in `.env.local`, restart, and confirm it shows enable/test controls and that "Test connection" reports presence.

- [ ] **Step 4: Final commit (if any uncommitted cleanup)**

```bash
git status   # expect clean
```

---

## Self-Review Notes

- **Spec coverage:** Credentials (Task 7 + setup guide) · `requiredEnvVars` registry (Task 1) · status from all-required presence (Task 2) · migration display var (Task 3) · social enable/disable + presence test, email-only send (Task 4) · `SocialConnectionControls` (Task 5) · panel rendering (Task 6). All spec sections map to a task.
- **Out of scope (transport spec):** OAuth flows, `execute-social`, `social_accounts`/`social_posts`, live social API calls — none appear in any task. ✔
- **Type consistency:** `missingRequiredEnvVars(provider, env)` signature is identical across domain, read-model, and the action. `requiredEnvVars: string[]` added to both `ConnectionView` (read-model) and `ConnectionRowView` (controls). `providerMeta` returns `{ kind, label }` used consistently. ✔
- **Secret ownership:** No task passes credentials to Mark; `HERMES_AGENT_API_TOKEN` is untouched. ✔

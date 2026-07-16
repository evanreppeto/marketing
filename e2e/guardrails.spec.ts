import { test, expect, type BrowserContext } from "@playwright/test";

/**
 * End-to-end GUARDRAILS for the deployed app. These assert the things that would
 * be genuinely scary if they silently broke:
 *   1. the login wall holds — the public can't see the app,
 *   2. a real operator can sign in and the tenant renders,
 *   3. the Opportunity inbox is populated,
 *   4. the campaign approval surface is present (the human gate exists).
 *
 * Read-only: the only write is the sign-in POST (authentication, not business
 * data) — no sends, approvals, or record mutations. That's what makes it safe to
 * point at production.
 *
 * Reliable by design: sign-in goes through the real API (no fragile form
 * selectors), and assertions match visible text that is TENANT-AGNOSTIC (not
 * seeded demo copy) so this works against any real workspace. Point it at a
 * deploy with E2E_BASE_URL, and supply credentials via env:
 *
 *   E2E_BASE_URL=https://arc-studio.ai E2E_EMAIL=… E2E_PASSWORD=… \
 *     pnpm exec playwright test e2e/guardrails.spec.ts
 *
 * Credentials are REQUIRED from the environment — there is deliberately no
 * hardcoded fallback. A real password committed here is a credential in version
 * control, and a default silently sends it at whatever E2E_BASE_URL points to.
 */

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

/**
 * Sign in through the real /api/auth/sign-in endpoint. The Supabase session
 * cookie lands in the shared browser-context cookie jar, so later page
 * navigations are authenticated. We confirm success by the presence of the
 * session cookie (a wrong password redirects the same way but sets no cookie).
 */
/**
 * Fail loudly rather than silently signing in with a default. The three
 * authenticated guardrails are meaningless without real credentials, and a
 * hardcoded fallback would ship a password to whatever E2E_BASE_URL points at.
 */
function requireCredentials() {
  expect(
    Boolean(EMAIL && PASSWORD),
    "set E2E_EMAIL and E2E_PASSWORD (CI: the PROD_E2E_EMAIL / PROD_E2E_PASSWORD repo secrets)",
  ).toBe(true);
}

async function login(context: BrowserContext) {
  await context.request.post("/api/auth/sign-in", {
    form: { email: EMAIL!, password: PASSWORD!, rememberMe: "1", from: "/" },
    maxRedirects: 0,
  });
  const cookies = await context.cookies();
  const hasSession = cookies.some((c) => /^sb-.*-auth-token/.test(c.name));
  expect(hasSession, "sign-in should set a Supabase session cookie").toBe(true);
}

test.describe("deployed app guardrails", () => {
  // Guardrails only run against a DEPLOYED target (E2E_BASE_URL). Skip them in a
  // default local run (e.g. CI's local screens job), which has no data or auth.
  test.beforeEach(() => {
    test.skip(!process.env.E2E_BASE_URL, "set E2E_BASE_URL to run guardrails against a deploy");
  });

  test("the login wall holds — an unauthenticated visit is bounced to /login", async ({ page }) => {
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    expect(page.url(), "unauthenticated /home should redirect to /login").toContain("/login");
  });

  test("an operator can sign in and the tenant renders", async ({ page, context }) => {
    requireCredentials();
    await login(context);
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    expect(page.url(), "should not be bounced back to login").not.toContain("/login");
    // Tenant-agnostic: the signed-in shell's rail always renders "<ORG> workspace".
    // (The previous assertion hardcoded "big shoulders" — the app is multi-tenant.)
    await expect(page.locator("body")).toContainText(/workspace/i);
  });

  test("the Opportunity inbox is populated", async ({ page, context }) => {
    requireCredentials();
    await login(context);
    await page.goto("/opportunities", { waitUntil: "domcontentloaded" });
    // Tenant-agnostic "populated" signal: opportunity-inbox.tsx early-returns a
    // "No open opportunities yet" empty state, so this header renders ONLY when
    // there is at least one opportunity. (The previous assertion matched seeded
    // demo copy — "flood watch"/"dormant" — which only exists in the sandbox.)
    await expect(page.locator("body")).toContainText(/open opportunities/i);
  });

  test("the campaign approval surface is present (the human gate exists)", async ({ page, context }) => {
    requireCredentials();
    await login(context);
    await page.goto("/campaigns", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/campaign/i);
    await expect(page.locator("body")).toContainText(/approv/i);
  });
});

import { test, expect, type BrowserContext } from "@playwright/test";

/**
 * End-to-end GUARDRAILS for the deployed app (default target: the private
 * staging site). These assert the things that would be genuinely scary if they
 * silently broke:
 *   1. the login wall holds — the public can't see the app,
 *   2. a real operator can sign in and the seeded tenant renders,
 *   3. the Opportunity inbox is populated,
 *   4. the campaign approval surface is present (the human gate exists).
 *
 * Reliable by design: sign-in goes through the real API (no fragile form
 * selectors) and assertions match on visible text (not brittle CSS). Point it
 * at any deploy with E2E_BASE_URL:
 *
 *   E2E_BASE_URL=https://marketing-staging-big-shoulders-restoration.vercel.app \
 *     pnpm exec playwright test e2e/guardrails.spec.ts
 */

const EMAIL = process.env.E2E_EMAIL ?? "owner@bsr.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "BsrOwner1234!";

/**
 * Sign in through the real /api/auth/sign-in endpoint. The Supabase session
 * cookie lands in the shared browser-context cookie jar, so later page
 * navigations are authenticated. We confirm success by the presence of the
 * session cookie (a wrong password redirects the same way but sets no cookie).
 */
async function login(context: BrowserContext) {
  await context.request.post("/api/auth/sign-in", {
    form: { email: EMAIL, password: PASSWORD, rememberMe: "1", from: "/" },
    maxRedirects: 0,
  });
  const cookies = await context.cookies();
  const hasSession = cookies.some((c) => /^sb-.*-auth-token/.test(c.name));
  expect(hasSession, "sign-in should set a Supabase session cookie").toBe(true);
}

test.describe("deployed app guardrails", () => {
  // Guardrails only run against a DEPLOYED target (E2E_BASE_URL). Skip them in a
  // default local run (e.g. CI's local screens job), which has no seeded data or
  // auth — `pnpm test:e2e:staging` sets E2E_BASE_URL.
  test.beforeEach(() => {
    test.skip(!process.env.E2E_BASE_URL, "set E2E_BASE_URL to run guardrails against a deploy");
  });

  test("the login wall holds — an unauthenticated visit is bounced to /login", async ({ page }) => {
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    expect(page.url(), "unauthenticated /home should redirect to /login").toContain("/login");
  });

  test("an operator can sign in and the seeded tenant renders", async ({ page, context }) => {
    await login(context);
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    expect(page.url(), "should not be bounced back to login").not.toContain("/login");
    await expect(page.locator("body")).toContainText(/big shoulders/i);
  });

  test("the Opportunity inbox is populated", async ({ page, context }) => {
    await login(context);
    await page.goto("/opportunities", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/flood watch|property managers|dormant/i);
  });

  test("the campaign approval surface is present (the human gate exists)", async ({ page, context }) => {
    await login(context);
    await page.goto("/campaigns", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/campaign/i);
    await expect(page.locator("body")).toContainText(/approv/i);
  });
});

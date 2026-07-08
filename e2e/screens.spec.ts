import { test, expect, type Page } from "@playwright/test";

// Noise we don't fail on: the external font CDN and favicon fetches don't affect
// the page's own behavior. Anything else — our own JS throwing, a bad asset
// path — is a real failure.
const IGNORE = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /favicon/i,
];
const ignored = (s: string) => IGNORE.some((re) => re.test(s));

/** Wire up console/page/network error capture before navigation. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ignored(msg.text())) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    if (!ignored(req.url())) {
      errors.push(`requestfailed: ${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "?"}`);
    }
  });
  return errors;
}

// The front door enters the real app (src/app/page.tsx redirects to /home).
// An authenticated session lands on the home screen ("waiting on you"); without
// one — as in CI, where there is no Supabase env — it redirects on to the
// sign-in screen. Either way root resolves cleanly into the app (the old static
// mockup gallery under public/build-*.html has been removed).
test("/ enters the real app", async ({ page }) => {
  const errors = watchForErrors(page);
  const resp = await page.goto("/", { waitUntil: "load" });
  expect(resp?.status(), "HTTP status for /").toBeLessThan(400);
  await expect(page.locator("body")).toContainText(/waiting on you|sign in/i);
  expect(errors, `/ had errors:\n${errors.join("\n")}`).toEqual([]);
});

import { test, expect, type Page } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// Auto-discover every static gallery screen so new screens are covered for free.
const screens = readdirSync(join(process.cwd(), "public"))
  .filter((f) => f.startsWith("build-") && f.endsWith(".html"))
  .sort();

// Noise we don't fail on for a static smoke test: the external font CDN and
// favicon fetches don't affect a screen's own behavior. Anything else — our own
// JS throwing, a missing gallery script, a bad asset path — is a real failure.
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

test.describe("gallery screens smoke", () => {
  for (const file of screens) {
    test(`${file} loads and renders cleanly`, async ({ page }) => {
      const errors = watchForErrors(page);

      const resp = await page.goto(`/${file}`, { waitUntil: "load" });
      expect(resp?.status(), `HTTP status for /${file}`).toBeLessThan(400);

      // Let deferred gallery scripts (nav/cmdk/panes) run — they'd throw here if broken.
      await page.waitForTimeout(500);

      // The screen rendered meaningful content (guards against a blank/error page).
      const bodyText = (await page.locator("body").innerText()).trim();
      expect(bodyText.length, `${file} should render visible text`).toBeGreaterThan(40);

      expect(errors, `${file} had errors:\n${errors.join("\n")}`).toEqual([]);
    });
  }
});

// The domain root rewrites to the home screen (next.config.ts beforeFiles).
test("/ rewrites to the home screen", async ({ page }) => {
  const errors = watchForErrors(page);
  const resp = await page.goto("/", { waitUntil: "load" });
  expect(resp?.status(), "HTTP status for /").toBeLessThan(400);
  await expect(page.locator("body")).toContainText(/waiting on you/i);
  expect(errors, `/ had errors:\n${errors.join("\n")}`).toEqual([]);
});

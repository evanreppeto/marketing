// Renders the shared brand shell with Supabase Go-template placeholders so the
// hosted auth templates (magic link / recovery / signup confirm) stay in sync
// with the repo. Run `pnpm email:export`, then paste each file into the matching
// Supabase dashboard editor (Authentication -> Email Templates).
//
// Placeholders ({{ .ConfirmationURL }}, {{ .SiteURL }}) contain no HTML-escapable
// characters, so they survive the renderer's escaping unchanged.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderBrandedEmail, type BrandEmailTheme } from "../src/domain/email-templates";

const APP_NAME = process.env.EMAIL_EXPORT_APP_NAME?.trim() || "Arc";
const LOGO_URL = process.env.EMAIL_EXPORT_LOGO_URL?.trim() || undefined;
const theme: BrandEmailTheme = { appName: APP_NAME, logoUrl: LOGO_URL, accentColor: "#0B0B0C" };

const templates: Record<string, { heading: string; bodyBlocks: string[]; cta: { label: string } }> = {
  "magic-link": {
    heading: `Sign in to ${APP_NAME}`,
    bodyBlocks: ["Use the button below to sign in. This link expires shortly and can only be used once."],
    cta: { label: "Sign in" },
  },
  recovery: {
    heading: "Reset your password",
    bodyBlocks: ["We received a request to reset your password. If that wasn't you, you can ignore this email."],
    cta: { label: "Reset password" },
  },
  "signup-confirm": {
    heading: `Confirm your email`,
    bodyBlocks: [`Confirm your address to finish creating your ${APP_NAME} account.`],
    cta: { label: "Confirm email" },
  },
};

const outDir = resolve(process.cwd(), "docs/email-templates");
mkdirSync(outDir, { recursive: true });

for (const [name, t] of Object.entries(templates)) {
  const { html } = renderBrandedEmail({
    heading: t.heading,
    bodyBlocks: t.bodyBlocks,
    cta: { label: t.cta.label, url: "{{ .ConfirmationURL }}" },
    theme,
    footerNote: `Sent by ${APP_NAME}. If you didn't expect this email, you can safely ignore it.`,
  });
  const file = resolve(outDir, `${name}.html`);
  writeFileSync(file, html, "utf8");
  console.log(`wrote ${file}`);
}

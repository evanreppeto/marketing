import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";

import { getCurrentOrgId } from "@/lib/auth/org";
import { getAppSettings } from "@/lib/settings/store";

import "./globals.css";

// Editorial serif (Fraunces) — the signature display face used for hero/auth
// headlines only. Wired to the --ff-serif / --ff-editorial token contract that
// globals.css @theme reads. Weights 400/500/600 only (never 700 — not loaded).
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--ff-serif",
  display: "swap",
});

// Product grotesk (Geist) — body, labels, metrics → --ff-body / --ff-display.
const geist = Geist({
  subsets: ["latin"],
  variable: "--ff-body",
  display: "swap",
});

// Mono (Geist Mono) — identifiers, scores, timestamps → --ff-mono.
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--ff-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arc — Marketing operations, with your approval",
  description:
    "Arc finds source-backed opportunities, drafts approval-gated campaigns, and prepares creative — and never sends without your sign-off.",
  // Browser-tab + bookmark/home-screen icon: the gold "A" mark on the brand's
  // dark ground. A full set (favicon.ico, PNG favicon, apple-touch-icon, web
  // manifest) so every surface is branded — not just the tab. The static gallery
  // pages carry the same <link>s directly in their <head>.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#15151a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Workspace-chosen theme, applied at the root so the signed-in app renders in
  // the saved accent/density/motion with no flash. Org is resolved best-effort:
  // pre-auth pages (no workspace) and env-less builds fall back to null → app
  // defaults (gold/comfortable/standard). The Appearance panel writes these keys
  // and revalidates the layout.
  const orgId = await getCurrentOrgId().catch(() => null);
  const { appearanceAccent, appearanceDensity, appearanceMotion } = await getAppSettings(orgId);
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${geist.variable} ${geistMono.variable}`}
      data-accent={appearanceAccent}
      data-density={appearanceDensity}
      data-motion={appearanceMotion}
      // --ff-editorial aliases the serif; --ff-display falls back to body in globals.
      style={{ ["--ff-editorial" as string]: "var(--ff-serif)" }}
    >
      <body>{children}</body>
    </html>
  );
}

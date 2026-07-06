import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${geist.variable} ${geistMono.variable}`}
      // --ff-editorial aliases the serif; --ff-display falls back to body in globals.
      style={{ ["--ff-editorial" as string]: "var(--ff-serif)" }}
    >
      <body>{children}</body>
    </html>
  );
}

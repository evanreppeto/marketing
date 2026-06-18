import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import { ConsoleFrame } from "./_components/console-frame";
import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";
import { resolveBrandIdentity } from "@/lib/brand-kit/identity";

// Geist — the modern product grotesk (Linear/Vercel-grade). One family carries
// display, headings, and body so the UI reads as a single, intentional system.
// `display` and `serif` variables are kept (pointed at Geist) so existing
// `font-display` / `font-serif` usages resolve without per-component edits.
const display = Geist({
  subsets: ["latin"],
  variable: "--ff-display",
  display: "swap",
});

const headline = Geist({
  subsets: ["latin"],
  variable: "--ff-serif",
  display: "swap",
});

const body = Geist({
  subsets: ["latin"],
  variable: "--ff-body",
  display: "swap",
});

// Geist Mono — technical face for identifiers, scores, timestamps, tabular metrics.
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--ff-mono",
  display: "swap",
});

const serif = headline;


export async function generateMetadata(): Promise<Metadata> {
  const { workspaceName, productLabel, brandFaviconUrl } = await getAppSettings();
  const identity = await resolveBrandIdentity();
  const resolvedName = identity.displayName ?? workspaceName;
  const resolvedFavicon = identity.faviconUrl ?? brandFaviconUrl;
  return {
    title: `${resolvedName} | ${productLabel}`,
    description: "AI-native CRM, persona intelligence, routing, and campaign operations.",
    icons: {
      icon: resolvedFavicon,
      apple: resolvedFavicon,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getAppSettings();
  const identity = await resolveBrandIdentity();

  return (
    <html
      lang="en"
      className={`h-full antialiased ${display.variable} ${serif.variable} ${body.variable} ${mono.variable}`}
      data-accent={settings.appearanceAccent}
      data-density={settings.appearanceDensity}
      data-motion={settings.appearanceMotion}
    >
      <body className="min-h-full flex flex-col">
        <ConsoleFrame
          agentName={getAgentDisplayName(settings.assistantName)}
          brand={{
            workspaceName: identity.displayName ?? settings.workspaceName,
            productLabel: settings.productLabel,
            shortName: identity.shortMark ?? settings.brandShortName,
            logoUrl: identity.logoUrl ?? settings.brandLogoUrl,
          }}
        >
          {children}
        </ConsoleFrame>
      </body>
    </html>
  );
}

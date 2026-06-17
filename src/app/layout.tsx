import type { Metadata } from "next";
import { Archivo, Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { ConsoleFrame } from "./_components/console-frame";
import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";
import { getBusinessProfile } from "@/lib/brand-kit/persistence";
import { getCurrentOrgId } from "@/lib/auth/org";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

// Display: an engineered grotesk — confident, gridded, mechanical. Drives headings and key numbers.
const display = Archivo({
  subsets: ["latin"],
  variable: "--ff-display",
  display: "swap",
});

// Serif display: editorial voice for Arc and page headlines.
const serif = Fraunces({
  subsets: ["latin"],
  variable: "--ff-serif",
  display: "swap",
  weight: ["400", "500", "600"],
});

// Body: a warm, highly legible humanist grotesk for dense operator copy.
const body = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--ff-body",
  display: "swap",
});

// Mono: technical face for identifiers, scores, timestamps, and tabular metrics.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--ff-mono",
  display: "swap",
});

/** Resolve per-org brand identity, falling back gracefully when Supabase is down or unconfigured. */
async function resolveBrandIdentity(): Promise<{
  displayName?: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  shortMark?: string | null;
}> {
  if (!isSupabaseAdminConfigured()) return {};
  try {
    const profile = await getBusinessProfile(await getCurrentOrgId());
    if (!profile) return {};
    return {
      displayName: profile.displayName || undefined,
      logoUrl: profile.logoUrl,
      faviconUrl: profile.faviconUrl,
      shortMark: profile.shortMark,
    };
  } catch {
    // Supabase down / no org — fall back to app_settings values.
    return {};
  }
}

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

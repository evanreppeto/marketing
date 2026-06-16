import type { Metadata } from "next";
import { Archivo, Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { ConsoleFrame } from "./_components/console-frame";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAgentDisplayName } from "@/lib/mark-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";

// Display: an engineered grotesk — confident, gridded, mechanical. Drives headings and key numbers.
const display = Archivo({
  subsets: ["latin"],
  variable: "--ff-display",
  display: "swap",
});

// Serif display: editorial voice for Mark and page headlines.
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

export async function generateMetadata(): Promise<Metadata> {
  const { workspaceName, productLabel, brandFaviconUrl } = await getAppSettings();
  return {
    title: `${workspaceName} | ${productLabel}`,
    description: "AI-native CRM, persona intelligence, routing, and campaign operations.",
    icons: {
      icon: brandFaviconUrl,
      apple: brandFaviconUrl,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getAppSettings();

  return (
    <html
      lang="en"
      className={`h-full antialiased ${display.variable} ${serif.variable} ${body.variable} ${mono.variable}`}
      data-accent={settings.appearanceAccent}
      data-density={settings.appearanceDensity}
      data-motion={settings.appearanceMotion}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <ConsoleFrame
            agentName={getAgentDisplayName(settings.assistantName)}
            brand={{
              workspaceName: settings.workspaceName,
              productLabel: settings.productLabel,
              shortName: settings.brandShortName,
              logoUrl: settings.brandLogoUrl,
            }}
          >
            {children}
          </ConsoleFrame>
        </TooltipProvider>
      </body>
    </html>
  );
}

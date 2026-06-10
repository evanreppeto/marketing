import type { Metadata } from "next";
import { Archivo, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { ConsoleFrame } from "./_components/console-frame";
import { isOperatorGateEnabled } from "@/lib/auth/operator";
import { getAppSettings } from "@/lib/settings/store";

// Display: an engineered grotesk — confident, gridded, mechanical. Drives headings and key numbers.
const display = Archivo({
  subsets: ["latin"],
  variable: "--ff-display",
  display: "swap",
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
  const { workspaceName } = await getAppSettings();
  return {
    title: `${workspaceName} | Signal`,
    description: "AI-native CRM, persona intelligence, routing, and campaign operations for Big Shoulders Restoration.",
    icons: {
      icon: "/icon.svg",
      apple: "/brand/signal-mark-original.png",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <ConsoleFrame gateEnabled={isOperatorGateEnabled()}>{children}</ConsoleFrame>
      </body>
    </html>
  );
}

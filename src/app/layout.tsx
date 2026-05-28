import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal | Big Shoulders",
  description: "AI-native CRM, persona intelligence, routing, and campaign operations for Big Shoulders Restoration.",
  icons: {
    icon: "/brand/signal-mark-transparent.png",
    apple: "/brand/signal-mark-original.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

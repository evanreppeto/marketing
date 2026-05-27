import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Big Shoulders Growth Engine",
  description: "Typed CRM foundation and lead routing cockpit for Big Shoulders Restoration.",
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

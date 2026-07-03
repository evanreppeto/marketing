import type { Metadata } from "next";

import "./globals.css";

// The operator UI is the static Arc mockup gallery served from `public/` (see
// next.config.ts's `/`→build-home rewrite). The React app is now backend-only —
// API routes + auth callbacks — so this root layout is a minimal valid shell.
// There are no React operator pages to wrap.
export const metadata: Metadata = {
  title: "Arc",
  description: "Arc — marketing operations control plane (API surface).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

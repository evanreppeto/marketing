import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Enables React's View Transitions integration so route navigations animate.
  // Used for a restrained content crossfade between screens (see the
  // ::view-transition rules in arc-app.css); the rail/top bar stay anchored.
  experimental: {
    viewTransition: true,
  },
  // Move the dev-only on-screen indicator off the left rail (its default
  // 'bottom-left' overlaps the sidebar's operator avatar). Set to `false` to hide.
  devIndicators: {
    position: "bottom-right",
  },
  async redirects() {
    return [
      { source: "/persona-intelligence", destination: "/personas", permanent: true },
      { source: "/persona-intelligence/:personaKey", destination: "/personas/:personaKey", permanent: true },
    ];
  },
  // Front door flipped to the real app: the root `/` is no longer rewritten to
  // the static mockup gallery — it resolves to src/app/page.tsx, which sends
  // callers into the app (/home). The mockup files remain in public/ but nothing
  // links to them anymore.
};

export default nextConfig;

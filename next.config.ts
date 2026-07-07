import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Cache each dynamic page segment in the client router cache for 30s (the
    // default is 0 = off). Re-opening a page you already visited this session
    // then swaps in instantly with no server round-trip. Mutations still call
    // revalidatePath, which evicts the affected route, so this only ever serves
    // <=30s-stale reads on revisit — fine for these dashboards.
    staleTimes: { dynamic: 30 },
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

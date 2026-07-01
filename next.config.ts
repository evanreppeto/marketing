import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
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
  async rewrites() {
    return {
      // `beforeFiles` runs ahead of the filesystem routes, so this shadows the
      // real root page and serves the static Arc mockup gallery at the domain
      // root. The gallery's own links are absolute (`/build-*.html`), so every
      // other screen is reached as a plain static asset from `public/`.
      beforeFiles: [{ source: "/", destination: "/build-home.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;

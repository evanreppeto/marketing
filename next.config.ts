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
};

export default nextConfig;

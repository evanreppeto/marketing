import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Move the dev-only on-screen indicator off the left rail (its default
  // 'bottom-left' overlaps the sidebar's operator avatar). Set to `false` to hide.
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;

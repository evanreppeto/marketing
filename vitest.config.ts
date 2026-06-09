import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // mark-runner/ is a standalone service with its own node:test suite.
    exclude: [...configDefaults.exclude, "mark-runner/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

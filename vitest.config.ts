import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // arc-runner/ is a standalone service with its own node:test suite.
    exclude: [...configDefaults.exclude, "arc-runner/**", ".worktrees/**", ".claude/worktrees/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

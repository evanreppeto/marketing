import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Arc runner is a standalone service with its own dependency stack.
    exclude: [...configDefaults.exclude, "apps/arc-runner/**", "arc-runner/**", "mark-runner/**", ".worktrees/**", ".claude/worktrees/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/migrate.ts"],
    },
  },
  resolve: {
    alias: {
      "@ai-dashboard/shared": new URL("../../packages/shared/src/index.ts", import.meta.url).pathname,
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.mjs"],
  },
  resolve: {
    alias: {
      "@ai-dashboard/shared": new URL("../../packages/shared/src/index.ts", import.meta.url).pathname,
    },
  },
});

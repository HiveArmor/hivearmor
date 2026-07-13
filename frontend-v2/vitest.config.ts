import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  css: false,
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["src/**/__tests__/agent.service.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});

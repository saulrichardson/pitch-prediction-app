import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "scripts/**/*.test.ts",
      "infra/**/*.test.ts",
    ],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});

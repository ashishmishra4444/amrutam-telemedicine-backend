import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    fileParallelism: false,
    maxWorkers: 1,
    env: {
      NODE_ENV: "test",
    },
  },
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  webServer: {
    command: "test -n \"$MODEL_BASE_URL\" || (echo 'MODEL_BASE_URL is required for e2e tests because mock predictions are disabled.' && exit 1); npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      MODEL_BASE_URL: process.env.MODEL_BASE_URL ?? "",
      MODEL_API_KEY: process.env.MODEL_API_KEY ?? "",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "local-e2e-session-secret"
    }
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { ...devices["iPad Pro 11"] } }
  ]
});

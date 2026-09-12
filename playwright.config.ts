import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  webServer: {
    command:
      "npm run fixture:replay && npm --workspace @pitch/web run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/ready",
    reuseExistingServer: false,
    env: {
      STORAGE_MODE: "memory",
      REPLAY_EDITION_PATH: path.resolve(".cache/test-edition.json"),
      SESSION_SECRET: "local-e2e-session-secret",
    },
  },
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "phone",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});

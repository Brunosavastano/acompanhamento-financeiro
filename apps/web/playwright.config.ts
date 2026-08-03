import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_SKIP_WEBSERVER === "true"
    ? undefined
    : {
        command: "npm run dev:local --prefix ../..",
        url: `${baseURL}/api/health`,
        reuseExistingServer: true,
        // Primeira subida faz initdb do Postgres embutido + migrações + seed + boot do Next.
        timeout: 300_000,
      },
});

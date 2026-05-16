import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E para smoke das páginas críticas após troca de gerente.
 *
 * Como rodar:
 *   1. Crie usuários de teste no Supabase com perfis distintos.
 *   2. Defina as variáveis no .env.e2e (ou no env do CI):
 *        E2E_BASE_URL=http://localhost:8080
 *        E2E_SUPERADMIN_EMAIL=... / _PASSWORD=...
 *        E2E_OWNER_EMAIL=...      / _PASSWORD=...
 *        E2E_TEAM_EMAIL=...       / _PASSWORD=...
 *        E2E_CLIENT_A_NAME=...   (nome exato do cliente no switcher)
 *        E2E_CLIENT_B_NAME=...
 *   3. bun run test:e2e
 *
 * Testes que não tiverem as credenciais necessárias são marcados como skip
 * para não quebrar o CI quando o setup ainda não está completo.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // evitar corridas em troca de gerente compartilhada
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"], ["list"]]
    : [["html", { open: "never" }], ["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bun run dev",
        url: "http://localhost:8080",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

/**
 * Smoke: Super Admin troca entre dois gerentes e verifica que cada página
 * crítica renderiza conteúdo correto do gerente ativo (sem tela em branco,
 * sem erro, sem dados do gerente anterior).
 */
import { test, expect } from "@playwright/test";
import {
  CRITICAL_PAGES,
  expectPageRendersForProfile,
  getCreds,
  storageStatePath,
  switchManager,
} from "./utils/auth";

const clientA = process.env.E2E_CLIENT_A_NAME;
const clientB = process.env.E2E_CLIENT_B_NAME;

test.describe("Super Admin: troca de gerente + páginas críticas", () => {
  test.skip(
    !getCreds("superadmin") || !clientA || !clientB,
    "Defina E2E_SUPERADMIN_EMAIL/_PASSWORD e E2E_CLIENT_A_NAME / E2E_CLIENT_B_NAME para rodar.",
  );

  test.use({ storageState: storageStatePath("superadmin")! });

  test(`renderiza todas as páginas críticas como ${clientA}`, async ({ page }) => {
    await page.goto("/dashboard");
    await switchManager(page, clientA!);

    for (const { path, ready } of CRITICAL_PAGES) {
      await test.step(`página ${path}`, async () => {
        await expectPageRendersForProfile(page, path, ready);
      });
    }
  });

  test(`troca para ${clientB} e revalida páginas críticas`, async ({ page }) => {
    await page.goto("/dashboard");
    await switchManager(page, clientA!);
    await expectPageRendersForProfile(page, "/dashboard", /Dashboard|KPI/i);

    await switchManager(page, clientB!);

    for (const { path, ready } of CRITICAL_PAGES) {
      await test.step(`página ${path} após troca`, async () => {
        await expectPageRendersForProfile(page, path, ready);
      });
    }
  });

  test("voltar para Super Admin mostra o gate 'Selecione um gerente'", async ({ page }) => {
    await page.goto("/dashboard");
    await switchManager(page, clientA!);
    await switchManager(page, null);
    await page.goto("/pessoas");
    await expect(page.getByText(/Selecione um gerente/i)).toBeVisible();
  });
});

/**
 * Smoke por perfil: Owner e Team Member não veem o switcher, mas as páginas
 * críticas devem renderizar conteúdo do cliente vinculado (sem gate, sem
 * "sem vínculo ativo", sem erro).
 */
import { test, expect } from "@playwright/test";
import {
  CRITICAL_PAGES,
  expectPageRendersForProfile,
  getCreds,
  storageStatePath,
} from "./utils/auth";

for (const profile of ["owner", "team"] as const) {
  test.describe(`Perfil ${profile}: páginas críticas`, () => {
    test.skip(
      !getCreds(profile),
      `Defina E2E_${profile.toUpperCase()}_EMAIL/_PASSWORD para rodar.`,
    );

    test.use({ storageState: storageStatePath(profile)! });

    test("switcher de gerente NÃO aparece", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page.getByTitle(/Trocar de gerente/i)).toHaveCount(0);
    });

    test("todas as páginas críticas renderizam conteúdo", async ({ page }) => {
      for (const { path, ready } of CRITICAL_PAGES) {
        await test.step(`página ${path}`, async () => {
          await expectPageRendersForProfile(page, path, ready);
        });
      }
    });
  });
}

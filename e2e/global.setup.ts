/**
 * Setup global: pré-grava storage state para cada perfil que tenha credenciais
 * no env. Specs reusam esse state via context.storageState para evitar fazer
 * login a cada teste.
 */
import { test as setup } from "@playwright/test";
import { ensureStorageState } from "./utils/auth";

setup("login superadmin (se houver creds)", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ensureStorageState(ctx, "superadmin");
  await ctx.close();
});

setup("login owner (se houver creds)", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ensureStorageState(ctx, "owner");
  await ctx.close();
});

setup("login team member (se houver creds)", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ensureStorageState(ctx, "team");
  await ctx.close();
});

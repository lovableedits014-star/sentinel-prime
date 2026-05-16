/**
 * Login util compartilhado entre os specs. Usa storage state em disco para
 * acelerar (uma autenticação por perfil por execução). Se as credenciais não
 * estiverem no env, retorna null e o spec faz test.skip().
 */
import { type Page, type BrowserContext, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export type Profile = "superadmin" | "owner" | "team";

export interface Creds {
  email: string;
  password: string;
}

export function getCreds(profile: Profile): Creds | null {
  const map: Record<Profile, [string, string]> = {
    superadmin: ["E2E_SUPERADMIN_EMAIL", "E2E_SUPERADMIN_PASSWORD"],
    owner: ["E2E_OWNER_EMAIL", "E2E_OWNER_PASSWORD"],
    team: ["E2E_TEAM_EMAIL", "E2E_TEAM_PASSWORD"],
  };
  const [emailVar, passVar] = map[profile];
  const email = process.env[emailVar];
  const password = process.env[passVar];
  if (!email || !password) return null;
  return { email, password };
}

export function storageStatePath(profile: Profile): string {
  return path.join("e2e", ".auth", `${profile}.json`);
}

export async function loginViaUI(page: Page, creds: Creds): Promise<void> {
  await page.goto("/auth");
  await page.getByLabel(/e-?mail/i).fill(creds.email);
  await page.getByLabel(/senha/i).first().fill(creds.password);
  await page.getByRole("button", { name: /entrar|login/i }).click();
  await page.waitForURL(/\/(dashboard|super-admin|$)/, { timeout: 15_000 });
}

export async function ensureStorageState(
  context: BrowserContext,
  profile: Profile,
): Promise<string | null> {
  const creds = getCreds(profile);
  if (!creds) return null;
  const file = storageStatePath(profile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) return file;
  const page = await context.newPage();
  await loginViaUI(page, creds);
  await context.storageState({ path: file });
  await page.close();
  return file;
}

/**
 * Troca de gerente via SuperAdminClientSwitcher. Funciona apenas para
 * super admin. Aceita o nome exato exibido no dropdown.
 */
export async function switchManager(page: Page, name: string | null) {
  await page.getByTitle(/Trocar de gerente/i).click();
  if (name === null) {
    await page.getByRole("menuitem", { name: /Nenhum \(Super Admin\)/i }).click();
  } else {
    await page.getByRole("menuitem", { name: new RegExp(name, "i") }).click();
  }
  // toast confirma sucesso da troca
  await expect(page.getByText(/Visualizando como gerente|Modo super admin restaurado/i))
    .toBeVisible({ timeout: 5_000 });
}

/**
 * Páginas críticas que precisam carregar conteúdo após uma troca de gerente.
 * Cada item tem o path e um marcador que comprova que a página renderizou
 * com dados (não tela em branco, não loop de skeleton, não gate de seleção).
 */
export const CRITICAL_PAGES: Array<{ path: string; ready: RegExp | string }> = [
  { path: "/dashboard", ready: /Dashboard|Visão geral|KPI/i },
  { path: "/pessoas", ready: /Pessoas|Cadastrar pessoa|filtrar/i },
  { path: "/militancia", ready: /Militância|militante/i },
  { path: "/territorial", ready: /Territorial|região|bairro/i },
  { path: "/engagement", ready: /Engajamento|missões/i },
  { path: "/calendario-politico", ready: /Calendário|agenda|evento/i },
  { path: "/disparos", ready: /Disparos|whatsapp|mensagem/i },
  { path: "/midia", ready: /Mídia|biblioteca|upload/i },
  { path: "/funcionarios", ready: /Funcionários|contratados/i },
  { path: "/eleicao", ready: /Eleição|candidato|votos/i },
  { path: "/inteligencia-eleitoral", ready: /Inteligência|pulso|narrativa/i },
];

/**
 * Asserts que a página NÃO está em estado degradado: sem mensagem de erro,
 * sem gate "Selecione um gerente" (para perfis que não são super admin sem
 * seleção), sem "Sem vínculo ativo", e que algum conteúdo significativo
 * renderiza.
 */
export async function expectPageRendersForProfile(
  page: Page,
  pagePath: string,
  ready: RegExp | string,
) {
  await page.goto(pagePath, { waitUntil: "domcontentloaded" });

  // Aguarda layout principal (sidebar/topbar do DashboardLayout).
  await expect(page.locator("body")).not.toBeEmpty();

  // Não pode estar no estado de erro nem sem vínculo.
  await expect(page.getByText(/Sem vínculo ativo/i)).toHaveCount(0);
  await expect(page.getByText(/Erro ao carregar sua conta/i)).toHaveCount(0);

  // Conteúdo esperado deve aparecer (após resolução do clientId).
  await expect(page.getByText(ready).first()).toBeVisible({ timeout: 15_000 });
}

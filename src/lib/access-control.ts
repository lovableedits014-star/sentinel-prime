// ─── Access Control Module ───
// Two coexisting models:
//  1) Legacy fixed profiles (admin, gestor_social, gestor_campanha, operacional) → still used by team_members
//  2) NEW: per-tab granular permissions stored in platform_users.allowed_paths

export type AccessProfile = 'admin' | 'gestor_social' | 'gestor_campanha' | 'operacional';

export const ACCESS_PROFILES: Record<AccessProfile, { label: string; description: string; allowedPaths: string[] }> = {
  admin: {
    label: 'Administrador',
    description: 'Acesso total a todos os módulos',
    allowedPaths: ['*'],
  },
  gestor_social: {
    label: 'Gestor de Redes Sociais',
    description: 'Comentários, Apoiadores e Engajamento',
    allowedPaths: ['/dashboard', '/comments', '/militancia', '/supporters', '/engagement', '/inteligencia-conteudo'],
  },
  gestor_campanha: {
    label: 'Gestor de Campanha',
    description: 'Apoiadores, Presenças, Territorial',
    allowedPaths: ['/dashboard', '/supporters', '/checkins', '/territorial', '/pessoas', '/campanha', '/calendario-politico'],
  },
  operacional: {
    label: 'Operacional',
    description: 'Presenças/Disparos e Territorial',
    allowedPaths: ['/dashboard', '/checkins', '/territorial', '/calendario-politico'],
  },
};

// ─── Catálogo único de abas (fonte da verdade para o menu E para o painel de permissões) ───
export type AppTab = { section: string; label: string; path: string };

export const ALL_APP_TABS: AppTab[] = [
  // Redes Sociais
  { section: 'Redes Sociais', label: 'Comentários', path: '/comments' },
  { section: 'Redes Sociais', label: 'Militância Digital', path: '/militancia' },
  { section: 'Redes Sociais', label: 'Engajamento', path: '/engagement' },
  { section: 'Redes Sociais', label: 'Inteligência de Conteúdo', path: '/inteligencia-conteudo' },
  // Base Política
  { section: 'Base Política', label: 'Pessoas', path: '/pessoas' },
  // Mobilização
  { section: 'Mobilização', label: 'Funcionários', path: '/funcionarios' },
  { section: 'Mobilização', label: 'Controle de Presença', path: '/presenca' },
  { section: 'Mobilização', label: 'Calendário Político', path: '/calendario-politico' },
  { section: 'Mobilização', label: 'Telemarketing', path: '/telemarketing-admin' },
  // Operacional
  { section: 'Operacional', label: 'Central WhatsApp', path: '/whatsapp' },
  { section: 'Operacional', label: 'Eleição', path: '/eleicao' },
  { section: 'Operacional', label: 'Territorial', path: '/territorial' },
  { section: 'Operacional', label: 'Inteligência Eleitoral', path: '/inteligencia-eleitoral' },
  { section: 'Operacional', label: 'Mídia', path: '/midia' },
  { section: 'Operacional', label: 'Tráfego Pago', path: '/trafego-pago' },
  // Sistema
  { section: 'Sistema', label: 'Configurações', path: '/settings' },
];

// /dashboard é sempre liberado (página inicial pós-login).
export const ALWAYS_ALLOWED_PATHS = ['/dashboard'];

export const SECTION_ORDER = ['Redes Sociais', 'Base Política', 'Mobilização', 'Operacional', 'Sistema'];

export function tabsBySection(): Record<string, AppTab[]> {
  const out: Record<string, AppTab[]> = {};
  for (const s of SECTION_ORDER) out[s] = [];
  for (const t of ALL_APP_TABS) {
    out[t.section] = out[t.section] || [];
    out[t.section].push(t);
  }
  return out;
}

/**
 * Parse a role string that may contain multiple roles separated by comma.
 */
export function parseRoles(roleStr: string): AccessProfile[] {
  return roleStr.split(',').map(r => r.trim()).filter(Boolean) as AccessProfile[];
}

export function getAllowedPaths(roles: AccessProfile[]): string[] {
  const paths = new Set<string>();
  for (const role of roles) {
    const config = ACCESS_PROFILES[role];
    if (!config) continue;
    if (config.allowedPaths.includes('*')) return ['*'];
    config.allowedPaths.forEach(p => paths.add(p));
  }
  return Array.from(paths);
}

export function isPathAllowed(roleStr: AccessProfile | string | null, path: string): boolean {
  if (!roleStr) return true;
  const roles = parseRoles(roleStr);
  const allowed = getAllowedPaths(roles);
  if (allowed.includes('*')) return true;
  return allowed.includes(path);
}

export function getDefaultRedirect(roleStr: string): string {
  const roles = parseRoles(roleStr);
  const allowed = getAllowedPaths(roles);
  if (allowed.includes('*')) return '/dashboard';
  return allowed[0] || '/dashboard';
}

export function getRoleLabels(roleStr: string): string[] {
  return parseRoles(roleStr)
    .map(r => ACCESS_PROFILES[r]?.label)
    .filter(Boolean) as string[];
}

// ─── Access Control Module ───
// Defines fixed access profiles and module mappings

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

/**
 * Parse a role string that may contain multiple roles separated by comma.
 * e.g. "gestor_social,operacional" → ['gestor_social', 'operacional']
 */
export function parseRoles(roleStr: string): AccessProfile[] {
  return roleStr.split(',').map(r => r.trim()).filter(Boolean) as AccessProfile[];
}

/**
 * Get all allowed paths for a set of roles (union of all).
 */
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

/**
 * Check if a path is allowed for a role string (supports multi-role).
 */
export function isPathAllowed(roleStr: AccessProfile | string | null, path: string): boolean {
  if (!roleStr) return true; // client owner = full access
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

/**
 * Get human-readable labels for a role string.
 */
export function getRoleLabels(roleStr: string): string[] {
  return parseRoles(roleStr)
    .map(r => ACCESS_PROFILES[r]?.label)
    .filter(Boolean) as string[];
}

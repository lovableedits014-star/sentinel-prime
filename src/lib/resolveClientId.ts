import { supabase } from "@/integrations/supabase/client-selfhosted";

export const IMPERSONATE_CLIENT_KEY = "lovable.super_admin.impersonate_client_id";

export function getImpersonatedClientId(): string | null {
  try { return localStorage.getItem(IMPERSONATE_CLIENT_KEY); } catch { return null; }
}

export function setImpersonatedClientId(id: string | null) {
  try {
    if (id) localStorage.setItem(IMPERSONATE_CLIENT_KEY, id);
    else localStorage.removeItem(IMPERSONATE_CLIENT_KEY);
  } catch {}
}

/**
 * Resolves the active client_id for the currently authenticated user.
 * Super admin: respects an impersonated client_id stored in localStorage.
 * Otherwise: owner in `clients` -> active row in `team_members`.
 */
export async function resolveClientId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // If super admin and an impersonated client is selected, use it.
  try {
    const { data: isAdmin } = await supabase.rpc("is_super_admin");
    if (isAdmin === true) {
      const impersonated = getImpersonatedClientId();
      if (impersonated) {
        const { data: exists } = await supabase
          .from("clients").select("id").eq("id", impersonated).maybeSingle();
        if (exists) return impersonated;
      }
    }
  } catch {}

  const { data: owned } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);
  if (owned && owned.length > 0) return owned[0].id as string;

  const { data: tm } = await supabase
    .from("team_members")
    .select("client_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return (tm?.client_id as string | undefined) ?? null;
}

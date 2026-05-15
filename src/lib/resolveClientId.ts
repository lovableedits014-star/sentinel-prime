import { supabase } from "@/integrations/supabase/client-selfhosted";

/**
 * Resolves the active client_id for the currently authenticated user.
 * Order: owner in `clients` -> active row in `team_members`.
 * Returns null when neither is found.
 */
export async function resolveClientId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

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

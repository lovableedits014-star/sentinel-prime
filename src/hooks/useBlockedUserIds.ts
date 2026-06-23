import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BlockedUserKey {
  platform: string;
  platform_user_id: string;
  blocked_at: string;
}

/**
 * Retorna um Set chaveado por `${platform}:${platform_user_id}` dos usuários
 * já bloqueados para o client. Usado para sinalizar perfis bloqueados nas
 * listas de militantes e no ranking de negativos.
 */
export function useBlockedUserIds(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ["blocked-users-ids", clientId],
    queryFn: async () => {
      const set = new Set<string>();
      if (!clientId) return set;
      const { data, error } = await (supabase as any)
        .from("blocked_users")
        .select("platform, platform_user_id, blocked_at")
        .eq("client_id", clientId);
      if (error) {
        console.warn("[useBlockedUserIds] error:", error.message);
        return set;
      }
      for (const row of (data ?? []) as BlockedUserKey[]) {
        set.add(`${row.platform}:${row.platform_user_id}`);
      }
      return set;
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: true,
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MilitantRow {
  id: string;
  client_id: string;
  platform: string;
  platform_user_id: string;
  author_name: string | null;
  avatar_url: string | null;
  first_seen_at: string;
  last_seen_at: string;
  total_comments: number;
  total_positive: number;
  total_negative: number;
  total_neutral: number;
  total_30d_positive: number;
  total_30d_negative: number;
  current_badge: string | null;
  promoted_to_supporter_id: string | null;
  notes: string | null;
}

export type MilitantBadgeMap = Map<string, MilitantRow>;

/**
 * Loads all militants for a client and returns a Map keyed by `${platform}:${platform_user_id}`
 * for fast lookup from comment items.
 */
export function useMilitantsMap(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ["militants-map", clientId],
    queryFn: async () => {
      const map: MilitantBadgeMap = new Map();
      if (!clientId) return map;
      const { data, error } = await (supabase as any)
        .from("social_militants")
        .select("*")
        .eq("client_id", clientId);
      if (error) {
        console.warn("[useMilitantsMap] erro:", error.message);
        return map;
      }
      for (const m of (data ?? []) as MilitantRow[]) {
        map.set(`${m.platform}:${m.platform_user_id}`, m);
      }
      return map;
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });
}
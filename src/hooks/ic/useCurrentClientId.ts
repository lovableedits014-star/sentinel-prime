import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";

export function useCurrentClientId() {
  return useQuery({
    queryKey: ["current-client-id"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: ownedClient } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (ownedClient?.id) return ownedClient.id as string;

      const { data: teamClient } = await supabase
        .from("team_members")
        .select("client_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      return (teamClient?.client_id as string) || null;
    },
    staleTime: Infinity,
  });
}
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";

export function useCurrentClientId() {
  return useQuery({
    queryKey: ["current-client-id"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      return data?.id ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

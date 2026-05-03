import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";

export function useIdeias(clientId: string | null | undefined, status?: string) {
  return useQuery({
    queryKey: ["ic-ideias", clientId, status ?? "all"],
    enabled: !!clientId,
    queryFn: async () => {
      let q = supabase
        .from("content_ideas")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateIdeaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("content_ideas")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ic-ideias"] }),
  });
}

export function useCreateIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (idea: {
      client_id: string;
      titulo: string;
      descricao?: string;
      tema?: string;
      tipo?: string;
      origem?: string;
      score?: number;
    }) => {
      const { data, error } = await supabase
        .from("content_ideas")
        .insert(idea)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ic-ideias"] }),
  });
}

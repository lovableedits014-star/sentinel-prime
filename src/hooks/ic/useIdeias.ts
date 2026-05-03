import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";

export interface ContentIdea {
  id: string;
  client_id: string;
  titulo: string;
  descricao: string | null;
  tema: string | null;
  tipo: string | null;
  origem: string | null;
  score: number;
  status: string;
  source_refs: any;
  generated_text: any;
  projection: any;
  user_feedback: string | null;
  created_at: string;
  updated_at: string;
}

export function useIdeias(clientId: string | null | undefined, status?: string) {
  return useQuery({
    queryKey: ["ic-ideas", clientId, status ?? "all"],
    queryFn: async () => {
      if (!clientId) return [] as ContentIdea[];
      let q = (supabase as any)
        .from("content_ideas")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) {
        console.warn("[useIdeias]", error.message);
        return [];
      }
      return (data ?? []) as ContentIdea[];
    },
    enabled: !!clientId,
    staleTime: Infinity,
  });
}

export function usePendingIdeasCount(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ["ic-ideas-pending-count", clientId],
    queryFn: async () => {
      if (!clientId) return 0;
      const { count } = await (supabase as any)
        .from("content_ideas")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("status", "pendente");
      return count ?? 0;
    },
    enabled: !!clientId,
    staleTime: 1000 * 60,
  });
}

export function useUpdateIdeaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, feedback }: { id: string; status: string; feedback?: string }) => {
      const { error } = await (supabase as any)
        .from("content_ideas")
        .update({ status, user_feedback: feedback ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ic-ideas"] });
      qc.invalidateQueries({ queryKey: ["ic-ideas-pending-count"] });
    },
  });
}

export function useCreateIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (idea: Partial<ContentIdea> & { client_id: string; titulo: string }) => {
      const { data, error } = await (supabase as any)
        .from("content_ideas")
        .insert(idea)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ic-ideas"] });
      qc.invalidateQueries({ queryKey: ["ic-ideas-pending-count"] });
    },
  });
}
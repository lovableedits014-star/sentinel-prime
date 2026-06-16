import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CandidatoParceiro {
  id: string;
  client_id: string;
  nome: string;
  cargo: string;
  partido: string | null;
  numero_urna: string | null;
  foto_url: string | null;
  cor: string;
  ordem: number;
  ativo: boolean;
}

export function useCandidatosParceiros(clientId: string | undefined) {
  const qc = useQueryClient();
  const key = ["eleicao-candidatos-parceiros", clientId];

  const query = useQuery({
    queryKey: key,
    enabled: !!clientId,
    queryFn: async (): Promise<CandidatoParceiro[]> => {
      const { data, error } = await supabase
        .from("eleicao_candidatos_parceiros" as any)
        .select("*")
        .eq("client_id", clientId!)
        .order("ordem", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data as any) || [];
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: Partial<CandidatoParceiro> & { id?: string }) => {
      if (!clientId) throw new Error("Cliente não identificado");
      if (!input.nome?.trim()) throw new Error("Informe o nome do candidato");
      const payload: any = {
        client_id: clientId,
        nome: input.nome.trim(),
        cargo: input.cargo?.trim() || "Deputado Federal",
        partido: input.partido?.trim() || null,
        numero_urna: input.numero_urna?.trim() || null,
        foto_url: input.foto_url?.trim() || null,
        cor: input.cor || "#3b82f6",
        ativo: input.ativo ?? true,
      };
      const q = input.id
        ? supabase.from("eleicao_candidatos_parceiros" as any).update(payload).eq("id", input.id)
        : supabase.from("eleicao_candidatos_parceiros" as any).insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Candidato parceiro salvo!");
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao salvar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("eleicao_candidatos_parceiros" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Candidato removido.");
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao remover"),
  });

  return {
    parceiros: query.data || [],
    parceirosAtivos: (query.data || []).filter((p) => p.ativo),
    isLoading: query.isLoading,
    save: upsert.mutateAsync,
    isSaving: upsert.isPending,
    remove: remove.mutateAsync,
    isRemoving: remove.isPending,
  };
}

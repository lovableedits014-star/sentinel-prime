import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RegiaoEleicao {
  id: string;
  client_id: string;
  value: string;
  label: string;
  ordem: number;
  ativo: boolean;
  tag: string | null;
}

export function normalizeTag(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function useRegioesEleicao(clientId: string | undefined) {
  const qc = useQueryClient();
  const key = ["eleicao-regioes", clientId];

  const query = useQuery({
    queryKey: key,
    enabled: !!clientId,
    queryFn: async (): Promise<RegiaoEleicao[]> => {
      const { data, error } = await supabase
        .from("eleicao_regioes" as any)
        .select("*")
        .eq("client_id", clientId!)
        .eq("ativo", true)
        .order("ordem", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data as any) || [];
    },
  });

  const add = useMutation({
    mutationFn: async ({ label }: { label: string }) => {
      if (!clientId) throw new Error("Cliente não identificado");
      const cleanLabel = label.trim();
      if (!cleanLabel) throw new Error("Informe o nome da região");
      const value = slugify(cleanLabel);
      if (!value) throw new Error("Nome de região inválido");
      const max = (query.data || []).reduce((m, r) => Math.max(m, r.ordem || 0), 0);
      const { error } = await supabase
        .from("eleicao_regioes" as any)
        .insert({ client_id: clientId, value, label: cleanLabel, ordem: max + 1 });
      if (error) {
        if (error.code === "23505") throw new Error("Já existe uma região com este nome.");
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Região adicionada!");
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao adicionar região"),
  });

  const remove = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      if (!clientId) throw new Error("Cliente não identificado");
      // Bloqueia remoção se há líderes cadastrados nesta região
      const { count } = await supabase
        .from("eleicao_pessoas" as any)
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("regiao", value);
      if ((count || 0) > 0) {
        throw new Error(`Não é possível remover: existem ${count} pessoa(s) cadastrada(s) nesta região.`);
      }
      const { error } = await supabase.from("eleicao_regioes" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Região removida.");
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao remover região"),
  });

  const updateTag = useMutation({
    mutationFn: async ({ id, tag }: { id: string; tag: string }) => {
      const cleanTag = normalizeTag(tag);
      if (!cleanTag) throw new Error("Tag inválida (use 1–8 letras/números)");
      const { error } = await supabase
        .from("eleicao_regioes" as any)
        .update({ tag: cleanTag })
        .eq("id", id);
      if (error) throw error;
      return cleanTag;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("TAG da região atualizada");
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao atualizar TAG"),
  });

  return {
    regioes: query.data || [],
    isLoading: query.isLoading,
    add: add.mutateAsync,
    isAdding: add.isPending,
    remove: remove.mutateAsync,
    isRemoving: remove.isPending,
    updateTag: updateTag.mutateAsync,
    isUpdatingTag: updateTag.isPending,
  };
}

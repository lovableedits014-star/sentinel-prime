import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface QuickContact {
  id: string;
  client_id: string;
  label: string;
  phone: string;
  context_message: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface QuickContactInput {
  label: string;
  phone: string;
  context_message?: string | null;
}

export function useQuickContacts(clientId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["quick-contacts", clientId],
    queryFn: async (): Promise<QuickContact[]> => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("quick_contacts")
        .select("*")
        .eq("client_id", clientId)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QuickContact[];
    },
    enabled: !!clientId,
    staleTime: Infinity,
  });

  const create = useMutation({
    mutationFn: async (input: QuickContactInput) => {
      if (!clientId) throw new Error("Cliente não identificado");
      const { data, error } = await supabase
        .from("quick_contacts")
        .insert({
          client_id: clientId,
          label: input.label.trim(),
          phone: input.phone.trim(),
          context_message: input.context_message?.trim() || null,
          display_order: (query.data?.length ?? 0),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick-contacts", clientId] });
      toast.success("Contato adicionado");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao adicionar contato"),
  });

  const update = useMutation({
    mutationFn: async (args: { id: string; input: QuickContactInput }) => {
      const { error } = await supabase
        .from("quick_contacts")
        .update({
          label: args.input.label.trim(),
          phone: args.input.phone.trim(),
          context_message: args.input.context_message?.trim() || null,
        })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick-contacts", clientId] });
      toast.success("Contato atualizado");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao atualizar contato"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick-contacts", clientId] });
      toast.success("Contato removido");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao remover contato"),
  });

  return {
    contacts: query.data ?? [],
    isLoading: query.isLoading,
    create: create.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    isMutating: create.isPending || update.isPending || remove.isPending,
  };
}
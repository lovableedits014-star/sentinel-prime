import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { toast } from "sonner";

export type WhatsAppGroup = {
  id: string;
  group_jid: string;
  name: string | null;
  picture_url: string | null;
  participants_count: number;
  is_admin: boolean;
  is_announcement: boolean;
  is_active: boolean;
  last_synced_at: string;
  instance_id: string;
};

export function useWhatsAppGroups(clientId: string | undefined) {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const groupsQuery = useQuery<WhatsAppGroup[]>({
    queryKey: ["whatsapp-groups", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("whatsapp_groups" as any)
        .select("id, group_jid, name, picture_url, participants_count, is_admin, is_announcement, is_active, last_synced_at, instance_id")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!clientId,
  });

  const syncFromInstance = useCallback(
    async (instanceId: string) => {
      if (!clientId) {
        toast.error("Cliente não identificado");
        return;
      }
      setIsSyncing(true);
      try {
        const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
          body: { action: "sync_groups", client_id: clientId, instance_id: instanceId },
        });
        if (error) throw error;
        if (data?.error || data?.success === false) {
          throw new Error(data?.error || "Falha ao sincronizar grupos");
        }
        toast.success(`✅ ${data?.total || 0} grupo(s) sincronizado(s)`);
        await queryClient.invalidateQueries({ queryKey: ["whatsapp-groups", clientId] });
      } catch (e: any) {
        toast.error(e?.message || "Erro ao sincronizar grupos");
      } finally {
        setIsSyncing(false);
      }
    },
    [clientId, queryClient]
  );

  return {
    groups: groupsQuery.data || [],
    isLoading: groupsQuery.isLoading,
    isSyncing,
    syncFromInstance,
    refetch: groupsQuery.refetch,
  };
}

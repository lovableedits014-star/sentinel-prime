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

type PrimaryInstance = {
  id: string;
  apelido: string | null;
  status: string | null;
  is_primary: boolean;
} | null;

export type GroupsSyncError = {
  message: string;
  /** A bridge respondeu “Unsupported action” — ponte WhatsApp desatualizada */
  isUnsupportedAction: boolean;
  /** Não há credencial / instância não conectada */
  isNotConnected: boolean;
};

function parseSyncError(raw: string): GroupsSyncError {
  const msg = raw || "Erro ao sincronizar grupos";
  const lower = msg.toLowerCase();
  return {
    message: msg,
    isUnsupportedAction: lower.includes("unsupported action") || lower.includes("available:"),
    isNotConnected:
      lower.includes("sem credencial") ||
      lower.includes("conecte primeiro") ||
      lower.includes("not connected") ||
      lower.includes("disconnected"),
  };
}

export type SyncLogEntry = {
  id: string;
  ts: string;
  level: "info" | "success" | "error";
  message: string;
};

export function useWhatsAppGroups(clientId: string | undefined) {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<GroupsSyncError | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);

  const pushLog = useCallback((level: SyncLogEntry["level"], message: string) => {
    setSyncLogs((prev) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: new Date().toISOString(), level, message },
      ...prev,
    ].slice(0, 50));
  }, []);

  const clearLogs = useCallback(() => setSyncLogs([]), []);

  const groupsQuery = useQuery<WhatsAppGroup[]>({
    queryKey: ["whatsapp-groups", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("whatsapp_groups" as any)
        .select("id, group_jid, name, picture_url, participants_count, is_admin, is_announcement, is_active, last_synced_at, instance_id")
        .eq("client_id", clientId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!clientId,
  });

  const primaryQuery = useQuery<PrimaryInstance>({
    queryKey: ["whatsapp-primary-instance", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase
        .from("whatsapp_instances" as any)
        .select("id, apelido, status, is_primary")
        .eq("client_id", clientId)
        .eq("is_primary", true)
        .maybeSingle();
      if (error) throw error;
      return (data as any) || null;
    },
    enabled: !!clientId,
  });

  const allGroups = groupsQuery.data || [];
  const activeGroups = allGroups.filter((g) => g.is_active);
  const inactiveCount = allGroups.length - activeGroups.length;
  const noPostCount = activeGroups.filter((g) => g.is_announcement && !g.is_admin).length;
  const lastSyncedAt = activeGroups.reduce<string | null>((acc, g) => {
    if (!g.last_synced_at) return acc;
    if (!acc || g.last_synced_at > acc) return g.last_synced_at;
    return acc;
  }, null);

  const primaryInstance = primaryQuery.data || null;
  const primaryConnected = !!primaryInstance && ["connected", "open"].includes(String(primaryInstance.status || "").toLowerCase());

  const syncFromInstance = useCallback(
    async (instanceId: string) => {
      if (!clientId) {
        toast.error("Cliente não identificado");
        return;
      }
      setIsSyncing(true);
      setLastError(null);
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
        const parsed = parseSyncError(String(e?.message || ""));
        setLastError(parsed);
        if (parsed.isUnsupportedAction) {
          toast.error("Ponte WhatsApp desatualizada", {
            description: "A action 'sync_groups' não está disponível nesta versão da bridge. Verifique se a bridge foi atualizada.",
          });
        } else if (parsed.isNotConnected) {
          toast.error("Instância não conectada", {
            description: "Conecte a instância principal em Configurações → WhatsApp antes de sincronizar.",
          });
        } else {
          toast.error("Erro ao sincronizar grupos", { description: parsed.message });
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [clientId, queryClient]
  );

  const syncFromPrimary = useCallback(async () => {
    if (!primaryInstance?.id) {
      toast.error("Nenhuma instância principal", {
        description: "Defina uma instância como Principal em Configurações → WhatsApp.",
      });
      return;
    }
    await syncFromInstance(primaryInstance.id);
  }, [primaryInstance?.id, syncFromInstance]);

  return {
    groups: activeGroups,
    allGroups,
    totalActive: activeGroups.length,
    inactiveCount,
    noPostCount,
    lastSyncedAt,
    isLoading: groupsQuery.isLoading,
    isSyncing,
    syncFromInstance,
    syncFromPrimary,
    refetch: groupsQuery.refetch,
    lastError,
    primaryInstance,
    primaryConnected,
    hasPrimaryInstance: !!primaryInstance,
  };
}

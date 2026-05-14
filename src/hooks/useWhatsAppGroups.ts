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
  is_favorite: boolean;
  last_synced_at: string;
  instance_id: string;
  /** Lista das instâncias do cliente que enxergam esse grupo (depois do dedupe). */
  instance_ids?: string[];
};

export type WhatsAppInstanceLite = {
  id: string;
  apelido: string | null;
  status: string | null;
  is_primary: boolean;
  phone_number: string | null;
};

type PrimaryInstance = WhatsAppInstanceLite | null;

const isConnectedStatus = (s: string | null | undefined) =>
  ["connected", "open"].includes(String(s || "").toLowerCase());

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
  const [syncingInstanceId, setSyncingInstanceId] = useState<string | null>(null);
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
        .select("id, group_jid, name, picture_url, participants_count, is_admin, is_announcement, is_active, is_favorite, last_synced_at, instance_id")
        .eq("client_id", clientId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!clientId,
  });

  const instancesQuery = useQuery<WhatsAppInstanceLite[]>({
    queryKey: ["whatsapp-instances", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("whatsapp_instances" as any)
        .select("id, apelido, status, is_primary, phone_number")
        .eq("client_id", clientId)
        .order("is_primary", { ascending: false })
        .order("apelido", { ascending: true });
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!clientId,
  });

  const instances = instancesQuery.data || [];
  const primaryInstance = instances.find((i) => i.is_primary) || null;
  const connectedInstances = instances.filter((i) => isConnectedStatus(i.status));

  // Dedupe por group_jid (mesmo grupo pode existir em várias instâncias).
  // Preferência: primeiro o que é admin, depois o mais recente. Mantém referência
  // de quais instâncias enxergam o grupo para exibir badge no UI.
  const allRawGroups = groupsQuery.data || [];
  const allGroups = (() => {
    const byJid = new Map<string, WhatsAppGroup & { instance_ids: string[] }>();
    for (const g of allRawGroups) {
      const existing = byJid.get(g.group_jid);
      if (!existing) {
        byJid.set(g.group_jid, { ...g, instance_ids: [g.instance_id] });
        continue;
      }
      existing.instance_ids.push(g.instance_id);
      const better =
        (g.is_admin && !existing.is_admin) ||
        (g.is_admin === existing.is_admin && g.last_synced_at > existing.last_synced_at);
      if (better) byJid.set(g.group_jid, { ...g, instance_ids: existing.instance_ids });
    }
    return Array.from(byJid.values());
  })();
  const activeGroups = allGroups.filter((g) => g.is_active);
  const inactiveCount = allGroups.length - activeGroups.length;
  const noPostCount = activeGroups.filter((g) => g.is_announcement && !g.is_admin).length;
  const lastSyncedAt = activeGroups.reduce<string | null>((acc, g) => {
    if (!g.last_synced_at) return acc;
    if (!acc || g.last_synced_at > acc) return g.last_synced_at;
    return acc;
  }, null);

  const primaryConnected = isConnectedStatus(primaryInstance?.status);

  const syncFromInstance = useCallback(
    async (instanceId: string) => {
      if (!clientId) {
        toast.error("Cliente não identificado");
        return { ok: false as const };
      }
      setIsSyncing(true);
      setSyncingInstanceId(instanceId);
      setLastError(null);
      const startedAt = Date.now();
      const inst = (queryClient.getQueryData<WhatsAppInstanceLite[]>(["whatsapp-instances", clientId]) || [])
        .find((i) => i.id === instanceId);
      const instLabel = inst?.apelido
        ? (inst.is_primary ? `${inst.apelido} (principal)` : inst.apelido)
        : `instância ${instanceId.slice(0, 8)}`;
      pushLog("info", `▶ Iniciando sincronização (${instLabel})…`);
      try {
        const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
          body: { action: "sync_groups", client_id: clientId, instance_id: instanceId },
        });
        if (error) throw error;
        if (data?.error || data?.success === false) {
          throw new Error(data?.error || "Falha ao sincronizar grupos");
        }
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        const totalChats = Number(data?.total_chats ?? 0);
        const totalGroups = Number(data?.total_groups ?? data?.total ?? 0);
        const upserted = Number(data?.total ?? 0);
        const inactiveMarked = Number(data?.inactive_marked ?? 0);
        const restoredFavorites = Number(data?.restored_favorites ?? 0);
        const filtered = Math.max(0, totalChats - totalGroups);
        if (totalChats > 0) {
          pushLog("info", `[${instLabel}] ${totalChats} chat(s) — ${totalGroups} grupo(s), ${filtered} conversa(s) descartada(s).`);
        }
        if (inactiveMarked > 0) {
          pushLog("info", `[${instLabel}] ${inactiveMarked} grupo(s) marcado(s) como inativo(s).`);
        }
        if (restoredFavorites > 0) {
          pushLog("success", `⭐ [${instLabel}] ${restoredFavorites} favorito(s) restaurado(s) automaticamente pelo número.`);
          toast.success(`⭐ ${restoredFavorites} favorito(s) restaurado(s)`, {
            description: "Reconhecemos os grupos favoritados deste número anteriormente.",
          });
        }
        await queryClient.refetchQueries({ queryKey: ["whatsapp-groups", clientId], type: "active" });
        await queryClient.invalidateQueries({ queryKey: ["whatsapp-groups", clientId] });
        pushLog("success", `✔ [${instLabel}] concluído em ${elapsed}s — ${upserted} grupo(s) gravado(s).`);
        toast.success(`✅ ${instLabel}: ${upserted} grupo(s) sincronizado(s)`);
        return { ok: true as const, upserted };
      } catch (e: any) {
        const parsed = parseSyncError(String(e?.message || ""));
        setLastError(parsed);
        pushLog("error", `✖ [${instLabel}] ${parsed.message}`);
        if (parsed.isUnsupportedAction) {
          toast.error("Ponte WhatsApp desatualizada", {
            description: "A action 'sync_groups' não está disponível nesta versão da bridge.",
          });
        } else if (parsed.isNotConnected) {
          toast.error(`${instLabel} não conectada`, {
            description: "Conecte a instância em Configurações → WhatsApp antes de sincronizar.",
          });
        } else {
          toast.error(`Erro ao sincronizar (${instLabel})`, { description: parsed.message });
        }
        return { ok: false as const };
      } finally {
        setIsSyncing(false);
        setSyncingInstanceId(null);
      }
    },
    [clientId, queryClient, pushLog]
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

  /**
   * Sincroniza várias instâncias em sequência (nunca em paralelo, para evitar
   * conflito de upsert e respeitar rate-limit da bridge). Se `ids` for omitido,
   * usa todas as instâncias conectadas.
   */
  const syncFromMany = useCallback(
    async (ids?: string[]) => {
      const targetIds = (ids && ids.length > 0)
        ? ids
        : connectedInstances.map((i) => i.id);
      if (targetIds.length === 0) {
        toast.error("Nenhuma instância conectada", {
          description: "Conecte ao menos uma instância em Configurações → WhatsApp.",
        });
        return;
      }
      pushLog("info", `▶ Sincronizando ${targetIds.length} instância(s) em sequência…`);
      let okCount = 0;
      let totalUpserted = 0;
      for (const id of targetIds) {
        const r = await syncFromInstance(id);
        if (r.ok) {
          okCount += 1;
          totalUpserted += r.upserted || 0;
        }
      }
      pushLog(
        okCount === targetIds.length ? "success" : "info",
        `■ Lote concluído: ${okCount}/${targetIds.length} instância(s), ${totalUpserted} grupo(s) gravado(s).`
      );
    },
    [connectedInstances, syncFromInstance, pushLog]
  );

  const favoriteCount = activeGroups.filter((g) => g.is_favorite).length;

  const toggleFavorite = useCallback(
    async (groupId: string, next: boolean) => {
      if (!clientId) return;
      // Optimistic update
      queryClient.setQueryData<WhatsAppGroup[]>(["whatsapp-groups", clientId], (prev) =>
        (prev || []).map((g) => (g.id === groupId ? { ...g, is_favorite: next } : g))
      );
      const { error } = await supabase
        .from("whatsapp_groups" as any)
        .update({ is_favorite: next })
        .eq("id", groupId)
        .eq("client_id", clientId);
      if (error) {
        // rollback
        queryClient.setQueryData<WhatsAppGroup[]>(["whatsapp-groups", clientId], (prev) =>
          (prev || []).map((g) => (g.id === groupId ? { ...g, is_favorite: !next } : g))
        );
        toast.error("Não foi possível atualizar favorito", { description: error.message });
      }
    },
    [clientId, queryClient]
  );

  return {
    groups: activeGroups,
    allGroups,
    totalActive: activeGroups.length,
    inactiveCount,
    noPostCount,
    favoriteCount,
    lastSyncedAt,
    isLoading: groupsQuery.isLoading,
    isSyncing,
    syncingInstanceId,
    syncFromInstance,
    syncFromPrimary,
    syncFromMany,
    toggleFavorite,
    refetch: groupsQuery.refetch,
    lastError,
    instances,
    connectedInstances,
    primaryInstance,
    primaryConnected,
    hasPrimaryInstance: !!primaryInstance,
    syncLogs,
    clearSyncLogs: clearLogs,
  };
}

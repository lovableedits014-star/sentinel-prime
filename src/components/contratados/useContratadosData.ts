import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";

export interface Contratado {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
  zona_eleitoral: string | null;
  status: string;
  contrato_aceito: boolean;
  contrato_aceito_em: string | null;
  lider_id: string | null;
  is_lider: boolean;
  quota_indicados: number;
  redes_sociais: any;
  created_at: string;
}

export interface Indicado {
  id: string;
  nome: string;
  telefone: string;
  cidade: string | null;
  bairro: string | null;
  status: string;
  contratado_id: string;
  created_at: string;
  ligacao_status: string | null;
  vota_candidato: string | null;
  candidato_alternativo: string | null;
  operador_nome: string | null;
  ligacao_em: string | null;
}

export interface CheckinAgg { total: number; last: string | null }

const DATA_TIMEOUT_MS = 8000;

const hasStoredAuthSession = () => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = localStorage.getItem(key);
        if (raw && raw.length > 20) return true;
      }
    }
  } catch {}
  return false;
};

const getStoredAuthUser = () => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const user = parsed?.user || parsed?.currentSession?.user;
      if (user?.id) return user;
    }
  } catch {}
  return null;
};

const withTimeout = async <T,>(promise: PromiseLike<T>, label: string, ms = DATA_TIMEOUT_MS): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} demorou demais para responder`)), ms);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export function useContratadosData() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [contratados, setContratados] = useState<Contratado[]>([]);
  const [indicados, setIndicados] = useState<Indicado[]>([]);
  const [checkinStats, setCheckinStats] = useState<Record<string, CheckinAgg>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);

    const safeSetLoading = (value: boolean) => {
      if (seq === loadSeq.current) setLoading(value);
    };

    try {
      let user = getStoredAuthUser();
      if (!user) {
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), "Sessão", 5000);
        user = session?.user;
      }
      if (!user) {
        setLoadError(hasStoredAuthSession() ? "Sua sessão ainda está sendo restaurada. Tente recarregar." : "Faça login novamente para acessar Contratados.");
        return;
      }

      const { data: client, error: clientError } = await withTimeout(
        supabase.from("clients").select("id, name").eq("user_id", user.id).maybeSingle(),
        "Cliente"
      );
      if (clientError) throw clientError;
      if (!client) {
        setClientId(null);
        setClientName("");
        setContratados([]);
        setIndicados([]);
        setCheckinStats({});
        setLoadError("Sua conta não está vinculada a um cliente.");
        return;
      }

      setClientId(client.id);
      setClientName(client.name);

      const [contRes, indRes, checkRes] = await Promise.allSettled([
        withTimeout(supabase.from("contratados").select("*").eq("client_id", client.id).order("created_at", { ascending: false }), "Contratados"),
        withTimeout(supabase.from("contratado_indicados").select("*").eq("client_id", client.id).order("created_at", { ascending: false }), "Indicados"),
        withTimeout(supabase.from("contratado_checkins").select("contratado_id, checkin_date").eq("client_id", client.id).order("checkin_date", { ascending: false }), "Check-ins"),
      ]);

      const readRows = <T,>(result: PromiseSettledResult<any>, label: string): T[] => {
        if (result.status === "rejected") {
          console.error(`[useContratadosData] ${label}:`, result.reason);
          setLoadError((prev) => prev || `Não foi possível carregar ${label}.`);
          return [];
        }
        if (result.value?.error) {
          console.error(`[useContratadosData] ${label}:`, result.value.error);
          setLoadError((prev) => prev || `Não foi possível carregar ${label}.`);
          return [];
        }
        return (result.value?.data || []) as T[];
      };

      setContratados(readRows<Contratado>(contRes, "contratados"));
      setIndicados(readRows<Indicado>(indRes, "indicados"));

      const stats: Record<string, CheckinAgg> = {};
      readRows<any>(checkRes, "check-ins").forEach((c: any) => {
        if (!stats[c.contratado_id]) stats[c.contratado_id] = { total: 0, last: null };
        stats[c.contratado_id].total++;
        if (!stats[c.contratado_id].last) stats[c.contratado_id].last = c.checkin_date;
      });
      setCheckinStats(stats);
    } catch (err) {
      console.error("[useContratadosData] erro ao carregar:", err);
      setLoadError(err instanceof Error ? err.message : "Não foi possível carregar a aba Contratados.");
    } finally {
      safeSetLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { clientId, clientName, contratados, setContratados, indicados, setIndicados, checkinStats, loading, loadError, reload: load };
}

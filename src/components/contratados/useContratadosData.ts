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

const getStoredAuthState = () => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const session = parsed?.currentSession || parsed;
      const user = session?.user || parsed?.user;
      const accessToken = session?.access_token || parsed?.access_token;
      if (user?.id && accessToken) return { user, accessToken };
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

const restSelect = async <T,>(path: string, token: string, label: string): Promise<T[]> => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configuração do Supabase ausente");
  const response = await withTimeout(fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${token}`, Accept: "application/json" },
  }), label);
  if (!response.ok) throw new Error(`${label}: ${response.status}`);
  return await response.json() as T[];
};

const MAX_RETRIES = 3;

export function useContratadosData() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [contratados, setContratados] = useState<Contratado[]>([]);
  const [indicados, setIndicados] = useState<Indicado[]>([]);
  const [checkinStats, setCheckinStats] = useState<Record<string, CheckinAgg>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const loadSeq = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const load = useCallback(async (attempt = 0): Promise<void> => {
    clearRetryTimer();
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    setRetryAttempt(attempt);

    const safeSetLoading = (value: boolean) => {
      if (seq === loadSeq.current) setLoading(value);
    };

    let hadFailure = false;
    let fatalError: unknown = null;

    try {
      const storedAuth = getStoredAuthState();
      let user = storedAuth?.user || getStoredAuthUser();
      if (!user) {
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), "Sessão", 5000);
        user = session?.user;
      }
      if (!user) {
        setLoadError(hasStoredAuthSession() ? "Sua sessão ainda está sendo restaurada. Tente recarregar." : "Faça login novamente para acessar Contratados.");
        return;
      }

      let client: { id: string; name: string } | null = null;
      try {
        const { data, error } = await withTimeout(
          supabase.from("clients").select("id, name").eq("user_id", user.id).maybeSingle(),
          "Cliente"
        );
        if (error) throw error;
        client = data;
      } catch (err) {
        if (!storedAuth?.accessToken) throw err;
        const rows = await restSelect<{ id: string; name: string }>(`clients?select=id,name&user_id=eq.${user.id}&limit=1`, storedAuth.accessToken, "Cliente");
        client = rows[0] || null;
      }
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

      const [contRes, indRes, checkRes] = storedAuth?.accessToken ? await Promise.allSettled([
        restSelect<Contratado>(`contratados?select=*&client_id=eq.${client.id}&order=created_at.desc`, storedAuth.accessToken, "Contratados"),
        restSelect<Indicado>(`contratado_indicados?select=*&client_id=eq.${client.id}&order=created_at.desc`, storedAuth.accessToken, "Indicados"),
        restSelect<any>(`contratado_checkins?select=contratado_id,checkin_date&client_id=eq.${client.id}&order=checkin_date.desc`, storedAuth.accessToken, "Check-ins"),
      ]) : await Promise.allSettled([
        withTimeout(supabase.from("contratados").select("*").eq("client_id", client.id).order("created_at", { ascending: false }), "Contratados"),
        withTimeout(supabase.from("contratado_indicados").select("*").eq("client_id", client.id).order("created_at", { ascending: false }), "Indicados"),
        withTimeout(supabase.from("contratado_checkins").select("contratado_id, checkin_date").eq("client_id", client.id).order("checkin_date", { ascending: false }), "Check-ins"),
      ]);

      const readRows = <T,>(result: PromiseSettledResult<any>, label: string): T[] => {
        if (result.status === "rejected") {
          console.error(`[useContratadosData] ${label}:`, result.reason);
          hadFailure = true;
          setLoadError((prev) => prev || `Não foi possível carregar ${label}.`);
          return [];
        }
        if (result.value?.error) {
          console.error(`[useContratadosData] ${label}:`, result.value.error);
          hadFailure = true;
          setLoadError((prev) => prev || `Não foi possível carregar ${label}.`);
          return [];
        }
        if (Array.isArray(result.value)) return result.value as T[];
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
      fatalError = err;
      hadFailure = true;
      setLoadError(err instanceof Error ? err.message : "Não foi possível carregar a aba Contratados.");
    } finally {
      safeSetLoading(false);
    }

    if (hadFailure && attempt < MAX_RETRIES && seq === loadSeq.current) {
      const delay = Math.min(4000, 1000 * Math.pow(2, attempt));
      const nextAttempt = attempt + 1;
      const baseMsg = fatalError instanceof Error
        ? fatalError.message
        : "Falha ao carregar dados";
      setLoadError(`${baseMsg} — tentando novamente (${nextAttempt}/${MAX_RETRIES}) em ${Math.round(delay / 1000)}s...`);
      retryTimerRef.current = setTimeout(() => {
        if (seq === loadSeq.current) void load(nextAttempt);
      }, delay);
    }
  }, [clearRetryTimer]);

  const reload = useCallback(() => {
    clearRetryTimer();
    return load(0);
  }, [load, clearRetryTimer]);

  useEffect(() => {
    void load(0);
    return () => clearRetryTimer();
  }, [load, clearRetryTimer]);

  return { clientId, clientName, contratados, setContratados, indicados, setIndicados, checkinStats, loading, loadError, retryAttempt, reload };
}

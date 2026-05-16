import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { useActiveClientId } from "@/hooks/useActiveClientId";

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

export type DiagStatus = "pending" | "ok" | "error" | "skipped";
export interface DiagStep {
  key: string;
  label: string;
  status: DiagStatus;
  durationMs?: number;
  detail?: string;
}

const CACHE_TTL_MS = 5 * 60_000;
const cacheKey = (uid: string) => `contratados-cache:${uid}`;
type CacheShape = { ts: number; clientId: string; clientName: string; contratados: Contratado[]; indicados: Indicado[]; checkinStats: Record<string, CheckinAgg> };
const readCache = (uid: string): CacheShape | null => {
  try {
    const raw = sessionStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
};
const writeCache = (uid: string, data: Omit<CacheShape, "ts">) => {
  try { sessionStorage.setItem(cacheKey(uid), JSON.stringify({ ...data, ts: Date.now() })); } catch {}
};

export function useContratadosData() {
  // Subscribe to the unified active-client query so swapping impersonation
  // forces this hook to reload via the load effect below.
  const { clientId: activeClientId } = useActiveClientId();
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [contratados, setContratados] = useState<Contratado[]>([]);
  const [indicados, setIndicados] = useState<Indicado[]>([]);
  const [checkinStats, setCheckinStats] = useState<Record<string, CheckinAgg>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [diagnostics, setDiagnostics] = useState<DiagStep[]>([]);
  const loadSeq = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hidratação instantânea via snapshot da sessão
  useEffect(() => {
    const u = getStoredAuthState()?.user || getStoredAuthUser();
    if (!u) return;
    const snap = readCache(u.id);
    if (snap) {
      setClientId(snap.clientId);
      setClientName(snap.clientName);
      setContratados(snap.contratados);
      setIndicados(snap.indicados);
      setCheckinStats(snap.checkinStats);
      setLoading(false);
    }
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const load = useCallback(async (attempt = 0): Promise<void> => {
    clearRetryTimer();
    const seq = ++loadSeq.current;
    // Só mostra spinner global se não há dados em tela (evita "piscar" ao revalidar)
    setContratados((prev) => { if (prev.length === 0) setLoading(true); return prev; });
    setLoadError(null);
    setRetryAttempt(attempt);
    setDiagnostics([]);

    const t0 = performance.now();
    const steps: DiagStep[] = [];
    const flush = () => { if (seq === loadSeq.current) setDiagnostics([...steps]); };
    const startStep = (key: string, label: string): DiagStep => {
      const s: DiagStep = { key, label, status: "pending" };
      steps.push(s); flush(); return s;
    };
    const finishStep = (s: DiagStep, status: DiagStatus, detail?: string) => {
      s.status = status;
      s.durationMs = Math.round(performance.now() - t0);
      if (detail) s.detail = detail;
      flush();
    };

    console.info(`[Contratados] ▶ Carregamento iniciado (tentativa ${attempt + 1})`);

    const safeSetLoading = (value: boolean) => {
      if (seq === loadSeq.current) setLoading(value);
    };

    let hadFailure = false;
    let fatalError: unknown = null;

    try {
      const sessionStep = startStep("session", "Sessão de usuário");
      const storedAuth = getStoredAuthState();
      let user = storedAuth?.user || getStoredAuthUser();
      const sessionSource = storedAuth?.user ? "localStorage(token+user)" : (user ? "localStorage(user)" : "supabase.auth.getSession");
      if (!user) {
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), "Sessão", 5000);
        user = session?.user;
      }
      if (!user) {
        finishStep(sessionStep, "error", `Sem sessão (storedToken=${!!storedAuth?.accessToken}, hasStoredAuth=${hasStoredAuthSession()})`);
        const msg = hasStoredAuthSession() ? "Sua sessão ainda está sendo restaurada. Tente recarregar." : "Faça login novamente para acessar Contratados.";
        console.warn(`[Contratados] ✗ ${msg}`);
        setLoadError(msg);
        return;
      }
      finishStep(sessionStep, "ok", `userId=${user.id.slice(0, 8)}…, fonte=${sessionSource}`);
      console.info(`[Contratados] ✓ Sessão OK (${sessionSource})`);

      const clientStep = startStep("client", "Vínculo com cliente");
      let client: { id: string; name: string } | null = null;
      let clientSource = "resolveClientId";
      try {
        // Honor super-admin impersonation + team_members fallback via the
        // unified resolver instead of querying clients by user_id directly.
        const { resolveClientId } = await import("@/lib/resolveClientId");
        const resolvedId = await withTimeout(resolveClientId(), "Cliente");
        if (resolvedId) {
          const { data, error } = await withTimeout(
            supabase.from("clients").select("id, name").eq("id", resolvedId).maybeSingle(),
            "Cliente"
          );
          if (error) throw error;
          client = data;
        }
      } catch (err) {
        console.warn("[Contratados] resolveClientId falhou, tentando REST", err);
        if (!storedAuth?.accessToken) throw err;
        clientSource = "REST fallback";
        const rows = await restSelect<{ id: string; name: string }>(`clients?select=id,name&user_id=eq.${user.id}&limit=1`, storedAuth.accessToken, "Cliente");
        client = rows[0] || null;
      }
      if (!client) {
        finishStep(clientStep, "error", `Sem cliente vinculado (via ${clientSource})`);
        console.warn("[Contratados] ✗ Sem cliente vinculado");
        setClientId(null); setClientName(""); setContratados([]); setIndicados([]); setCheckinStats({});
        setLoadError("Sua conta não está vinculada a um cliente.");
        return;
      }
      finishStep(clientStep, "ok", `clientId=${client.id.slice(0, 8)}… via ${clientSource}`);
      console.info(`[Contratados] ✓ Cliente OK (${client.name})`);

      setClientId(client.id);
      setClientName(client.name);

      const useRest = !!storedAuth?.accessToken;
      const contStep = startStep("contratados", `Contratados (${useRest ? "REST" : "supabase-js"})`);
      const indStep = startStep("indicados", `Indicados (${useRest ? "REST" : "supabase-js"})`);
      const checkStep = startStep("checkins", `Check-ins (${useRest ? "REST" : "supabase-js"})`);

      const [contRes, indRes, checkRes] = useRest ? await Promise.allSettled([
        restSelect<Contratado>(`contratados?select=*&client_id=eq.${client.id}&order=created_at.desc`, storedAuth!.accessToken, "Contratados"),
        restSelect<Indicado>(`contratado_indicados?select=*&client_id=eq.${client.id}&order=created_at.desc`, storedAuth!.accessToken, "Indicados"),
        restSelect<any>(`contratado_checkins?select=contratado_id,checkin_date&client_id=eq.${client.id}&order=checkin_date.desc`, storedAuth!.accessToken, "Check-ins"),
      ]) : await Promise.allSettled([
        withTimeout(supabase.from("contratados").select("*").eq("client_id", client.id).order("created_at", { ascending: false }), "Contratados"),
        withTimeout(supabase.from("contratado_indicados").select("*").eq("client_id", client.id).order("created_at", { ascending: false }), "Indicados"),
        withTimeout(supabase.from("contratado_checkins").select("contratado_id, checkin_date").eq("client_id", client.id).order("checkin_date", { ascending: false }), "Check-ins"),
      ]);

      const readRows = <T,>(result: PromiseSettledResult<any>, label: string, step: DiagStep): T[] => {
        if (result.status === "rejected") {
          const detail = result.reason instanceof Error ? result.reason.message : String(result.reason);
          console.error(`[Contratados] ✗ ${label}:`, result.reason);
          finishStep(step, "error", detail);
          hadFailure = true;
          setLoadError((prev) => prev || `Não foi possível carregar ${label}: ${detail}`);
          return [];
        }
        if (result.value?.error) {
          const detail = result.value.error.message || JSON.stringify(result.value.error);
          console.error(`[Contratados] ✗ ${label}:`, result.value.error);
          finishStep(step, "error", detail);
          hadFailure = true;
          setLoadError((prev) => prev || `Não foi possível carregar ${label}: ${detail}`);
          return [];
        }
        const rows = Array.isArray(result.value) ? result.value : (result.value?.data || []);
        finishStep(step, "ok", `${rows.length} registro(s)`);
        console.info(`[Contratados] ✓ ${label}: ${rows.length} linha(s)`);
        return rows as T[];
      };

      const cont = readRows<Contratado>(contRes, "contratados", contStep);
      const ind = readRows<Indicado>(indRes, "indicados", indStep);
      setContratados(cont);
      setIndicados(ind);

      const stats: Record<string, CheckinAgg> = {};
      readRows<any>(checkRes, "check-ins", checkStep).forEach((c: any) => {
        if (!stats[c.contratado_id]) stats[c.contratado_id] = { total: 0, last: null };
        stats[c.contratado_id].total++;
        if (!stats[c.contratado_id].last) stats[c.contratado_id].last = c.checkin_date;
      });
      setCheckinStats(stats);

      if (!hadFailure && user?.id) {
        writeCache(user.id, { clientId: client.id, clientName: client.name, contratados: cont, indicados: ind, checkinStats: stats });
      }
    } catch (err) {
      console.error("[Contratados] ✗ erro fatal:", err);
      fatalError = err;
      hadFailure = true;
      const msg = err instanceof Error ? err.message : "Não foi possível carregar a aba Contratados.";
      setLoadError(msg);
      steps.push({ key: "fatal", label: "Erro inesperado", status: "error", detail: msg, durationMs: Math.round(performance.now() - t0) });
      flush();
    } finally {
      safeSetLoading(false);
      console.info(`[Contratados] ◼ Concluído em ${Math.round(performance.now() - t0)}ms (falha=${hadFailure})`);
    }

    if (hadFailure && attempt < MAX_RETRIES && seq === loadSeq.current) {
      const delay = Math.min(4000, 1000 * Math.pow(2, attempt));
      const nextAttempt = attempt + 1;
      const baseMsg = fatalError instanceof Error ? fatalError.message : "Falha ao carregar dados";
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

  return { clientId, clientName, contratados, setContratados, indicados, setIndicados, checkinStats, loading, loadError, retryAttempt, diagnostics, reload };
}
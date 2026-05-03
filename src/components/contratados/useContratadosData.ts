import { useCallback, useEffect, useState } from "react";
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

export function useContratadosData() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [contratados, setContratados] = useState<Contratado[]>([]);
  const [indicados, setIndicados] = useState<Indicado[]>([]);
  const [checkinStats, setCheckinStats] = useState<Record<string, CheckinAgg>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: client } = await supabase
      .from("clients").select("id, name").eq("user_id", user.id).maybeSingle();
    if (!client) { setLoading(false); return; }
    setClientId(client.id);
    setClientName(client.name);

    const [contRes, indRes, checkRes] = await Promise.all([
      supabase.from("contratados").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("contratado_indicados").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("contratado_checkins").select("contratado_id, checkin_date").eq("client_id", client.id).order("checkin_date", { ascending: false }),
    ]);

    setContratados((contRes.data || []) as any);
    setIndicados((indRes.data || []) as any);

    const stats: Record<string, CheckinAgg> = {};
    (checkRes.data || []).forEach((c: any) => {
      if (!stats[c.contratado_id]) stats[c.contratado_id] = { total: 0, last: null };
      stats[c.contratado_id].total++;
      if (!stats[c.contratado_id].last) stats[c.contratado_id].last = c.checkin_date;
    });
    setCheckinStats(stats);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { clientId, clientName, contratados, setContratados, indicados, setIndicados, checkinStats, loading, reload: load };
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";

export interface RankingRow {
  pessoa_id: string;
  pessoa_nome: string;
  pessoa_tipo: string; // 'coordenador' | 'lider' | 'liderado'
  cidade: string | null;
  bairro: string | null;
  coordenador_id: string | null;
  coordenador_nome: string | null;
  filhos_count: number;
  indicados_diretos: number;
  indicados_total: number;
  ligados: number;
  confirmados: number;
  indecisos: number;
  rejeitados: number;
  pendentes: number;
  taxa_conversao: number | null;
  meta: number;
  ultima_atividade: string | null;
}

export interface RankingFilters {
  campanhaId?: string | null;
  dataDe?: string | null;
  dataAte?: string | null;
  universo: "eleicao" | "contratados";
}

export function useRankingIndicadores(clientId: string | null, filters: RankingFilters) {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("tele_ranking_indicadores" as any, {
      _client_id: clientId,
      _campanha_id: filters.campanhaId || null,
      _data_de: filters.dataDe || null,
      _data_ate: filters.dataAte || null,
      _universo: filters.universo,
    });
    if (err) {
      console.error("[useRankingIndicadores]", err);
      setError(err.message);
      setRows([]);
    } else {
      setRows(((data as any[]) || []) as RankingRow[]);
    }
    setLoading(false);
  }, [clientId, filters.campanhaId, filters.dataDe, filters.dataAte, filters.universo]);

  useEffect(() => { void load(); }, [load]);

  return { rows, loading, error, reload: load };
}

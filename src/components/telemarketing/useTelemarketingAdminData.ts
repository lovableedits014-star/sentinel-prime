import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { useActiveClientId } from "@/hooks/useActiveClientId";

export interface AdminTeleRow {
  tabela: string;
  id: string;
  nome: string;
  telefone: string;
  cidade: string | null;
  bairro: string | null;
  ligacao_status: string | null;
  vota_candidato: string | null;
  candidato_alternativo: string | null;
  operador_nome: string | null;
  ligacao_em: string | null;
  tipo: string;
  lider_id: string | null;
  contratado_id: string | null;
  campanha_id: string | null;
  campanha_nome: string | null;
  is_lider: boolean;
}

/**
 * Carrega contatos de todas as origens (contratados, indicados, eleição-pessoas,
 * eleição-indicados, avulsos) já com o status mais recente da ligação para os
 * painéis admin de Resultados e Relatórios.
 *
 * Adapta o resultado para o shape esperado por TelemarketingResultsPanel e
 * TelemarketingReportsPanel (props `contratados` e `indicados`).
 */
export function useTelemarketingAdminData() {
  const { clientId } = useActiveClientId();
  const [rows, setRows] = useState<AdminTeleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc(
      "tele_admin_listar_contatos_full" as any,
      { _client_id: clientId },
    );
    if (err) {
      console.error("[useTelemarketingAdminData]", err);
      setError(err.message);
      setRows([]);
    } else {
      setRows(((data as any[]) || []) as AdminTeleRow[]);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Adapta para o shape esperado pelos painéis existentes.
  // - "contratados" agrega líderes e liderados (origem `contratados`).
  // - "indicados" agrega indicados de contratados + ligações vindas das filas
  //   da eleição (eleicao_pessoas, eleicao_indicados) e contatos avulsos, para
  //   que TODAS as ligações apareçam em KPIs, gráficos e lista detalhada.
  const contratados = rows
    .filter((r) => r.tabela === "contratados")
    .map((r) => ({
      id: r.id,
      nome: r.nome,
      telefone: r.telefone,
      email: null,
      cidade: r.cidade,
      bairro: r.bairro,
      endereco: null,
      zona_eleitoral: null,
      status: "ativo",
      contrato_aceito: false,
      contrato_aceito_em: null,
      lider_id: r.lider_id,
      is_lider: r.is_lider,
      quota_indicados: 0,
      redes_sociais: null,
      created_at: r.ligacao_em || new Date().toISOString(),
      ligacao_status: r.ligacao_status,
      vota_candidato: r.vota_candidato,
      candidato_alternativo: r.candidato_alternativo,
      operador_nome: r.operador_nome,
      ligacao_em: r.ligacao_em,
    }));

  const indicados = rows
    .filter((r) => r.tabela !== "contratados")
    .map((r) => ({
      id: `${r.tabela}-${r.id}`,
      nome: r.nome,
      telefone: r.telefone,
      cidade: r.cidade,
      bairro: r.bairro,
      status: "ativo",
      contratado_id: r.contratado_id || "",
      created_at: r.ligacao_em || new Date().toISOString(),
      ligacao_status: r.ligacao_status,
      vota_candidato: r.vota_candidato,
      candidato_alternativo: r.candidato_alternativo,
      operador_nome: r.operador_nome,
      ligacao_em: r.ligacao_em,
    }));

  return { clientId, rows, contratados, indicados, loading, error, reload: load };
}

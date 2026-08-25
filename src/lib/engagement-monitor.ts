import { supabase } from "@/integrations/supabase/client-selfhosted";

const db = supabase as any;

export type Faixa = "excelente" | "atencao" | "baixo" | "critico";

export type MonitorOverview = {
  total_pessoas: number;
  publicacoes_monitoradas: number;
  obrigacoes: number;
  cumpridas: number;
  nao_cumpridas: number;
  pendentes: number;
  cumprimento_geral: number;
  excelente: number;
  atencao: number;
  baixo: number;
  critico: number;
  indice_medio: number;
};

export type RankingRow = {
  origem: string;
  ref_id: string;
  nome: string;
  cargo: string | null;
  telefone: string | null;
  regiao: string | null;
  cidade: string | null;
  obrigacoes: number;
  cumpridas: number;
  nao_cumpridas: number;
  cumprimento: number;
  qualidade: number;
  regularidade: number;
  pontualidade: number;
  tendencia: number;
  indice: number;
  faixa: Faixa;
  indice_anterior: number | null;
  variacao: number | null;
  ultima_interacao: string | null;
};

export type AdesaoRow = {
  mission_id: string;
  titulo: string | null;
  plataforma: string | null;
  publicado_em: string | null;
  prazo_em: string | null;
  obrigacoes: number;
  cumpridas: number;
  nao_cumpridas: number;
  pendentes: number;
  adesao: number;
};

export type HistoricoRow = {
  obrigacao_id: string;
  mission_id: string;
  titulo: string | null;
  plataforma: string | null;
  post_url: string | null;
  publicado_em: string | null;
  prazo_em: string | null;
  tipo_obrigacao: string;
  status: string;
  evidencia_nivel: string | null;
  evidencia_url: string | null;
  pontos: number;
  cumprida_em: string | null;
  atraso_horas: number | null;
  justificativa: string | null;
};

export type Regra = {
  id: string;
  client_id: string;
  nome: string;
  descricao: string | null;
  cargos: string[];
  regioes: string[];
  cidades: string[];
  tipo_obrigacao: "interagir" | "comentar" | "evidencia";
  esperado: number;
  prazo_horas: number;
  ativo: boolean;
  created_at: string;
};

export type MissaoMonitorada = {
  id: string;
  title: string | null;
  post_url: string | null;
  platform: string | null;
  monitorada: boolean;
  regra_id: string | null;
  prazo_horas: number | null;
  publicado_em: string | null;
  post_id_facebook: string | null;
  post_id_instagram: string | null;
  created_at: string;
  is_active: boolean;
};

export const FAIXA_META: Record<Faixa, { label: string; className: string }> = {
  excelente: { label: "Excelente", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  atencao: { label: "Atenção", className: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
  baixo: { label: "Baixo", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  critico: { label: "Crítico", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

export const TIPO_OBRIGACAO_LABEL: Record<string, string> = {
  interagir: "Interagir (curtir/abrir o post)",
  comentar: "Comentar na publicação",
  evidencia: "Compartilhar + anexar evidência",
};

export const EVIDENCIA_LABEL: Record<string, string> = {
  E1: "E1 · Comprovado pela API",
  E2: "E2 · Declarado no portal",
  E3: "E3 · Evidência anexada",
};

export const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  cumprida: "Cumprida",
  nao_cumprida: "Não cumprida",
  dispensada: "Dispensada",
};

function unwrap<T>(res: { data: unknown; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T[];
}

export async function fetchMonitorOverview(clientId: string): Promise<MonitorOverview | null> {
  const rows = unwrap<MonitorOverview>(await db.rpc("engagement_monitor_overview", { p_client_id: clientId }));
  return rows[0] ?? null;
}

export async function fetchRanking(clientId: string, limit = 500): Promise<RankingRow[]> {
  return unwrap<RankingRow>(await db.rpc("engagement_ranking", { p_client_id: clientId, p_limit: limit }));
}

export async function fetchAdesao(clientId: string, limit = 100): Promise<AdesaoRow[]> {
  return unwrap<AdesaoRow>(await db.rpc("engagement_adesao_publicacoes", { p_client_id: clientId, p_limit: limit }));
}

export async function fetchHistoricoPessoa(
  clientId: string,
  origem: string,
  refId: string,
): Promise<HistoricoRow[]> {
  return unwrap<HistoricoRow>(
    await db.rpc("engagement_historico_pessoa", {
      p_client_id: clientId,
      p_origem: origem,
      p_ref_id: refId,
      p_limit: 200,
    }),
  );
}

export async function fetchRegras(clientId: string): Promise<Regra[]> {
  const { data, error } = await db
    .from("engagement_regras")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Regra[];
}

export async function salvarRegra(clientId: string, regra: Partial<Regra>): Promise<void> {
  const payload = {
    client_id: clientId,
    nome: (regra.nome || "").trim(),
    descricao: regra.descricao || null,
    cargos: regra.cargos ?? [],
    regioes: regra.regioes ?? [],
    cidades: regra.cidades ?? [],
    tipo_obrigacao: regra.tipo_obrigacao || "interagir",
    esperado: Math.max(1, Number(regra.esperado) || 1),
    prazo_horas: Math.max(1, Number(regra.prazo_horas) || 48),
    ativo: regra.ativo ?? true,
  };
  const { error } = regra.id
    ? await db.from("engagement_regras").update(payload).eq("id", regra.id)
    : await db.from("engagement_regras").insert(payload);
  if (error) throw new Error(error.message);
}

export async function excluirRegra(id: string): Promise<void> {
  const { error } = await db.from("engagement_regras").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchMissoes(clientId: string): Promise<MissaoMonitorada[]> {
  const { data, error } = await db
    .from("portal_missions")
    .select(
      "id, title, post_url, platform, monitorada, regra_id, prazo_horas, publicado_em, post_id_facebook, post_id_instagram, created_at, is_active",
    )
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as MissaoMonitorada[];
}

export async function atualizarMissaoMonitoramento(
  id: string,
  values: Partial<Pick<MissaoMonitorada, "regra_id" | "prazo_horas" | "publicado_em" | "post_id_facebook" | "post_id_instagram" | "monitorada">>,
): Promise<void> {
  const { error } = await db.from("portal_missions").update(values).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function gerarObrigacoes(clientId: string, missionId: string, regraId?: string | null): Promise<number> {
  const { data, error } = await db.rpc("engagement_gerar_obrigacoes", {
    p_client_id: clientId,
    p_mission_id: missionId,
    p_regra_id: regraId ?? null,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function casarInteracoes(
  clientId: string,
  missionId?: string | null,
): Promise<{ atualizadas: number; nao_cumpridas: number }> {
  const rows = unwrap<{ atualizadas: number; nao_cumpridas: number }>(
    await db.rpc("engagement_casar_interacoes", { p_client_id: clientId, p_mission_id: missionId ?? null }),
  );
  return rows[0] ?? { atualizadas: 0, nao_cumpridas: 0 };
}

export async function recalcularIndices(clientId: string, dias = 30): Promise<number> {
  const { data, error } = await db.rpc("engagement_recalcular_indices", { p_client_id: clientId, p_dias: dias });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function registrarCobranca(
  clientId: string,
  origem: string,
  refId: string,
  canal: string,
  texto: string,
): Promise<void> {
  const { error } = await db.rpc("engagement_registrar_cobranca", {
    p_client_id: clientId,
    p_origem: origem,
    p_ref_id: refId,
    p_canal: canal,
    p_texto: texto,
    p_resultado: "registrada",
  });
  if (error) throw new Error(error.message);
}

export async function dispensarObrigacao(id: string, justificativa: string): Promise<void> {
  const { error } = await db
    .from("engagement_obrigacoes")
    .update({ status: "dispensada", justificativa, pontos: 0 })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function validarEvidencia(id: string, url: string): Promise<void> {
  const { error } = await db
    .from("engagement_obrigacoes")
    .update({ evidencia_url: url, evidencia_validada: true, cumprida_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

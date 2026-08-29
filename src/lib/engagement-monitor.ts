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
  modo_publico: "automatico" | "manual";
  grupo_id: string | null;
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
  audience_snapshotted_at: string | null;
  eligible_count: number | null;
};

export type EligibilityAuditRow = {
  mission_id: string;
  titulo: string | null;
  publicado_em: string;
  fotografia_em: string | null;
  elegiveis: number;
  dispensados_entrada_posterior: number;
  sem_fotografia: boolean;
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

export async function fetchEligibilityAudit(clientId: string): Promise<EligibilityAuditRow[]> {
  return unwrap<EligibilityAuditRow>(await db.rpc("engagement_eligibility_audit", { p_client_id: clientId }));
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
    modo_publico: regra.modo_publico || "automatico",
    grupo_id: regra.grupo_id ?? null,
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
      "id, title, post_url, platform, monitorada, regra_id, prazo_horas, publicado_em, post_id_facebook, post_id_instagram, created_at, is_active, audience_snapshotted_at, eligible_count",
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

/* ===================== Público monitorado ===================== */

export type PublicoGrupo = {
  id: string;
  client_id: string;
  nome: string;
  descricao: string | null;
  created_at: string;
};

export type CandidatoRow = {
  origem: string;
  ref_id: string;
  nome: string;
  cargo: string | null;
  telefone: string | null;
  regiao: string | null;
  cidade: string | null;
  instagram_handle: string | null;
  facebook_key: string | null;
  no_publico: boolean;
  dispensado: boolean;
};

export type PendenciaRow = {
  origem: string;
  ref_id: string;
  nome: string;
  cargo: string | null;
  telefone: string | null;
  regiao: string | null;
  cidade: string | null;
  instagram_handle: string | null;
  facebook_key: string | null;
  sem_instagram: boolean;
  sem_facebook: boolean;
  sem_telefone: boolean;
  sem_prova: boolean;
  pronta_para_cobranca: boolean;
  motivo_bloqueio: string | null;
  ultimo_comentario: string | null;
};

export type PreviaPublico = {
  total: number;
  prontas: number;
  sem_rede: number;
  sem_telefone: number;
  sem_dados: number;
};


export async function fetchGrupos(clientId: string): Promise<PublicoGrupo[]> {
  const { data, error } = await db
    .from("engagement_publico_grupos")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicoGrupo[];
}

export async function criarGrupo(clientId: string, nome: string, descricao?: string): Promise<PublicoGrupo> {
  const { data, error } = await db
    .from("engagement_publico_grupos")
    .insert({ client_id: clientId, nome: nome.trim(), descricao: descricao || null })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PublicoGrupo;
}

export async function excluirGrupo(id: string): Promise<void> {
  const { error } = await db.from("engagement_publico_grupos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchCandidatos(
  clientId: string,
  grupoId: string | null,
  busca?: string,
): Promise<CandidatoRow[]> {
  return unwrap<CandidatoRow>(
    await db.rpc("engagement_publico_candidatos", {
      p_client_id: clientId,
      p_grupo_id: grupoId,
      p_busca: busca?.trim() || null,
      p_limit: 800,
    }),
  );
}

export async function definirPublico(
  clientId: string,
  origem: string,
  refId: string,
  incluido: boolean,
  grupoId: string | null,
  dispensado = false,
  observacao?: string | null,
): Promise<void> {
  const { error } = await db.rpc("engagement_publico_definir", {
    p_client_id: clientId,
    p_origem: origem,
    p_ref_id: refId,
    p_incluido: incluido,
    p_grupo_id: grupoId,
    p_dispensado: dispensado,
    p_observacao: observacao ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function fetchPendencias(
  clientId: string,
  grupoId: string | null,
  regraId?: string | null,
): Promise<PendenciaRow[]> {
  return unwrap<PendenciaRow>(
    await db.rpc("engagement_publico_pendencias", {
      p_client_id: clientId,
      p_grupo_id: grupoId,
      p_regra_id: regraId ?? null,
    }),
  );
}

export async function salvarTelefonePessoa(
  clientId: string,
  origem: string,
  refId: string,
  telefone: string,
): Promise<void> {
  const { error } = await db.rpc("engagement_publico_set_telefone", {
    p_client_id: clientId,
    p_origem: origem,
    p_ref_id: refId,
    p_telefone: telefone,
  });
  if (error) throw new Error(error.message);
}

export async function contarPublicoDaRegra(clientId: string, regra: Regra): Promise<number> {
  const rows = unwrap<{ ref_id: string }>(
    await db.rpc("engagement_publico_alvo", {
      p_client_id: clientId,
      p_cargos: regra.cargos ?? [],
      p_regioes: regra.regioes ?? [],
      p_cidades: regra.cidades ?? [],
      p_modo: regra.modo_publico ?? "automatico",
      p_grupo_id: regra.grupo_id ?? null,
    }),
  );
  return rows.length;
}

/** Prévia de quem será cobrado: total, prontos e bloqueados por falta de dados. */
export async function fetchPrevia(
  clientId: string,
  regraId?: string | null,
  grupoId?: string | null,
): Promise<PreviaPublico> {
  const rows = unwrap<PreviaPublico>(
    await db.rpc("engagement_publico_previa", {
      p_client_id: clientId,
      p_regra_id: regraId ?? null,
      p_grupo_id: grupoId ?? null,
    }),
  );
  return rows[0] ?? { total: 0, prontas: 0, sem_rede: 0, sem_telefone: 0, sem_dados: 0 };
}

/** Cadastra uma pessoa "avulsa" (que não existe em nenhum cadastro) direto no público monitorado. */
export async function criarPessoaManual(
  clientId: string,
  input: {
    nome: string;
    telefone?: string | null;
    cargo?: string | null;
    regiao?: string | null;
    cidade?: string | null;
    grupoId?: string | null;
    instagram?: string | null;
    facebook?: string | null;
    observacao?: string | null;
  },
): Promise<{ ref_id: string }> {
  const { data, error } = await db.rpc("engagement_publico_criar_manual", {
    p_client_id: clientId,
    p_nome: input.nome.trim(),
    p_telefone: input.telefone || null,
    p_cargo: input.cargo || null,
    p_regiao: input.regiao || null,
    p_cidade: input.cidade || null,
    p_grupo_id: input.grupoId ?? null,
    p_instagram: input.instagram || null,
    p_facebook: input.facebook || null,
    p_observacao: input.observacao || null,
  });
  if (error) throw new Error(error.message);
  return (data ?? {}) as { ref_id: string };
}

export async function excluirPessoaManual(clientId: string, refId: string): Promise<void> {
  const { error } = await db.rpc("engagement_publico_excluir_manual", {
    p_client_id: clientId,
    p_ref_id: refId,
  });
  if (error) throw new Error(error.message);
}


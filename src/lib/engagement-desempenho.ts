import { supabase } from "@/integrations/supabase/client-selfhosted";

const db = supabase as any;

export type PubKpis = {
  publicacoes: number;
  obrigados: number;
  pares: number;
  cumprimentos: number;
  abriu_sem_confirmar: number;
  nunca_engajaram: number;
  adesao: number;
  e1: number;
  e2: number;
  e3: number;
  publicacoes_ant: number;
  cumprimentos_ant: number;
  adesao_ant: number;
};

export type PublicacaoDesempenho = {
  mission_id: string;
  titulo: string | null;
  plataforma: string | null;
  publicado_em: string | null;
  obrigados: number;
  cumpriram: number;
  abriu_sem_confirmar: number;
  faltaram: number;
  e1: number;
  e2: number;
  e3: number;
  adesao: number;
};

export type DetalheItem = {
  mission_id: string;
  titulo: string | null;
  publicado_em: string | null;
  status: "cumpriu" | "abriu" | "nao_abriu";
  prova: "E1" | "E2" | "E3" | null;
  facebook_abriu?: boolean;
  instagram_abriu?: boolean;
};

export type PublicacaoAudit = {
  mission_id: string; publico_congelado: number; registros_ativos: number;
  pessoas_unicas: number; dispensados: number; duplicados: number;
};

export type PessoaDesempenho = {
  pessoa_id: string;
  origem: string;
  nome: string;
  telefone: string | null;
  cargo: string | null;
  regiao: string | null;
  cidade: string | null;
  is_voluntario: boolean;
  tem_contrato: boolean;
  publicacoes: number;
  cumpridas: number;
  abriu_sem_confirmar: number;
  faltas: number;
  pct: number;
  prova_principal: "E1" | "E2" | "E3" | null;
  faixa: "excelente" | "atencao" | "baixo" | "critico";
  pct_anterior: number | null;
  variacao: number | null;
  ultima_atividade: string | null;
  detalhe: DetalheItem[];
};

export type Faltante = {
  pessoa_id: string;
  origem: string;
  nome: string;
  telefone: string | null;
  cargo: string | null;
  regiao: string | null;
  cidade: string | null;
  status: "abriu" | "nao_abriu";
};

export type TeamRoot = {
  root_id: string;
  nome: string;
  tipo: "coordenador" | "lider";
  is_avulso: boolean;
  pessoas: number;
};

export type DesempenhoFilters = {
  rootId?: string | null;
  missionId?: string | null;
};

export type EngagementDatePeriod = { inicio: string; fim: string };

export async function fetchTeamRoots(clientId: string): Promise<TeamRoot[]> {
  return unwrap<TeamRoot>(await db.rpc("engagement_team_roots", { p_client_id: clientId }));
}

function unwrap<T>(res: { data: unknown; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T[];
}

export async function fetchPubKpis(clientId: string, dias: number, audienceId: string | null, filters: DesempenhoFilters = {}): Promise<PubKpis | null> {
  const rows = unwrap<PubKpis>(
    await db.rpc("engagement_pub_kpis_v2", { p_client_id: clientId, p_dias: dias, p_audience_id: audienceId, p_root_id: filters.rootId ?? null, p_mission_id: filters.missionId ?? null }),
  );
  return rows[0] ?? null;
}

export async function fetchPublicacoesDesempenho(
  clientId: string,
  dias: number,
  audienceId: string | null,
  filters: DesempenhoFilters = {},
): Promise<PublicacaoDesempenho[]> {
  return unwrap<PublicacaoDesempenho>(
    await db.rpc("engagement_publicacoes_desempenho_v2", {
      p_client_id: clientId,
      p_dias: dias,
      p_audience_id: audienceId,
      p_root_id: filters.rootId ?? null,
      p_mission_id: filters.missionId ?? null,
    }),
  );
}

export async function fetchPublicacoesAudit(
  clientId: string, dias: number, audienceId: string | null, filters: DesempenhoFilters = {},
): Promise<PublicacaoAudit[]> {
  return unwrap<PublicacaoAudit>(await db.rpc("engagement_publicacoes_audit", {
    p_client_id: clientId, p_dias: dias, p_audience_id: audienceId,
    p_root_id: filters.rootId ?? null, p_mission_id: filters.missionId ?? null,
  }));
}

export async function fetchEquipeDesempenho(
  clientId: string,
  dias: number,
  audienceId: string | null,
  filters: DesempenhoFilters = {},
): Promise<PessoaDesempenho[]> {
  const rows = unwrap<any>(
    await db.rpc("engagement_equipe_desempenho_v2", {
      p_client_id: clientId,
      p_dias: dias,
      p_audience_id: audienceId,
      p_root_id: filters.rootId ?? null,
      p_mission_id: filters.missionId ?? null,
    }),
  );
  return rows.map((r) => ({ ...r, detalhe: Array.isArray(r.detalhe) ? r.detalhe : [] })) as PessoaDesempenho[];
}

const periodArgs = (clientId: string, period: EngagementDatePeriod, audienceId: string | null, filters: DesempenhoFilters) => ({
  p_client_id: clientId,
  p_data_inicio: period.inicio,
  p_data_fim: period.fim,
  p_audience_id: audienceId,
  p_root_id: filters.rootId ?? null,
  p_mission_id: filters.missionId ?? null,
});

export async function fetchPubKpisPeriodo(clientId: string, period: EngagementDatePeriod, audienceId: string | null, filters: DesempenhoFilters = {}): Promise<PubKpis | null> {
  const rows = unwrap<PubKpis>(await db.rpc("engagement_pub_kpis_periodo_v2", periodArgs(clientId, period, audienceId, filters)));
  return rows[0] ?? null;
}

export async function fetchPublicacoesDesempenhoPeriodo(clientId: string, period: EngagementDatePeriod, audienceId: string | null, filters: DesempenhoFilters = {}): Promise<PublicacaoDesempenho[]> {
  return unwrap<PublicacaoDesempenho>(await db.rpc("engagement_publicacoes_desempenho_periodo_v2", periodArgs(clientId, period, audienceId, filters)));
}

export async function fetchPublicacoesAuditPeriodo(clientId: string, period: EngagementDatePeriod, audienceId: string | null, filters: DesempenhoFilters = {}): Promise<PublicacaoAudit[]> {
  return unwrap<PublicacaoAudit>(await db.rpc("engagement_publicacoes_audit_periodo", periodArgs(clientId, period, audienceId, filters)));
}

export async function fetchEquipeDesempenhoPeriodo(clientId: string, period: EngagementDatePeriod, audienceId: string | null, filters: DesempenhoFilters = {}): Promise<PessoaDesempenho[]> {
  const rows = unwrap<any>(await db.rpc("engagement_equipe_desempenho_periodo_v2", periodArgs(clientId, period, audienceId, filters)));
  return rows.map((r) => ({ ...r, detalhe: Array.isArray(r.detalhe) ? r.detalhe : [] })) as PessoaDesempenho[];
}

export async function fetchFaltantes(
  clientId: string,
  missionId: string,
  audienceId: string | null,
): Promise<Faltante[]> {
  return unwrap<Faltante>(
    await db.rpc("engagement_publicacao_faltantes", {
      p_client_id: clientId,
      p_mission_id: missionId,
      p_audience_id: audienceId,
      p_dias: 3650,
    }),
  );
}

export const PROVA_LABEL: Record<string, string> = {
  E1: "Comprovação validada",
  E2: "Confirmou no portal",
  E3: "Evidência aprovada",
};

export const FAIXA_DESEMPENHO: Record<
  PessoaDesempenho["faixa"],
  { label: string; className: string }
> = {
  excelente: { label: "Cumprindo bem", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  atencao: { label: "Precisa melhorar", className: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
  baixo: { label: "Poucas confirmações", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  critico: { label: "Nenhuma confirmação", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

export const STATUS_PUB_LABEL: Record<string, string> = {
  cumpriu: "Cumpriu",
  abriu: "Abriu e não confirmou",
  nao_abriu: "Não abriu",
};

export const fmtPct = (n: number | null | undefined) => `${Number(n ?? 0).toFixed(1).replace(".0", "")}%`;

export const fmtDataHora = (s?: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export const fmtData = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

export const fmtTelefone = (s?: string | null) => {
  const d = (s || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "—";
};

export const waLink = (telefone?: string | null, texto?: string) => {
  const d = (telefone || "").replace(/\D/g, "");
  if (!d) return null;
  const full = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${full}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
};

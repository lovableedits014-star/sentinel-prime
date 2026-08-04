import { supabase } from "@/integrations/supabase/client-selfhosted";

export type Origem =
  | "pessoas"
  | "funcionarios"
  | "eleicao_pessoas"
  | "contratados"
  | "supporter_accounts";

export type TeamRow = {
  ref_id: string;
  origem: Origem;
  cargo: string;
  nome: string;
  telefone: string | null;
  supporter_id: string | null;
  regiao: string | null;
  cidade: string | null;
  instagram_handle: string | null;
  facebook_key: string | null;
  facebook_label: string | null;
  instagram_comments: number;
  facebook_comments: number;
  other_actions: number;
  last_interaction: string | null;
  missoes_abertas: number;
  missoes_concluidas: number;
};

export type BuscaRow = {
  ref_id: string;
  origem: Origem;
  cargo: string;
  nome: string;
  telefone: string | null;
  cidade: string | null;
  regiao: string | null;
  supporter_id: string | null;
  instagram_handle: string | null;
  facebook_key: string | null;
};

export type CobrancaRow = {
  ref_id: string;
  origem: Origem;
  cargo: string;
  nome: string;
  telefone: string | null;
  regiao: string | null;
  cidade: string | null;
  instagram_handle: string | null;
  facebook_key: string | null;
  interacoes: number;
  instagram_comments: number;
  facebook_comments: number;
  missoes_abertas: number;
  missoes_concluidas: number;
  last_interaction: string | null;
  dias_sem_interagir: number | null;
  min_interacoes: number;
  min_missoes: number;
  situacao: "em_dia" | "abaixo" | "zerado" | "sem_cadastro";
  missoes_disponiveis: number;
};

export const CARGO_LABEL: Record<string, string> = {
  funcionario: "Funcionário",
  coordenador: "Coordenador",
  lider: "Líder",
  cabo: "Cabo eleitoral",
  contratado: "Contratado",
  apoiador: "Apoiador",
  eleitor: "Eleitor",
  lideranca: "Liderança",
  jornalista: "Jornalista",
  influenciador: "Influenciador",
  voluntario: "Voluntário",
  adversario: "Adversário",
  cidadao: "Cidadão",
  liderado: "Liderado",
  indicado: "Indicado",
  portal: "Conta do portal",
};

export const ORIGEM_LABEL: Record<Origem, string> = {
  pessoas: "CRM",
  funcionarios: "Funcionários",
  eleicao_pessoas: "Estrutura eleitoral",
  contratados: "Contratados",
  supporter_accounts: "Portal",
};

/** Cargos que podem ser atribuídos manualmente na troca de cargo. */
export const CARGOS_ATRIBUIVEIS = [
  "funcionario",
  "coordenador",
  "lider",
  "cabo",
  "apoiador",
  "eleitor",
  "lideranca",
  "jornalista",
  "influenciador",
  "voluntario",
  "cidadao",
] as const;

export const cargoLabel = (c: string | null | undefined) =>
  (c && CARGO_LABEL[c]) || (c ? c.replace(/_/g, " ") : "—");

/** Cargos que exigem telefone válido (vão para tabelas com telefone obrigatório). */
export const cargoExigeTelefone = (cargo: string) =>
  ["funcionario", "coordenador", "lider", "cabo"].includes(cargo);

export const totalInteracoes = (r: TeamRow) =>
  (r.instagram_comments || 0) + (r.facebook_comments || 0) + (r.other_actions || 0);

export const isMetaScopedId = (v: string | null | undefined) => !!v && /^\d{8,}$/.test(v);

export type Status = "rastreavel" | "aguardando" | "nao_rastreavel" | "sem_cadastro";

export function statusOf(r: TeamRow): Status {
  const interacted = totalInteracoes(r) > 0;
  const hasIg = !!r.instagram_handle;
  const hasFb = !!r.facebook_key;
  if (!hasIg && !hasFb) return "sem_cadastro";
  if (interacted) return "rastreavel";
  if (hasFb && !isMetaScopedId(r.facebook_key) && !hasIg) return "nao_rastreavel";
  return "aguardando";
}

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc(fn, args);

export async function fetchTeamOverview(clientId: string, days: number): Promise<TeamRow[]> {
  const { data, error } = await rpc("engagement_time_overview", {
    p_client_id: clientId,
    p_days: days,
  });
  if (error) throw new Error(error.message);
  return (data || []) as TeamRow[];
}

export async function buscarTime(clientId: string, termo: string, limit = 20): Promise<BuscaRow[]> {
  const { data, error } = await rpc("engagement_buscar_time", {
    p_client_id: clientId,
    p_termo: termo,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data || []) as BuscaRow[];
}

export async function fetchCobranca(clientId: string, days: number): Promise<CobrancaRow[]> {
  const { data, error } = await rpc("engagement_cobranca_overview", {
    p_client_id: clientId,
    p_days: days,
  });
  if (error) throw new Error(error.message);
  return (data || []) as CobrancaRow[];
}

export async function upsertSocial(
  origem: Origem,
  refId: string,
  plataforma: "instagram" | "facebook",
  usuario: string,
  url?: string | null,
): Promise<{ relinked: number; handle: string }> {
  const { data, error } = await rpc("engagement_entity_upsert_social", {
    p_origem: origem,
    p_ref: refId,
    p_plataforma: plataforma,
    p_usuario: usuario,
    p_url: url ?? null,
  });
  if (error) throw new Error(error.message);
  const d = (data || {}) as { relinked?: number; handle?: string };
  return { relinked: d.relinked ?? 0, handle: d.handle ?? usuario };
}

export async function linkAuthor(
  origem: Origem,
  refId: string,
  platform: "instagram" | "facebook",
  platformUserId: string,
  authorName?: string | null,
  picture?: string | null,
): Promise<{ relinked: number }> {
  const { data, error } = await rpc("engagement_entity_link_author", {
    p_origem: origem,
    p_ref: refId,
    p_platform: platform,
    p_platform_user_id: platformUserId,
    p_author_name: authorName ?? null,
    p_picture: picture ?? null,
  });
  if (error) throw new Error(error.message);
  return { relinked: ((data || {}) as { relinked?: number }).relinked ?? 0 };
}

export async function removeSocial(
  origem: Origem,
  refId: string,
  plataforma: "instagram" | "facebook",
): Promise<void> {
  const { error } = await rpc("engagement_entity_remove_social", {
    p_origem: origem,
    p_ref: refId,
    p_plataforma: plataforma,
  });
  if (error) throw new Error(error.message);
}

export type AlterarCargoResult = {
  ok: boolean;
  origem: Origem;
  ref_id: string;
  cargo_anterior: string;
  novo_cargo: string;
  orfaos_desvinculados: number;
  origem_preservada: boolean;
  motivo: string | null;
};

export async function alterarCargo(params: {
  origem: Origem;
  refId: string;
  novoCargo: string;
  telefone?: string | null;
  cidade?: string | null;
  regiao?: string | null;
  orfaos?: "avulso" | "bloquear";
}): Promise<AlterarCargoResult> {
  const { data, error } = await rpc("engagement_alterar_cargo", {
    p_origem: params.origem,
    p_ref: params.refId,
    p_novo_cargo: params.novoCargo,
    p_telefone: params.telefone ?? null,
    p_cidade: params.cidade ?? null,
    p_regiao: params.regiao ?? null,
    p_orfaos: params.orfaos ?? "avulso",
  });
  if (error) throw new Error(error.message);
  return data as AlterarCargoResult;
}

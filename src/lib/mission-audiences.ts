import { supabase } from "@/integrations/supabase/client-selfhosted";

export type AudienceGroup =
  | "coordenador"
  | "lider"
  | "cabo"
  | "voluntario"
  | "contratado"
  | "funcionario";

export const AUDIENCE_GROUP_LABEL: Record<AudienceGroup, string> = {
  coordenador: "Coordenadores",
  lider: "Líderes",
  cabo: "Cabos",
  voluntario: "Voluntários",
  contratado: "Contratados (contrato vigente)",
  funcionario: "Funcionários",
};

export const AUDIENCE_GROUP_HINT: Record<AudienceGroup, string> = {
  coordenador: "Todos os cadastros com cargo de coordenador.",
  lider: "Todos os cadastros com cargo de líder.",
  cabo: "Todos os cadastros com cargo de cabo eleitoral.",
  voluntario: "Quem está marcado como voluntário.",
  contratado: "Valor de contratação acima de zero e vigência válida hoje.",
  funcionario: "Equipe interna cadastrada em Funcionários.",
};

export type AudienceRule = {
  grupos: AudienceGroup[];
  regioes: string[];
  indicadores: string[];
  escopos: string[];
};

export const emptyRule = (): AudienceRule => ({
  grupos: [],
  regioes: [],
  indicadores: [],
  escopos: [],
});

export type MissionAudience = {
  id: string;
  client_id: string;
  nome: string;
  descricao: string | null;
  regra: AudienceRule;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type AudienceMember = {
  id: string;
  audience_id: string;
  origem: string;
  ref_id: string;
  modo: "incluido" | "dispensado";
  motivo: string | null;
};

export type AudiencePreview = {
  total: number;
  contratados: number;
  voluntarios: number;
  sem_telefone: number;
  por_cargo: Record<string, number>;
};

const db = supabase as any;

export const normalizeRule = (r: any): AudienceRule => ({
  grupos: Array.isArray(r?.grupos) ? r.grupos : [],
  regioes: Array.isArray(r?.regioes) ? r.regioes : [],
  indicadores: Array.isArray(r?.indicadores) ? r.indicadores : [],
  escopos: Array.isArray(r?.escopos) ? r.escopos : [],
});

export async function fetchAudiences(clientId: string): Promise<MissionAudience[]> {
  const { data, error } = await db
    .from("mission_audiences")
    .select("*")
    .eq("client_id", clientId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((a: any) => ({ ...a, regra: normalizeRule(a.regra) }));
}

export async function fetchAudienceMembers(audienceId: string): Promise<AudienceMember[]> {
  const { data, error } = await db
    .from("mission_audience_members")
    .select("id, audience_id, origem, ref_id, modo, motivo")
    .eq("audience_id", audienceId);
  if (error) throw new Error(error.message);
  return (data || []) as AudienceMember[];
}

export async function previewAudience(
  clientId: string,
  rule: AudienceRule,
  audienceId?: string | null,
): Promise<AudiencePreview> {
  const { data, error } = await db.rpc("mission_audience_preview", {
    p_client_id: clientId,
    p_regra: rule,
    p_audience_id: audienceId ?? null,
  });
  if (error) throw new Error(error.message);
  const d = (data || {}) as Partial<AudiencePreview>;
  return {
    total: d.total ?? 0,
    contratados: d.contratados ?? 0,
    voluntarios: d.voluntarios ?? 0,
    sem_telefone: d.sem_telefone ?? 0,
    por_cargo: d.por_cargo ?? {},
  };
}

export async function saveAudience(params: {
  id?: string | null;
  clientId: string;
  nome: string;
  descricao: string | null;
  regra: AudienceRule;
  isDefault: boolean;
}): Promise<string> {
  if (params.id) {
    const { error } = await db
      .from("mission_audiences")
      .update({
        nome: params.nome,
        descricao: params.descricao,
        regra: params.regra,
        is_default: params.isDefault,
      })
      .eq("id", params.id);
    if (error) throw new Error(error.message);
    if (params.isDefault) await clearOtherDefaults(params.clientId, params.id);
    return params.id;
  }
  const { data, error } = await db
    .from("mission_audiences")
    .insert({
      client_id: params.clientId,
      nome: params.nome,
      descricao: params.descricao,
      regra: params.regra,
      is_default: params.isDefault,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (params.isDefault) await clearOtherDefaults(params.clientId, data.id);
  return data.id as string;
}

async function clearOtherDefaults(clientId: string, keepId: string) {
  await db
    .from("mission_audiences")
    .update({ is_default: false })
    .eq("client_id", clientId)
    .neq("id", keepId);
}

export async function deleteAudience(id: string): Promise<void> {
  const { error } = await db.from("mission_audiences").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setAudienceMember(params: {
  clientId: string;
  audienceId: string;
  origem: string;
  refId: string;
  modo: "incluido" | "dispensado";
  motivo?: string | null;
}): Promise<void> {
  const { error } = await db.from("mission_audience_members").upsert(
    {
      client_id: params.clientId,
      audience_id: params.audienceId,
      origem: params.origem,
      ref_id: params.refId,
      modo: params.modo,
      motivo: params.motivo ?? null,
    },
    { onConflict: "audience_id,origem,ref_id" },
  );
  if (error) throw new Error(error.message);
}

export async function removeAudienceMember(id: string): Promise<void> {
  const { error } = await db.from("mission_audience_members").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setMissionAudience(clientId: string, missionId: string, audienceId: string | null): Promise<number> {
  const { data, error } = await db.rpc("mission_snapshot_audience", {
    p_client_id: clientId,
    p_mission_id: missionId,
    p_audience_id: audienceId,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export type PessoaOption = {
  id: string;
  nome: string;
  telefone: string | null;
  tipo: string | null;
  regiao: string | null;
  cidade: string | null;
};

export async function searchPessoas(clientId: string, termo: string, limit = 15): Promise<PessoaOption[]> {
  const q = termo.trim();
  if (q.length < 2) return [];
  const { data, error } = await db
    .from("eleicao_pessoas")
    .select("id, nome, telefone, tipo, regiao, cidade")
    .eq("client_id", clientId)
    .or(`nome.ilike.%${q}%,telefone.ilike.%${q}%`)
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as PessoaOption[];
}

export async function fetchRegioesDisponiveis(clientId: string): Promise<string[]> {
  const { data, error } = await db
    .from("eleicao_pessoas")
    .select("regiao, cidade")
    .eq("client_id", clientId)
    .limit(5000);
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const r of (data || []) as { regiao: string | null; cidade: string | null }[]) {
    const v = r.regiao || r.cidade;
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function fetchIndicadoresDisponiveis(
  clientId: string,
): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await db
    .from("eleicao_pessoas")
    .select("id, nome, tipo")
    .eq("client_id", clientId)
    .in("tipo", ["coordenador", "lider"])
    .order("nome")
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data || []) as { id: string; nome: string }[]).map((p) => ({ id: p.id, nome: p.nome }));
}

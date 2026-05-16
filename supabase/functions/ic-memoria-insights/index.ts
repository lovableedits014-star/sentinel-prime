// Gera insights agregados sobre a memória do candidato.
// Roda agregações simples (sem LLM por padrão) e insere na tabela ic_memoria_insights.
// Idempotente: apaga insights "novo" do dia antes de regenerar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/ic-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Insight = {
  tipo: string;
  titulo: string;
  descricao: string;
  prioridade: "alta" | "media" | "baixa";
  dados?: any;
};

async function gerarInsights(admin: any, clientId: string): Promise<Insight[]> {
  const insights: Insight[] = [];
  const hoje = new Date(); hoje.setHours(0,0,0,0);

  // 1) Promessas vencidas ou próximas
  const { data: promessas } = await admin
    .from("ic_promessas")
    .select("id, texto, prazo_data, bairro, status")
    .eq("client_id", clientId)
    .in("status", ["aberta", "em_andamento"])
    .not("prazo_data", "is", null);

  const vencidas = (promessas || []).filter((p: any) => new Date(p.prazo_data) < hoje);
  const proximas = (promessas || []).filter((p: any) => {
    const d = new Date(p.prazo_data);
    const dias = (d.getTime() - hoje.getTime()) / 86400000;
    return dias >= 0 && dias <= 30;
  });

  if (vencidas.length > 0) {
    insights.push({
      tipo: "promessa_vencida",
      titulo: `${vencidas.length} promessa(s) vencida(s) sem comprovação`,
      descricao: `Você tem ${vencidas.length} promessas cujo prazo já passou e ainda estão em aberto. Considere atualizar status ou anexar evidências.`,
      prioridade: "alta",
      dados: { ids: vencidas.slice(0, 10).map((p: any) => p.id) },
    });
  }
  if (proximas.length > 0) {
    insights.push({
      tipo: "promessa_proxima",
      titulo: `${proximas.length} promessa(s) com prazo nos próximos 30 dias`,
      descricao: `Boa hora para reforçar nas redes o que já foi entregue ou para alinhar com a equipe.`,
      prioridade: "media",
      dados: { ids: proximas.slice(0, 10).map((p: any) => p.id) },
    });
  }

  // 2) Bairros silenciados (citados há > 45 dias)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 45);
  const { data: docs } = await admin
    .from("ic_knowledge_documents")
    .select("data_evento, created_at, bairros_citados")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(300);

  const bairroUlt = new Map<string, Date>();
  for (const d of (docs || [])) {
    const dt = new Date(d.data_evento || d.created_at);
    for (const b of (d.bairros_citados || [])) {
      const nome = (b?.nome || "").toString().trim();
      if (!nome) continue;
      const cur = bairroUlt.get(nome);
      if (!cur || dt > cur) bairroUlt.set(nome, dt);
    }
  }
  const silenciados = [...bairroUlt.entries()].filter(([, dt]) => dt < cutoff).slice(0, 8);
  if (silenciados.length > 0) {
    insights.push({
      tipo: "bairro_silenciado",
      titulo: `${silenciados.length} bairro(s) sem menção há mais de 45 dias`,
      descricao: `Bairros: ${silenciados.map(([n]) => n).join(", ")}. Considere agendar uma visita ou conteúdo.`,
      prioridade: "media",
      dados: { bairros: silenciados.map(([n, dt]) => ({ nome: n, ultima: dt })) },
    });
  }

  // 3) Contradições novas (últimos 14 dias)
  const since = new Date(); since.setDate(since.getDate() - 14);
  const { count: nContrad } = await admin
    .from("ic_contradicoes")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", since.toISOString());
  if ((nContrad ?? 0) > 0) {
    insights.push({
      tipo: "contradicao_nova",
      titulo: `${nContrad} contradição(ões) detectadas nas últimas 2 semanas`,
      descricao: `Vale revisar antes que apareçam em entrevistas ou debates.`,
      prioridade: "alta",
      dados: { count: nContrad },
    });
  }

  // 4) Bordões em ascensão / esfriando
  const bordaoCount = new Map<string, { recente: number; antigo: number }>();
  const cut30 = new Date(); cut30.setDate(cut30.getDate() - 30);
  for (const d of (docs || [])) {
    const dt = new Date(d.data_evento || d.created_at);
    const isRecente = dt >= cut30;
    // bordoes pode estar em outro campo — buscamos via knowledge_documents
  }

  // 5) Total de documentos esta semana
  const semanaAtras = new Date(); semanaAtras.setDate(semanaAtras.getDate() - 7);
  const semanaDocs = (docs || []).filter((d: any) => new Date(d.created_at) >= semanaAtras).length;
  if (semanaDocs >= 3) {
    insights.push({
      tipo: "atividade_alta",
      titulo: `${semanaDocs} novos documentos esta semana`,
      descricao: `Boa hora para gerar uma matéria-síntese ou um boletim para a equipe.`,
      prioridade: "baixa",
      dados: { count: semanaDocs },
    });
  } else if (semanaDocs === 0 && (docs || []).length > 0) {
    insights.push({
      tipo: "atividade_baixa",
      titulo: `Nenhum documento novo esta semana`,
      descricao: `A memória está parada. Faça uma transcrição ou anote falas recentes para manter o sistema atualizado.`,
      prioridade: "media",
    });
  }

  return insights;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { clientId } = body || {};
    if (!clientId) return errorResponse("clientId é obrigatório", 400);

    // Tenant guard: revalida acesso do usuário ao client_id alvo.
    const { requireClientAccess } = await import("../_shared/auth-guard.ts");
    const guard = await requireClientAccess(req, clientId);
    if (!guard.ok) return guard.response;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Apaga insights "novo" anteriores para evitar duplicação
    await admin.from("ic_memoria_insights").delete().eq("client_id", clientId).eq("status", "novo");

    const insights = await gerarInsights(admin, clientId);
    if (insights.length > 0) {
      const rows = insights.map(i => ({ ...i, client_id: clientId }));
      const { error } = await admin.from("ic_memoria_insights").insert(rows);
      if (error) return errorResponse(error.message);
    }

    return jsonResponse({ ok: true, gerados: insights.length });
  } catch (e: any) {
    console.error("[ic-memoria-insights]", e?.message);
    return errorResponse(e?.message || "Erro");
  }
});

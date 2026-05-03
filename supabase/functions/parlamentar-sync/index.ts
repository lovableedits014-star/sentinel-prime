// Edge Function: parlamentar-sync
// Sincroniza presença, votações e proposições de adversários políticos
// usando APIs oficiais (Câmara dos Deputados e Senado Federal)
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CAMARA_BASE = "https://dadosabertos.camara.leg.br/api/v2";
const SENADO_BASE = "https://legis.senado.leg.br/dadosabertos";

const MAX_RUNTIME_MS = 55_000;
const startedAt = Date.now();
const timeLeft = () => MAX_RUNTIME_MS - (Date.now() - startedAt);

type Adversario = {
  id: string;
  client_id: string;
  nome: string;
  nivel: string;
  id_camara_federal: number | null;
  id_senado_federal: number | null;
};

async function fetchJson(url: string, accept = "application/json"): Promise<any> {
  const r = await fetch(url, { headers: { Accept: accept } });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}: ${await r.text()}`);
  return r.json();
}

// ===== CÂMARA FEDERAL =====
async function syncCamaraDeputado(supabase: any, adv: Adversario, log: any) {
  const id = adv.id_camara_federal;
  if (!id) return;

  // Proposições autoradas
  try {
    const props = await fetchJson(
      `${CAMARA_BASE}/proposicoes?idDeputadoAutor=${id}&ordem=DESC&ordenarPor=id&itens=50`,
    );
    const rows = (props.dados || []).map((p: any) => ({
      adversario_id: adv.id,
      client_id: adv.client_id,
      tipo: p.siglaTipo,
      numero: String(p.numero),
      ano: p.ano,
      ementa: p.ementa,
      data_apresentacao: p.dataApresentacao?.slice(0, 10) ?? null,
      url_detalhes: p.uri,
      id_externo: String(p.id),
    }));
    if (rows.length > 0) {
      const { error } = await supabase
        .from("parlamentar_proposicoes")
        .upsert(rows, { onConflict: "adversario_id,id_externo", ignoreDuplicates: true });
      if (error) throw error;
      log.proposicoes_inseridas = rows.length;
    }
  } catch (e) {
    log.erros.push(`proposicoes camara: ${e instanceof Error ? e.message : e}`);
  }

  if (timeLeft() < 5000) return;

  // Votações recentes do deputado (últimos 90 dias)
  try {
    const dataFim = new Date().toISOString().slice(0, 10);
    const dataIni = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    const vots = await fetchJson(
      `${CAMARA_BASE}/deputados/${id}/votacoes?dataInicio=${dataIni}&dataFim=${dataFim}&itens=100`,
    );
    const rows = (vots.dados || []).map((v: any) => ({
      adversario_id: adv.id,
      client_id: adv.client_id,
      data_votacao: v.dataHoraRegistro || v.dataHoraVoto || new Date().toISOString(),
      proposicao_codigo: v.descricao?.slice(0, 100) ?? null,
      proposicao_ementa: v.descricao ?? null,
      voto: (v.tipoVoto || "ausente").toLowerCase(),
      id_externo: v.idVotacao,
      url_detalhes: v.uri,
    }));
    if (rows.length > 0) {
      const { error } = await supabase
        .from("parlamentar_votacoes")
        .upsert(rows, { onConflict: "adversario_id,id_externo", ignoreDuplicates: true });
      if (error) throw error;
      log.votacoes_inseridas = rows.length;
    }
  } catch (e) {
    log.erros.push(`votacoes camara: ${e instanceof Error ? e.message : e}`);
  }
}

// ===== SENADO FEDERAL =====
async function syncSenadoSenador(supabase: any, adv: Adversario, log: any) {
  const id = adv.id_senado_federal;
  if (!id) return;

  // Senado retorna XML por padrão; pedimos JSON via Accept ou query
  try {
    const dataFim = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const dataIni = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
    const data = await fetchJson(
      `${SENADO_BASE}/senador/${id}/votacoes?dataInicio=${dataIni}&dataFim=${dataFim}`,
      "application/json",
    );
    const votList =
      data?.VotacaoParlamentar?.Parlamentar?.Votacoes?.Votacao ?? [];
    const arr = Array.isArray(votList) ? votList : [votList];
    const rows = arr
      .filter((v: any) => v && v.SiglaMateria)
      .map((v: any) => ({
        adversario_id: adv.id,
        client_id: adv.client_id,
        data_votacao: v.SessaoPlenaria?.DataSessao
          ? new Date(v.SessaoPlenaria.DataSessao).toISOString()
          : new Date().toISOString(),
        proposicao_codigo: `${v.SiglaMateria} ${v.NumeroMateria}/${v.AnoMateria}`,
        proposicao_ementa: v.DescricaoVotacao || null,
        voto: (v.DescricaoVoto || "ausente").toLowerCase().trim(),
        resultado_geral: v.Resultado || null,
        id_externo: v.CodigoSessaoVotacao || `${v.CodigoSessao}-${v.SequencialSessao}`,
      }));
    if (rows.length > 0) {
      const { error } = await supabase
        .from("parlamentar_votacoes")
        .upsert(rows, { onConflict: "adversario_id,id_externo", ignoreDuplicates: true });
      if (error) throw error;
      log.votacoes_inseridas = (log.votacoes_inseridas || 0) + rows.length;
    }
  } catch (e) {
    log.erros.push(`votacoes senado: ${e instanceof Error ? e.message : e}`);
  }

  if (timeLeft() < 5000) return;

  // Proposições de autoria
  try {
    const data = await fetchJson(
      `${SENADO_BASE}/senador/${id}/autorias?numero=50`,
      "application/json",
    );
    const list =
      data?.MateriasAutoriaParlamentar?.Parlamentar?.Autorias?.Autoria ?? [];
    const arr = Array.isArray(list) ? list : [list];
    const rows = arr
      .filter((p: any) => p && p.SiglaSubtipoMateria)
      .map((p: any) => ({
        adversario_id: adv.id,
        client_id: adv.client_id,
        tipo: p.SiglaSubtipoMateria,
        numero: p.NumeroMateria,
        ano: parseInt(p.AnoMateria) || null,
        ementa: p.EmentaMateria,
        data_apresentacao: p.DataApresentacao?.slice(0, 10) ?? null,
        id_externo: p.CodigoMateria,
      }));
    if (rows.length > 0) {
      const { error } = await supabase
        .from("parlamentar_proposicoes")
        .upsert(rows, { onConflict: "adversario_id,id_externo", ignoreDuplicates: true });
      if (error) throw error;
      log.proposicoes_inseridas = (log.proposicoes_inseridas || 0) + rows.length;
    }
  } catch (e) {
    log.erros.push(`proposicoes senado: ${e instanceof Error ? e.message : e}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { adversario_id, client_id } = body as { adversario_id?: string; client_id?: string };

    // Lista alvos: específico ou todos ativos do cliente
    let q = supabase
      .from("adversarios_politicos")
      .select("id,client_id,nome,nivel,id_camara_federal,id_senado_federal")
      .eq("ativo", true);
    if (adversario_id) q = q.eq("id", adversario_id);
    else if (client_id) q = q.eq("client_id", client_id);
    else return new Response(JSON.stringify({ error: "adversario_id ou client_id obrigatório" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const { data: alvos, error: errAlvos } = await q;
    if (errAlvos) throw errAlvos;

    const resultados: any[] = [];
    for (const adv of (alvos || []) as Adversario[]) {
      if (timeLeft() < 8000) {
        resultados.push({ adversario: adv.nome, status: "skipped_timeout" });
        break;
      }
      const log: any = {
        adversario_id: adv.id,
        client_id: adv.client_id,
        nome: adv.nome,
        erros: [] as string[],
      };
      const t0 = Date.now();
      try {
        if (adv.nivel === "federal_deputado" && adv.id_camara_federal) {
          await syncCamaraDeputado(supabase, adv, log);
        }
        if (adv.nivel === "federal_senador" && adv.id_senado_federal) {
          await syncSenadoSenador(supabase, adv, log);
        }
        log.duracao_ms = Date.now() - t0;

        await supabase.from("parlamentar_sync_log").insert({
          client_id: adv.client_id,
          adversario_id: adv.id,
          fonte: adv.nivel,
          tipo_dado: "votacao+proposicao",
          status: log.erros.length > 0 ? "partial" : "success",
          registros_inseridos: (log.votacoes_inseridas || 0) + (log.proposicoes_inseridas || 0),
          erro_mensagem: log.erros.length > 0 ? log.erros.join(" | ") : null,
          duracao_ms: log.duracao_ms,
        });
        resultados.push(log);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabase.from("parlamentar_sync_log").insert({
          client_id: adv.client_id,
          adversario_id: adv.id,
          fonte: adv.nivel,
          tipo_dado: "all",
          status: "error",
          erro_mensagem: msg,
          duracao_ms: Date.now() - t0,
        });
        resultados.push({ adversario: adv.nome, status: "error", erro: msg });
      }
    }

    return new Response(JSON.stringify({ ok: true, processados: resultados.length, resultados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("parlamentar-sync error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
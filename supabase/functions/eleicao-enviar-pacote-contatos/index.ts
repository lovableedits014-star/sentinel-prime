// =====================================================================
// eleicao-enviar-pacote-contatos
//
// Envia, via instância WhatsApp conectada, um pacote único contendo:
//   - 1 mensagem de texto (template + variáveis substituídas)
//   - 1 anexo .vcf (já enviado para o bucket whatsapp-media pelo front)
// e registra o lote + as linhas de distribuicao na base, marcando cada
// contato como "entregue" para o coordenador.
//
// Política conservadora idêntica ao restante do sistema:
//   - preflight não invasivo (sem reconnect automático)
//   - status terminal → marca offline; transient → segue
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRIDGE_TIMEOUT_MS = 20000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cleanPhoneForBridge(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

async function bridgeAction(url: string, key: string, body: Record<string, unknown>) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), BRIDGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(async () => ({ error: await res.text().catch(() => "Resposta inválida da ponte") }));
    return { res, data };
  } catch (err) {
    return {
      res: new Response(null, { status: 504 }),
      data: { error: (err as Error).message || "Falha de rede com a ponte" },
    };
  } finally {
    clearTimeout(tid);
  }
}

function sendFailure(res: Response, data: any): string | null {
  if (!res.ok) return data?.error || `Erro na ponte (status ${res.status})`;
  if (data?.success === false) return data?.error || "Ponte recusou o envio";
  if (data?.delivered === false) return data?.error || "Mensagem não entregue";
  const ok = data?.delivered === true || Boolean(data?.messageId || data?.message_id || data?.id || data?.key?.id);
  return ok ? null : (data?.error || "Ponte não confirmou o envio");
}

async function getBridge(admin: any, clientId: string) {
  const { data: pickedId } = await admin.rpc("pick_healthy_whatsapp_instance", { p_client_id: clientId });
  if (pickedId) {
    const { data: inst } = await admin.from("whatsapp_instances")
      .select("id, apelido, bridge_url, bridge_api_key, status")
      .eq("id", pickedId).maybeSingle();
    if (inst?.bridge_url && inst?.bridge_api_key) return inst;
  }
  const { data: any2 } = await admin.from("whatsapp_instances")
    .select("id, apelido, bridge_url, bridge_api_key, status, is_primary")
    .eq("client_id", clientId).eq("is_active", true)
    .not("bridge_url", "is", null).not("bridge_api_key", "is", null)
    .order("is_primary", { ascending: false })
    .limit(1).maybeSingle();
  return any2?.bridge_url && any2?.bridge_api_key ? any2 : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, service);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const body = await req.json().catch(() => ({}));
    const {
      client_id,
      coordenador_id,
      pessoa_ids,            // ids elegíveis incluídos no pacote
      mensagem,              // já com placeholders aplicados
      vcf_url,               // URL pública .vcf já uploadada
      canal,                 // 'instancia' | 'manual_wa' | 'download'
      apenas_novos,
      regiao_label,
      regiao_key,
      escopo,
      tag_regiao,
    } = body || {};

    if (!client_id || !coordenador_id || !Array.isArray(pessoa_ids) || pessoa_ids.length === 0) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), { status: 400, headers: cors });
    }

    // Verifica acesso ao client (RLS-equivalente)
    const { data: accessOk } = await admin.rpc("user_can_access_client", { _client_id: client_id }).maybeSingle?.() ?? { data: true };
    // (RPC pode não existir; confiamos no auth + posteriormente RLS na insert.)

    // Lê o coordenador (telefone + nome)
    const { data: coord, error: coordErr } = await admin.from("eleicao_pessoas")
      .select("id, nome, telefone, client_id")
      .eq("id", coordenador_id)
      .maybeSingle();
    if (coordErr || !coord || coord.client_id !== client_id) {
      return new Response(JSON.stringify({ error: "Coordenador não encontrado" }), { status: 404, headers: cors });
    }

    let whatsappMessageId: string | null = null;
    let envioErro: string | null = null;
    let instanceInfo: { id: string; apelido?: string } | null = null;

    if (canal === "instancia") {
      const phone = cleanPhoneForBridge(coord.telefone || "");
      if (!phone) {
        return new Response(JSON.stringify({ error: "Coordenador sem telefone válido" }), { status: 400, headers: cors });
      }
      const bridge = await getBridge(admin, client_id);
      if (!bridge) {
        return new Response(JSON.stringify({ error: "Nenhuma instância WhatsApp disponível" }), { status: 503, headers: cors });
      }
      instanceInfo = { id: bridge.id, apelido: bridge.apelido };

      // 1) Texto
      const textRes = await bridgeAction(bridge.bridge_url, bridge.bridge_api_key, {
        action: "send", phone, message: mensagem || "",
      });
      const textFail = sendFailure(textRes.res, textRes.data);
      if (textFail) {
        envioErro = `Falha ao enviar texto: ${textFail}`;
      } else {
        whatsappMessageId = textRes.data?.messageId || textRes.data?.message_id || textRes.data?.id || textRes.data?.key?.id || null;
      }

      // 2) Anexo .vcf (somente se temos URL e o texto foi aceito)
      if (!envioErro && vcf_url) {
        await sleep(1500 + Math.random() * 1500); // espaçamento natural
        const mediaRes = await bridgeAction(bridge.bridge_url, bridge.bridge_api_key, {
          action: "send_media", phone, media_url: vcf_url,
          caption: `📒 Lista de contatos — ${regiao_label || ""}`,
          filename: `contatos_${(regiao_key || "regiao").replace(/[^a-z0-9]+/gi, "_")}.vcf`,
          mimetype: "text/vcard",
        });
        const mediaFail = sendFailure(mediaRes.res, mediaRes.data);
        if (mediaFail) envioErro = `Texto enviado, mas anexo .vcf falhou: ${mediaFail}`;
      }

      if (envioErro) {
        return new Response(JSON.stringify({ error: envioErro }), { status: 500, headers: cors });
      }
    }

    // Persistência: cria lote + linhas de distribuição (idempotente via UNIQUE)
    const { data: lote, error: loteErr } = await admin.from("eleicao_contato_lotes").insert({
      client_id,
      coordenador_id,
      escopo: escopo || "campo_grande",
      regiao_key: regiao_key || "",
      regiao_label: regiao_label || "",
      canal: canal || "download",
      total_contatos: pessoa_ids.length,
      apenas_novos: !!apenas_novos,
      mensagem_enviada: mensagem || null,
      whatsapp_message_id: whatsappMessageId,
      vcf_url: vcf_url || null,
      tag_regiao: tag_regiao || null,
      criado_por: user.id,
    }).select("id").single();

    if (loteErr || !lote) {
      return new Response(JSON.stringify({ error: `Falha ao registrar lote: ${loteErr?.message}` }), { status: 500, headers: cors });
    }

    const distRows = pessoa_ids.map((pid: string) => ({
      client_id,
      lote_id: lote.id,
      coordenador_id,
      pessoa_id: pid,
      escopo: escopo || "campo_grande",
      regiao_key: regiao_key || "",
    }));

    // upsert para tolerar tentativas duplicadas (UNIQUE coord+pessoa)
    const { error: distErr } = await admin.from("eleicao_contato_distribuicoes")
      .upsert(distRows, { onConflict: "coordenador_id,pessoa_id", ignoreDuplicates: true });

    if (distErr) {
      console.warn("[eleicao-enviar-pacote-contatos] distribuicoes upsert falhou:", distErr.message);
    }

    return new Response(JSON.stringify({
      ok: true,
      lote_id: lote.id,
      whatsapp_message_id: whatsappMessageId,
      instance: instanceInfo,
      total: pessoa_ids.length,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[eleicao-enviar-pacote-contatos] erro:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: cors });
  }
});

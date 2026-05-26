// Edge function: onboard-whatsapp-instance
// Quando uma instância de WhatsApp não-principal conecta pela primeira vez,
// envia para o próprio número da instância uma mensagem com os links de
// convite dos grupos de região que ela ainda NÃO é membro.
//
// Usado de duas formas:
//   - Automaticamente: o trigger `queue_instance_onboarding` marca
//     `pending_onboarding=true` na conexão; o frontend (StatusWhatsApp)
//     detecta e invoca esta função.
//   - Manualmente: botão "Reenviar onboarding" / "Ver lista" no painel.
//
// Modes: { action: "send" | "preview", client_id, instance_id }
//   - send: envia a mensagem pela própria instância e marca onboarding_sent_at
//   - preview: apenas calcula a lista de pendentes, sem enviar
//
// Nada em eleicao_* é alterado — apenas leitura de grupos_links/grupos_jids.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRIDGE_TIMEOUT_MS = 15000;

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function cleanPhone(raw: string | null | undefined): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function formatPhonePretty(raw: string | null | undefined): string {
  const d = cleanPhone(raw);
  if (d.length < 12) return raw || "—";
  // +55 (11) 9XXXX-XXXX
  const ddd = d.slice(2, 4);
  const rest = d.slice(4);
  if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

async function bridgeSend(bridgeUrl: string, bridgeKey: string, phoneE164: string, message: string) {
  // phoneE164 só com dígitos (ex: 5511999999999). A bridge resolve para @s.whatsapp.net.
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), BRIDGE_TIMEOUT_MS);
  try {
    const res = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": bridgeKey },
      body: JSON.stringify({ action: "send", phone: phoneE164, message }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(async () => ({ error: await res.text().catch(() => "Resposta inválida") }));
    clearTimeout(tid);
    return { ok: res.ok && data?.success !== false, status: res.status, data };
  } catch (err) {
    clearTimeout(tid);
    return { ok: false, status: 0, data: { error: (err as Error).message } };
  }
}

type RegiaoLink = { value: string; label: string; link: string; jaEhMembro: boolean };

function buildMessage(opts: {
  apelido: string;
  phonePretty: string;
  pendentes: RegiaoLink[];
  jaMembrosDe: RegiaoLink[];
}): string {
  const { apelido, phonePretty, pendentes, jaMembrosDe } = opts;
  const total = pendentes.length + jaMembrosDe.length;

  if (total === 0) {
    return [
      `👋 *Olá! Sou seu painel de campanha.*`,
      ``,
      `Esta linha (${phonePretty}) foi conectada como instância *backup* para os disparos.`,
      ``,
      `⚠️ Ainda não há links de grupo cadastrados em *Eleição → Configurações → Links dos grupos*.`,
      ``,
      `Cadastre os links lá e depois clique em *"Reenviar onboarding"* no painel para receber a lista atualizada.`,
    ].join("\n");
  }

  if (pendentes.length === 0) {
    return [
      `✅ *Tudo certo!*`,
      ``,
      `Esta linha (${phonePretty}) já é membro de *todos os ${total} grupos* de região cadastrados.`,
      ``,
      `Está pronta para servir como backup nos disparos. Não precisa fazer mais nada.`,
      ``,
      `💡 *Dica:* peça ao admin de cada grupo para te promover a admin — assim, se a linha principal cair, esta continua mandando mensagem normalmente.`,
    ].join("\n");
  }

  const linhasPendentes = pendentes
    .map((r) => `📍 *${r.label}*\n→ ${r.link}`)
    .join("\n\n");

  return [
    `👋 *Olá! Sou seu painel de campanha.*`,
    ``,
    `Esta linha (${phonePretty}) — *"${apelido}"* — acaba de ser conectada como instância *backup* para os disparos.`,
    ``,
    `Para começar a funcionar como rede de segurança da linha principal, *entre nos grupos abaixo* clicando em cada link. Depois disso, é só me deixar trabalhar — não precisa fazer mais nada.`,
    ``,
    `*Grupos pendentes (${pendentes.length}):*`,
    ``,
    linhasPendentes,
    ``,
    `✅ Já está em: ${jaMembrosDe.length} de ${total} grupos`,
    `⏳ Faltam: ${pendentes.length} grupo(s)`,
    ``,
    `💡 *Dica:* depois de entrar em todos, peça ao admin de cada grupo para te promover a admin — assim, se a linha principal cair, esta linha continua mandando mensagem normalmente.`,
    ``,
    `_Você pode reabrir esta lista a qualquer momento em: Central WhatsApp → Status WhatsApp → "Reenviar onboarding"._`,
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const clientId = body?.client_id as string | undefined;
    const instanceId = body?.instance_id as string | undefined;
    const action = (body?.action as string | undefined) || "send";

    if (!clientId || !instanceId) {
      return jsonResp({ success: false, error: "client_id e instance_id são obrigatórios" }, 400);
    }

    // 1) Carrega a instância
    const { data: inst, error: instErr } = await admin
      .from("whatsapp_instances")
      .select("id, apelido, phone_number, bridge_url, bridge_api_key, is_primary, status, client_id")
      .eq("id", instanceId)
      .eq("client_id", clientId)
      .maybeSingle();

    if (instErr || !inst) return jsonResp({ success: false, error: "Instância não encontrada" }, 404);
    if (!inst.phone_number) return jsonResp({ success: false, error: "Instância ainda sem número associado" }, 400);
    if (!inst.bridge_url || !inst.bridge_api_key) {
      return jsonResp({ success: false, error: "Instância sem bridge configurada" }, 400);
    }

    // 2) Carrega config de Eleição (apenas leitura) — grupos_links + grupos_jids
    const { data: cfg } = await admin
      .from("eleicao_notif_config")
      .select("grupos_links, grupos_jids")
      .eq("client_id", clientId)
      .maybeSingle();

    const gruposLinks: Record<string, string> = (cfg?.grupos_links as any) || {};
    const gruposJids: Record<string, string> = (cfg?.grupos_jids as any) || {};

    // 3) Carrega regiões com label/ordem (apenas leitura)
    const { data: regs } = await admin
      .from("eleicao_regioes")
      .select("value, label, ordem, ativo")
      .eq("client_id", clientId)
      .eq("ativo", true)
      .order("ordem", { ascending: true });

    const regioesAtivas = (regs || []).filter((r: any) => r.value);
    const regioesValueToLabel = new Map<string, string>(
      regioesAtivas.map((r: any) => [r.value, r.label || r.value]),
    );

    // 4) Pega grupos que esta instância já enxerga
    const { data: gruposDessaInst } = await admin
      .from("whatsapp_groups")
      .select("group_jid")
      .eq("client_id", clientId)
      .eq("instance_id", instanceId)
      .eq("is_active", true);

    const jidsDessaInst = new Set<string>((gruposDessaInst || []).map((g: any) => g.group_jid));

    // 5) Monta lista: para cada região com link cadastrado, marca se já é membro
    //    Critério de "já é membro": tem o group_jid daquela região E está em jidsDessaInst.
    const todasRegioesComLink = Object.entries(gruposLinks)
      .filter(([, link]) => typeof link === "string" && link.trim().startsWith("https://chat.whatsapp.com/"))
      .map(([value, link]) => {
        const jidDaRegiao = gruposJids[value];
        const jaEhMembro = !!jidDaRegiao && jidsDessaInst.has(jidDaRegiao);
        return {
          value,
          label: regioesValueToLabel.get(value) || value,
          link: String(link),
          jaEhMembro,
        } as RegiaoLink;
      })
      // ordena pela ordem das regiões ativas; valores fora caem no fim
      .sort((a, b) => {
        const ordemMap = new Map(regioesAtivas.map((r: any, i: number) => [r.value, i]));
        const ia = ordemMap.get(a.value) ?? 9999;
        const ib = ordemMap.get(b.value) ?? 9999;
        return ia - ib;
      });

    const pendentes = todasRegioesComLink.filter((r) => !r.jaEhMembro);
    const jaMembrosDe = todasRegioesComLink.filter((r) => r.jaEhMembro);

    // 6) Modo preview: retorna lista sem enviar
    if (action === "preview") {
      return jsonResp({
        success: true,
        pending_count: pendentes.length,
        already_member_count: jaMembrosDe.length,
        total_with_link: todasRegioesComLink.length,
        pendentes,
        ja_membros_de: jaMembrosDe,
      });
    }

    // 7) Envia para a própria instância
    const phoneE164 = cleanPhone(inst.phone_number);
    if (!phoneE164 || phoneE164.length < 12) {
      return jsonResp({ success: false, error: `Número da instância inválido: ${inst.phone_number}` }, 400);
    }

    const message = buildMessage({
      apelido: inst.apelido || "Backup",
      phonePretty: formatPhonePretty(inst.phone_number),
      pendentes,
      jaMembrosDe,
    });

    const { ok, status, data: sendData } = await bridgeSend(
      inst.bridge_url,
      inst.bridge_api_key,
      phoneE164,
      message,
    );

    if (!ok) {
      // Não marca onboarding_sent_at; deixa pending_onboarding=true para retry.
      return jsonResp({
        success: false,
        error: sendData?.error || `Bridge retornou ${status}`,
        pending_count: pendentes.length,
      }, 502);
    }

    // 8) Marca onboarding_sent_at e limpa pending_onboarding
    await admin.from("whatsapp_instances")
      .update({
        onboarding_sent_at: new Date().toISOString(),
        onboarding_pending_count: pendentes.length,
        pending_onboarding: false,
      })
      .eq("id", instanceId);

    return jsonResp({
      success: true,
      pending_count: pendentes.length,
      already_member_count: jaMembrosDe.length,
      total_with_link: todasRegioesComLink.length,
      phone: phoneE164,
    });
  } catch (err) {
    console.error("[onboard-whatsapp-instance] fatal:", err);
    return jsonResp({ success: false, error: (err as Error).message }, 500);
  }
});

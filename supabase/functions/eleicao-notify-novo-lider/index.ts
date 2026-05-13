import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(p: string) {
  const digits = (p || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function fmtPhone(s: string) {
  const d = (s || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
}

function applyTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

const REGIAO_LABELS: Record<string, string> = {
  centro: "Centro", segredo: "Segredo", prosa: "Prosa", bandeira: "Bandeira",
  anhanduizinho: "Anhanduizinho", lagoa: "Lagoa", imbirussu: "Imbirussu", moreninha: "Moreninha",
};

async function getBridge(admin: any, clientId: string) {
  const { data: pickedId } = await admin.rpc("pick_healthy_whatsapp_instance", { p_client_id: clientId });
  if (pickedId) {
    const { data: inst } = await admin.from("whatsapp_instances")
      .select("bridge_url, bridge_api_key").eq("id", pickedId).maybeSingle();
    if (inst?.bridge_url && inst?.bridge_api_key) return { url: inst.bridge_url, key: inst.bridge_api_key };
  }
  const { data: inst } = await admin.from("whatsapp_instances")
    .select("bridge_url, bridge_api_key")
    .eq("client_id", clientId).eq("is_active", true)
    .not("bridge_url", "is", null).not("bridge_api_key", "is", null)
    .order("is_primary", { ascending: false }).limit(1).maybeSingle();
  if (inst?.bridge_url && inst?.bridge_api_key) return { url: inst.bridge_url, key: inst.bridge_api_key };
  const { data: client } = await admin.from("clients")
    .select("whatsapp_bridge_url, whatsapp_bridge_api_key").eq("id", clientId).maybeSingle();
  if (client?.whatsapp_bridge_url && client?.whatsapp_bridge_api_key) {
    return { url: client.whatsapp_bridge_url, key: client.whatsapp_bridge_api_key };
  }
  return null;
}

async function bridgeSend(url: string, key: string, phone: string, message: string) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": key },
      body: JSON.stringify({ action: "send", phone, message }),
    });
    const data = await res.json().catch(() => ({}));
    const messageId = data?.messageId || data?.message_id || data?.id || data?.key?.id || data?.data?.id || data?.data?.key?.id || data?.result?.id || data?.result?.key?.id;
    const ok = res.ok && data?.success !== false && data?.delivered !== false && (data?.delivered === true || Boolean(messageId));
    const error = !res.ok
      ? (data?.error || data?.message || `HTTP ${res.status}`)
      : data?.success === false
        ? (data?.error || data?.message || "Ponte recusou o envio")
        : data?.delivered === false
          ? (data?.error || data?.message || "Mensagem não entregue pelo WhatsApp")
          : ok
            ? null
            : (data?.error || data?.message || "Ponte não confirmou entrega da mensagem");
    return { ok, error };
  } catch (e: any) {
    return { ok: false, error: e.message || "Erro de rede" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { pessoa_id } = await req.json();
    if (!pessoa_id) throw new Error("pessoa_id obrigatório");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: pessoa } = await admin.from("eleicao_pessoas")
      .select("id, client_id, nome, telefone, tipo, escopo, regiao, parent_id, rua, numero, bairro, endereco")
      .eq("id", pessoa_id).maybeSingle();
    if (!pessoa) throw new Error("Pessoa não encontrada");
    if (pessoa.tipo !== "lider") {
      return new Response(JSON.stringify({ success: true, skipped: "Não é líder" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: isSuper } = await userClient.rpc("is_super_admin");
    let canAccess = !!isSuper;
    if (!canAccess) {
      const { data: ca } = await userClient.rpc("user_can_access_client", { _client_id: pessoa.client_id });
      canAccess = !!ca;
    }
    if (!canAccess) return new Response(JSON.stringify({ error: "Sem permissão" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: cfg } = await admin.from("eleicao_notif_config")
      .select("*").eq("client_id", pessoa.client_id).maybeSingle();
    if (!cfg || !cfg.auto_enviar) {
      return new Response(JSON.stringify({ success: true, skipped: "auto_enviar desativado ou não configurado" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const bridge = await getBridge(admin, pessoa.client_id);
    if (!bridge) {
      return new Response(JSON.stringify({ success: false, error: "Sem instância WhatsApp configurada" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const regiaoLabel = pessoa.regiao ? (REGIAO_LABELS[pessoa.regiao] || pessoa.regiao) : "—";
    const linkGrupo = (cfg.grupos_links && pessoa.regiao) ? (cfg.grupos_links[pessoa.regiao] || "") : "";
    const vars = {
      nome: pessoa.nome,
      regiao: regiaoLabel,
      telefone: fmtPhone(pessoa.telefone),
      rua: pessoa.rua || pessoa.endereco || "—",
      numero: pessoa.numero || "s/n",
      bairro: pessoa.bairro || "—",
      link_grupo: linkGrupo || "(grupo não configurado)",
    };

    const msgInterno = applyTemplate(cfg.template_coordenador, vars);
    const msgLider = applyTemplate(cfg.template_lider, vars);

    const results: Record<string, { sent: boolean; error?: string; reason?: string }> = {};

    // 1) Coordenador da região
    let coordPhone: string | null = null;
    if (pessoa.parent_id) {
      const { data: parent } = await admin.from("eleicao_pessoas")
        .select("telefone, tipo").eq("id", pessoa.parent_id).maybeSingle();
      if (parent?.tipo === "coordenador" && parent.telefone) coordPhone = parent.telefone;
    }
    if (!coordPhone && pessoa.regiao && pessoa.escopo === "campo_grande") {
      const { data: coord } = await admin.from("eleicao_pessoas")
        .select("telefone")
        .eq("client_id", pessoa.client_id)
        .eq("tipo", "coordenador")
        .eq("escopo", "campo_grande")
        .eq("regiao", pessoa.regiao)
        .order("created_at", { ascending: true })
        .limit(1).maybeSingle();
      if (coord?.telefone) coordPhone = coord.telefone;
    }
    if (coordPhone) {
      const r = await bridgeSend(bridge.url, bridge.key, normalizePhone(coordPhone), msgInterno);
      results.coordenador = { sent: r.ok, error: r.error || undefined };
    } else {
      results.coordenador = { sent: false, reason: "Sem coordenador na região" };
    }

    // 2) Secretaria
    if (cfg.secretaria_telefone) {
      const r = await bridgeSend(bridge.url, bridge.key, normalizePhone(cfg.secretaria_telefone), msgInterno);
      results.secretaria = { sent: r.ok, error: r.error || undefined };
    } else {
      results.secretaria = { sent: false, reason: "Telefone da secretaria não configurado" };
    }

    // 3) Líder cadastrado
    if (pessoa.telefone) {
      const r = await bridgeSend(bridge.url, bridge.key, normalizePhone(pessoa.telefone), msgLider);
      results.lider = { sent: r.ok, error: r.error || undefined };
    } else {
      results.lider = { sent: false, reason: "Sem telefone" };
    }

    return new Response(JSON.stringify({ success: true, results }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

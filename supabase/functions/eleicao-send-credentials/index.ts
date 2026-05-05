import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function genPassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) s += chars[arr[i] % chars.length];
  return s;
}

function normalizePhone(p: string) {
  const digits = (p || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return "55" + digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { pessoa_id, channel } = await req.json(); // channel: "whatsapp" | "link_only"

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
      .select("id, client_id, nome, telefone, email, user_id, tipo")
      .eq("id", pessoa_id).maybeSingle();
    if (!pessoa) return new Response(JSON.stringify({ error: "Pessoa não encontrada" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: canAccess } = await admin.rpc("user_can_access_client", { _client_id: pessoa.client_id });
    if (!canAccess) return new Response(JSON.stringify({ error: "Sem permissão" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    // Gera senha temporária e cria/atualiza conta
    const password = genPassword(10);
    const emailNorm = (pessoa.email || `coord-${pessoa.id.slice(0,8)}@portal.local`).toLowerCase();

    let userId = pessoa.user_id as string | null;
    if (!userId) {
      const { data: list } = await admin.auth.admin.listUsers();
      const found = list?.users?.find((u: any) => (u.email || "").toLowerCase() === emailNorm);
      userId = found?.id || null;
    }
    if (userId) {
      await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    } else {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: emailNorm, password, email_confirm: true,
        user_metadata: { full_name: pessoa.nome },
      });
      if (cErr) throw cErr;
      userId = created.user!.id;
    }
    await admin.from("eleicao_pessoas").update({ email: emailNorm, user_id: userId }).eq("id", pessoa_id);

    const portalUrl = `${Deno.env.get("PUBLIC_APP_URL") || "https://app.lovable.dev"}/portal/${pessoa.client_id}`;
    const message =
      `🗳️ *Acesso ao Portal da Campanha*\n\n` +
      `Olá ${pessoa.nome}! Seu acesso de coordenador foi liberado.\n\n` +
      `🔗 Link: ${portalUrl}\n` +
      `👤 E-mail: ${emailNorm}\n` +
      `🔑 Senha: ${password}\n\n` +
      `_Guarde esta mensagem. Você poderá cadastrar seus líderes e cabos eleitorais por lá._`;

    if (channel === "link_only") {
      return new Response(JSON.stringify({ success: true, portal_url: portalUrl, email: emailNorm, password, message }),
        { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Envia via bridge WhatsApp do client
    const phone = normalizePhone(pessoa.telefone);
    if (!phone) throw new Error("Telefone inválido");

    const { data: client } = await admin.from("clients")
      .select("whatsapp_bridge_url, whatsapp_bridge_api_key")
      .eq("id", pessoa.client_id).maybeSingle();

    let bridgeUrl = client?.whatsapp_bridge_url;
    let bridgeKey = client?.whatsapp_bridge_api_key;
    if (!bridgeUrl || !bridgeKey) {
      const { data: inst } = await admin.from("whatsapp_instances")
        .select("bridge_url, bridge_api_key")
        .eq("client_id", pessoa.client_id).eq("active", true).limit(1).maybeSingle();
      bridgeUrl = inst?.bridge_url || bridgeUrl;
      bridgeKey = inst?.bridge_api_key || bridgeKey;
    }
    if (!bridgeUrl || !bridgeKey) {
      return new Response(JSON.stringify({
        success: true, sent: false, portal_url: portalUrl, email: emailNorm, password, message,
        warning: "Sem instância WhatsApp configurada. Copie e envie manualmente.",
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const res = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": bridgeKey },
      body: JSON.stringify({ action: "send", phone, message }),
    });
    const sendData = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(JSON.stringify({
        success: true, sent: false, portal_url: portalUrl, email: emailNorm, password, message,
        warning: `Falha no envio (${res.status}): ${sendData?.error || "erro desconhecido"}`,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true, sent: true, portal_url: portalUrl, email: emailNorm, password, message,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

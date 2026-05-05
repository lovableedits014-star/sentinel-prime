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
  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const local = digits.slice(4);
    return local.length === 9 && local.startsWith("9") ? `55${ddd}${local.slice(1)}` : digits;
  }
  if (digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const local = digits.slice(2);
    return local.length === 9 && local.startsWith("9") ? `55${ddd}${local.slice(1)}` : `55${digits}`;
  }
  return digits.startsWith("55") ? digits : "55" + digits;
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function bridgeSend(bridgeUrl: string, bridgeKey: string, phone: string, message: string) {
  const res = await fetch(bridgeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": bridgeKey },
    body: JSON.stringify({ action: "send", phone, message }),
  });
  const data = await res.json().catch(async () => ({ error: await res.text().catch(() => "Resposta inválida da ponte") }));
  return { res, data };
}

function sendFailure(res: Response, data: any) {
  if (!res.ok) return data?.error || `Erro na ponte WhatsApp (status ${res.status})`;
  if (data?.success === false) return data?.error || "Ponte recusou o envio";
  if (data?.delivered === false) return data?.error || "Mensagem não entregue pelo WhatsApp";
  const confirmed = data?.delivered === true || Boolean(data?.messageId || data?.message_id || data?.id || data?.key?.id);
  return confirmed ? null : (data?.error || "Ponte não confirmou o envio da mensagem");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { pessoa_id, channel, app_url, email, password: providedPassword } = await req.json(); // channel: "whatsapp" | "link_only"
    const emailInput = typeof email === "string" ? email.trim().toLowerCase() : "";
    const passwordInput = typeof providedPassword === "string" ? providedPassword : "";
    if (emailInput && !validEmail(emailInput)) {
      return new Response(JSON.stringify({ error: "E-mail inválido" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (passwordInput && passwordInput.length < 6) {
      return new Response(JSON.stringify({ error: "Senha deve ter no mínimo 6 caracteres" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

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

    const { data: isSuper } = await userClient.rpc("is_super_admin");
    let canAccess = !!isSuper;
    if (!canAccess) {
      const { data: ca } = await userClient.rpc("user_can_access_client", { _client_id: pessoa.client_id });
      canAccess = !!ca;
    }
    if (!canAccess) return new Response(JSON.stringify({ error: "Sem permissão" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    // Gera senha temporária e cria/atualiza conta
    const password = passwordInput || genPassword(10);
    const emailNorm = (emailInput || pessoa.email || `coord-${pessoa.id.slice(0,8)}@portal.local`).toLowerCase();

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

    const baseUrl = (app_url || req.headers.get("origin") || Deno.env.get("PUBLIC_APP_URL") || "").replace(/\/$/, "");
    const portalUrl = `${baseUrl}/portal/${pessoa.client_id}`;
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

    // Usa a mesma seleção do sistema de disparos: instância conectada saudável, depois pool ativo, depois legado.
    let bridgeUrl: string | null = null;
    let bridgeKey: string | null = null;
    let instanceId: string | null = null;

    const { data: pickedId } = await admin.rpc("pick_healthy_whatsapp_instance", { p_client_id: pessoa.client_id });
    if (pickedId) {
      const { data: inst } = await admin.from("whatsapp_instances")
        .select("id, bridge_url, bridge_api_key")
        .eq("id", pickedId).maybeSingle();
      if (inst?.bridge_url && inst?.bridge_api_key) {
        bridgeUrl = inst.bridge_url;
        bridgeKey = inst.bridge_api_key;
        instanceId = inst.id;
      }
    }

    if (!bridgeUrl || !bridgeKey) {
      const { data: inst } = await admin.from("whatsapp_instances")
        .select("id, bridge_url, bridge_api_key, is_primary, status")
        .eq("client_id", pessoa.client_id)
        .eq("is_active", true)
        .not("bridge_url", "is", null)
        .not("bridge_api_key", "is", null)
        .order("is_primary", { ascending: false })
        .order("status", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (inst?.bridge_url && inst?.bridge_api_key) {
        bridgeUrl = inst.bridge_url;
        bridgeKey = inst.bridge_api_key;
        instanceId = inst.id;
      }
    }

    if (!bridgeUrl || !bridgeKey) {
      const { data: client } = await admin.from("clients")
        .select("whatsapp_bridge_url, whatsapp_bridge_api_key")
        .eq("id", pessoa.client_id).maybeSingle();
      bridgeUrl = bridgeUrl || client?.whatsapp_bridge_url || null;
      bridgeKey = bridgeKey || client?.whatsapp_bridge_api_key || null;
    }
    if (!bridgeUrl || !bridgeKey) {
      return new Response(JSON.stringify({
        success: true, sent: false, portal_url: portalUrl, email: emailNorm, password, message,
        warning: "Sem instância WhatsApp configurada. Copie e envie manualmente.",
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { res, data: sendData } = await bridgeSend(bridgeUrl, bridgeKey, phone, message);
    const failure = sendFailure(res, sendData);
    if (failure) {
      if (instanceId) {
        await admin.rpc("log_whatsapp_send", {
          p_instance_id: instanceId, p_client_id: pessoa.client_id, p_dispatch_id: null,
          p_success: false, p_error_message: String(failure).slice(0, 200),
          p_preflight_status: "skipped", p_preflight_reconnected: false,
        });
      }
      return new Response(JSON.stringify({
        success: true, sent: false, portal_url: portalUrl, email: emailNorm, password, message,
        warning: `Falha no envio: ${failure}`,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (instanceId) {
      await admin.rpc("log_whatsapp_send", {
        p_instance_id: instanceId, p_client_id: pessoa.client_id, p_dispatch_id: null,
        p_success: true, p_error_message: null,
        p_preflight_status: "skipped", p_preflight_reconnected: false,
      });
    }

    return new Response(JSON.stringify({
      success: true, sent: true, portal_url: portalUrl, email: emailNorm, password, message,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

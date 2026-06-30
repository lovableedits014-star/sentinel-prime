// Edge function: eleicao-check-grupo-membros
// Sincroniza os participantes dos grupos de WhatsApp configurados por região
// e recalcula o status de entrada de cada pessoa (cabo / líder / coordenador).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRIDGE_TIMEOUT_MS = 20000;
const THROTTLE_MS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cleanPhoneForBridge(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function normalizeRawJid(value: unknown): string {
  return String(value || "").replace(/:\d+(?=@)/, "").trim().toLowerCase();
}

function phoneFromJid(value: unknown): string | null {
  const jid = normalizeRawJid(value);
  if (!jid.includes("@s.whatsapp.net") && !jid.includes("@c.us")) return null;
  const digits = jid.split("@")[0].replace(/\D/g, "");
  return digits ? cleanPhoneForBridge(digits) : null;
}

function extractParticipantPhone(p: any): string | null {
  const direct = firstDefined(
    p?.phone_e164,
    p?.phoneE164,
    p?.phone_number,
    p?.phoneNumber,
    p?.number,
    p?.msisdn,
    p?.participant?.phone_e164,
    p?.participant?.phone,
    p?.contact?.phone_e164,
    p?.contact?.phone,
  );
  const cleanedDirect = cleanPhoneForBridge(String(direct || ""));
  if (cleanedDirect && cleanedDirect.length >= 12) return cleanedDirect;

  const jidPhone = phoneFromJid(firstDefined(p?.id, p?.jid, p?.participant, p?.user, p?.phone));
  return jidPhone && jidPhone.length >= 12 ? jidPhone : null;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function bridgeAction(bridgeUrl: string, bridgeKey: string, body: Record<string, unknown>) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), BRIDGE_TIMEOUT_MS);
  try {
    const res = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": bridgeKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(async () => ({ error: await res.text().catch(() => "Resposta inválida") }));
    clearTimeout(tid);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(tid);
    return { ok: false, status: 0, data: { error: (err as Error).message } };
  }
}

async function getBridge(admin: any, clientId: string) {
  const { data: pickedId } = await admin.rpc("pick_healthy_whatsapp_instance", { p_client_id: clientId });
  if (pickedId) {
    const { data: inst } = await admin.from("whatsapp_instances")
      .select("id, bridge_url, bridge_api_key")
      .eq("id", pickedId).maybeSingle();
    if (inst?.bridge_url && inst?.bridge_api_key) return inst;
  }
  const { data: anyActive } = await admin.from("whatsapp_instances")
    .select("id, bridge_url, bridge_api_key")
    .eq("client_id", clientId).eq("is_active", true)
    .not("bridge_url", "is", null).not("bridge_api_key", "is", null)
    .order("is_primary", { ascending: false })
    .limit(1).maybeSingle();
  return anyActive || null;
}

// Resolve a região + escopo da pessoa subindo pela cadeia parent_id se preciso.
async function resolveRegiao(
  admin: any,
  pessoa: any,
  cache: Map<string, any>,
): Promise<{ regiao: string | null; escopo: string | null }> {
  let escopo: string | null = (pessoa as any)?.escopo ?? null;
  if (pessoa.regiao) return { regiao: pessoa.regiao, escopo };
  let current = pessoa;
  for (let i = 0; i < 5 && current?.parent_id; i++) {
    let parent = cache.get(current.parent_id);
    if (!parent) {
      const { data } = await admin.from("eleicao_pessoas")
        .select("id, regiao, parent_id, escopo").eq("id", current.parent_id).maybeSingle();
      parent = data;
      if (parent) cache.set(parent.id, parent);
    }
    if (!parent) return { regiao: null, escopo };
    if (!escopo && (parent as any).escopo) escopo = (parent as any).escopo;
    if (parent.regiao) return { regiao: parent.regiao, escopo };
    current = parent;
  }
  return { regiao: null, escopo };
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
    if (!clientId) return jsonResp({ success: false, error: "client_id obrigatório" }, 400);

    // 1. Pega config + bridge
    const { data: cfg } = await admin.from("eleicao_notif_config")
      .select("grupos_jids").eq("client_id", clientId).maybeSingle();
    const gruposJids: Record<string, string> = (cfg?.grupos_jids as any) || {};

    const bridge = await getBridge(admin, clientId);
    if (!bridge) return jsonResp({ success: false, error: "Nenhuma instância WhatsApp ativa" }, 400);

    const regioesComGrupo = Object.entries(gruposJids).filter(([, jid]) => !!jid);
    const summary: any = { regioes_sincronizadas: 0, participantes_total: 0, anonimos_total: 0, erros: [] as any[] };
    const nowIso = new Date().toISOString();

    // 2. Para cada região com grupo configurado, busca participantes e upsert
    for (const [regiao, groupJid] of regioesComGrupo) {
      const { ok, status, data } = await bridgeAction(bridge.bridge_url, bridge.bridge_api_key, {
        action: "group_participants",
        group_jid: groupJid,
      });

      if (!ok || data?.success === false) {
        summary.erros.push({ regiao, group_jid: groupJid, status, error: data?.error || "falha" });
        await sleep(THROTTLE_MS);
        continue;
      }

      const participants: any[] = Array.isArray(data?.participants) ? data.participants : [];

      // Upsert
      const rows = participants.map((p) => {
        const rawJid = normalizeRawJid(firstDefined(p?.id, p?.jid, p?.participant, p?.user, p?.phone));
        const phone = extractParticipantPhone(p);
        return {
          client_id: clientId,
          instance_id: bridge.id,
          group_jid: groupJid,
          phone_e164: phone,
          raw_jid: rawJid,
          is_lid_only: !phone && (Boolean(p?.lid_only) || rawJid.endsWith("@lid")),
          is_admin: Boolean(p?.admin) && String(p.admin).toLowerCase() !== "false",
          last_seen_at: nowIso,
          left_seen_at: null,
        };
      }).filter((r) => r.raw_jid);

      if (rows.length > 0) {
        await admin.from("whatsapp_group_participants")
          .upsert(rows, { onConflict: "instance_id,group_jid,raw_jid", ignoreDuplicates: false });
      }

      // Marca como "saiu" quem estava antes e não veio agora
      const rawJidsAtuais = rows.map((r) => r.raw_jid);
      if (rawJidsAtuais.length > 0) {
        await admin.from("whatsapp_group_participants")
          .update({ left_seen_at: nowIso })
          .eq("instance_id", bridge.id)
          .eq("group_jid", groupJid)
          .is("left_seen_at", null)
          .not("raw_jid", "in", `(${rawJidsAtuais.map((j) => `"${j}"`).join(",")})`);
      }

      summary.regioes_sincronizadas++;
      summary.participantes_total += rows.length;
      summary.anonimos_total += rows.filter((r) => r.is_lid_only).length;

      await sleep(THROTTLE_MS);
    }

    // 3. Recalcula status por pessoa
    const { data: pessoas } = await admin.from("eleicao_pessoas")
      .select("id, regiao, parent_id, telefone, tipo, escopo")
      .eq("client_id", clientId)
      .in("tipo", ["cabo", "lider", "coordenador"]);

    const cache = new Map<string, any>();
    if (pessoas) for (const p of pessoas) cache.set(p.id, p);

    // Carrega participantes ativos para lookup rápido (por group_jid + phone_e164)
    const { data: parts } = await admin.from("whatsapp_group_participants")
      .select("group_jid, phone_e164, first_seen_at, left_seen_at")
      .eq("client_id", clientId)
      .is("left_seen_at", null);

    const lookup = new Map<string, { first_seen_at: string }>();
    for (const p of parts || []) {
      if (p.phone_e164) lookup.set(`${p.group_jid}|${p.phone_e164}`, { first_seen_at: p.first_seen_at });
    }

    const statusRows: any[] = [];
    let entrou = 0, pendente = 0, semGrupo = 0, semTelefone = 0;

    for (const pessoa of pessoas || []) {
      const { regiao, escopo } = await resolveRegiao(admin, pessoa, cache);
      // Interior usa o grupo único __interior__; demais regiões usam o JID por nome da região.
      const groupJid = escopo === "interior"
        ? (gruposJids["__interior__"] || null)
        : (regiao ? gruposJids[regiao] : null);
      let status: string;
      let entrouVisto: string | null = null;

      if (!groupJid) { status = "sem_grupo"; semGrupo++; }
      else if (!pessoa.telefone) { status = "sem_telefone"; semTelefone++; }
      else {
        const phone = cleanPhoneForBridge(pessoa.telefone);
        const hit = lookup.get(`${groupJid}|${phone}`);
        if (hit) { status = "entrou"; entrouVisto = hit.first_seen_at; entrou++; }
        else { status = "pendente"; pendente++; }
      }

      statusRows.push({
        pessoa_id: pessoa.id,
        client_id: clientId,
        group_jid: groupJid,
        status,
        entrou_visto_em: entrouVisto,
        verificado_em: nowIso,
      });
    }

    if (statusRows.length > 0) {
      // Upsert em lotes de 500
      for (let i = 0; i < statusRows.length; i += 500) {
        const chunk = statusRows.slice(i, i + 500);
        const { error } = await admin.from("eleicao_pessoa_grupo_status")
          .upsert(chunk, { onConflict: "pessoa_id" });
        if (error) summary.erros.push({ stage: "upsert_status", error: error.message });
      }
    }

    return jsonResp({
      success: true,
      summary: {
        ...summary,
        pessoas_total: (pessoas || []).length,
        entrou, pendente, sem_grupo: semGrupo, sem_telefone: semTelefone,
      },
    });
  } catch (e) {
    console.error("[eleicao-check-grupo-membros] erro:", e);
    return jsonResp({ success: false, error: (e as Error).message }, 500);
  }
});

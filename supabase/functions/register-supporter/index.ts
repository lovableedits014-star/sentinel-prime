import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ParsedProfile = {
  platform: "facebook" | "instagram";
  /** username/handle/ID já resolvido. Quando null, há `pendingShareUrl` para resolver via redirect. */
  username: string | null;
  pendingShareUrl?: string;
};

function parseProfileUrl(url: string): ParsedProfile | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Facebook share link → não geramos placeholder; deixamos para o resolver seguir o redirect
  const fbShareMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?facebook\.com\/share(?:\/[a-z]+)?\/([a-zA-Z0-9._-]+)\/?/i
  );
  if (fbShareMatch?.[1]) {
    return { platform: "facebook", username: null, pendingShareUrl: trimmed };
  }

  const fbPatterns = [
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?facebook\.com\/(?:profile\.php\?id=(\d+))/i,
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?facebook\.com\/([a-zA-Z0-9._-]+)\/?/i,
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?fb\.com\/([a-zA-Z0-9._-]+)\/?/i,
  ];
  for (const pattern of fbPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const u = match[1];
      if (["groups","pages","events","watch","marketplace","gaming","reel","stories","photo","permalink"].includes(u.toLowerCase())) continue;
      return { platform: "facebook", username: u };
    }
  }

  // Instagram share link → também resolve via redirect
  const igShareMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/share\/([a-zA-Z0-9._-]+)\/?/i
  );
  if (igShareMatch?.[1]) {
    return { platform: "instagram", username: null, pendingShareUrl: trimmed };
  }

  const igPatterns = [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?/i,
    /(?:https?:\/\/)?(?:www\.)?instagr\.am\/([a-zA-Z0-9._]+)\/?/i,
  ];
  for (const pattern of igPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const u = match[1];
      if (["p","reel","stories","explore","direct","accounts","about"].includes(u.toLowerCase())) continue;
      return { platform: "instagram", username: u };
    }
  }

  return null;
}

/** Tenta resolver um link de share chamando a edge function resolve-social-link. */
async function resolveShareUrl(
  shareUrl: string,
  platform: "facebook" | "instagram",
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/resolve-social-link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: shareUrl, platform }),
    });
    const data = await res.json();
    return data?.resolved && data?.usuario ? String(data.usuario) : null;
  } catch (e) {
    console.warn("resolveShareUrl falhou:", e);
    return null;
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  const wordsA = na.split(" ").filter(w => w.length > 2);
  const wordsB = nb.split(" ").filter(w => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const longer = wordsA.length <= wordsB.length ? wordsB : wordsA;
  const matchCount = shorter.filter(w => longer.some(lw => lw.includes(w) || w.includes(lw))).length;
  return matchCount >= Math.ceil(shorter.length * 0.7);
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      client_id, name, facebook_url, instagram_url, phone, notes, referral_code,
      city, neighborhood, state, endereco, cpf, birth_date,
    } = await req.json();

    if (!client_id || !name?.trim()) {
      return new Response(JSON.stringify({ success: false, error: "Nome e client_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!city?.trim() || !neighborhood?.trim()) {
      return new Response(JSON.stringify({ success: false, error: "Cidade e bairro são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!phone?.trim()) {
      return new Response(JSON.stringify({ success: false, error: "Telefone é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cpfDigits = (cpf || "").toString().replace(/\D/g, "") || null;
    const phoneDigits = (phone || "").toString().replace(/\D/g, "") || null;

    const rawProfiles: ParsedProfile[] = [];
    if (facebook_url) {
      const parsed = parseProfileUrl(facebook_url);
      if (parsed) rawProfiles.push(parsed);
    }
    if (instagram_url) {
      const parsed = parseProfileUrl(instagram_url);
      if (parsed) rawProfiles.push(parsed);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Resolver share links ANTES de qualquer validação/inserção (evita placeholder share_xxx)
    const profiles: { platform: "facebook" | "instagram"; username: string }[] = [];
    const pendingShares: { platform: "facebook" | "instagram"; url: string }[] = [];
    for (const p of rawProfiles) {
      if (p.username) {
        profiles.push({ platform: p.platform, username: p.username });
      } else if (p.pendingShareUrl) {
        const resolved = await resolveShareUrl(p.pendingShareUrl, p.platform, supabaseUrl, serviceRoleKey);
        if (resolved) {
          profiles.push({ platform: p.platform, username: resolved });
        } else {
          // Falhou — guardamos para registrar nas notas; NÃO criamos perfil inválido
          pendingShares.push({ platform: p.platform, url: p.pendingShareUrl });
        }
      }
    }

    // Verify client exists
    const { data: client } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", client_id)
      .single();

    if (!client) {
      return new Response(JSON.stringify({ success: false, error: "Cliente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if any profile username already exists
    if (profiles.length > 0) {
      const { data: existing } = await supabase
        .from("supporter_profiles")
        .select("supporter_id, platform_user_id")
        .in("platform_user_id", profiles.map(p => p.username));

      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({
          success: false,
          error: "Um ou mais perfis já estão cadastrados. Você já é um apoiador!",
        }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Resolve referral code if provided
    let referrerAccountId: string | null = null;
    let referrerName: string | null = null;
    if (referral_code) {
      const { data: refCode } = await supabase
        .from("referral_codes")
        .select("supporter_account_id, supporter_accounts!inner(name)")
        .eq("code", referral_code.toUpperCase())
        .eq("client_id", client_id)
        .maybeSingle();

      if (refCode) {
        referrerAccountId = refCode.supporter_account_id;
        referrerName = (refCode as any).supporter_accounts?.name || null;
      }
    }

    // Try to find an existing supporter by name (fuzzy match)
    const { data: existingSupporters } = await supabase
      .from("supporters")
      .select("id, name")
      .eq("client_id", client_id);

    let supporterId: string | null = null;
    let isExisting = false;

    if (existingSupporters && existingSupporters.length > 0) {
      const matched = existingSupporters.find(s => namesMatch(s.name, name.trim()));
      if (matched) {
        supporterId = matched.id;
        isExisting = true;
        console.log(`Matched existing supporter: "${matched.name}" for name "${name.trim()}"`);
      }
    }

    if (!supporterId) {
      const { data: supporter, error: supError } = await supabase
        .from("supporters")
        .insert({
          client_id,
          name: name.trim(),
          classification: "apoiador_ativo",
          cpf: cpfDigits,
          telefone: phoneDigits,
          birth_date: birth_date || null,
          endereco: endereco?.trim() || null,
          cidade: city?.trim() || null,
          bairro: neighborhood?.trim() || null,
          notes: [
            notes?.trim(),
            phone?.trim() ? `Tel: ${phone.trim()}` : null,
            ...pendingShares.map(s => `Share não resolvido (${s.platform}): ${s.url}`),
          ].filter(Boolean).join(" | ") || null,
        })
        .select()
        .single();

      if (supError) throw supError;
      supporterId = supporter.id;
    } else {
      const updateData: Record<string, unknown> = {
        classification: "apoiador_ativo",
        cpf: cpfDigits,
        telefone: phoneDigits,
        birth_date: birth_date || null,
        endereco: endereco?.trim() || null,
        cidade: city?.trim() || null,
        bairro: neighborhood?.trim() || null,
      };
      const extraNotes = [
        notes?.trim(),
        phone?.trim() ? `Tel: ${phone.trim()}` : null,
        ...pendingShares.map(s => `Share não resolvido (${s.platform}): ${s.url}`),
      ].filter(Boolean).join(" | ");
      if (extraNotes) updateData.notes = extraNotes;
      await supabase.from("supporters").update(updateData).eq("id", supporterId);
    }

    // Create profiles (link social accounts)
    for (const p of profiles) {
      let avatarUrl: string | null = null;
      if (p.platform === "facebook") {
        avatarUrl = `https://graph.facebook.com/${p.username}/picture?type=large&redirect=true`;
      }
      const { error: profileError } = await supabase.from("supporter_profiles").insert({
        supporter_id: supporterId,
        platform: p.platform,
        platform_user_id: p.username,
        platform_username: p.username,
        profile_picture_url: avatarUrl,
      });
      if (profileError) console.error("Profile insert error:", profileError);
    }

    // Link orphan actions
    await supabase.rpc("link_orphan_engagement_actions", { p_client_id: client_id });
    await supabase.rpc("calculate_engagement_score", { p_supporter_id: supporterId, p_days: 30 });

    // Create or update pessoa record in CRM (so apoiador appears in Base Política)
    try {
      const { data: existingPessoa } = await supabase
        .from("pessoas")
        .select("id")
        .eq("client_id", client_id)
        .eq("supporter_id", supporterId)
        .maybeSingle();

      const pessoaPayload: Record<string, unknown> = {
        nome: name.trim(),
        telefone: phoneDigits,
        cpf: cpfDigits,
        endereco: endereco?.trim() || null,
        data_nascimento: birth_date || null,
        cidade: city?.trim() || null,
        bairro: neighborhood?.trim() || null,
        tipo_pessoa: "apoiador",
        nivel_apoio: "apoiador",
        origem_contato: "formulario",
        supporter_id: supporterId,
        notas_internas: notes?.trim() || null,
      };

      let pessoaId = existingPessoa?.id || null;
      if (pessoaId) {
        const { error: pessoaUpdateError } = await supabase
          .from("pessoas")
          .update(pessoaPayload)
          .eq("id", pessoaId);
        if (pessoaUpdateError) console.error("Pessoa update error:", pessoaUpdateError);
      } else {
        const { data: pessoaInserted, error: pessoaError } = await supabase
          .from("pessoas")
          .insert({ client_id, ...pessoaPayload })
          .select("id")
          .single();

        if (pessoaError) {
          console.error("Pessoa insert error:", pessoaError);
        } else {
          pessoaId = pessoaInserted.id;
        }
      }

      if (pessoaId && profiles.length > 0) {
        for (const p of profiles) {
          const { data: existingSocial } = await supabase
            .from("pessoa_social")
            .select("id")
            .eq("pessoa_id", pessoaId)
            .eq("plataforma", p.platform)
            .eq("usuario", p.username)
            .maybeSingle();

          if (!existingSocial) {
            await supabase.from("pessoa_social").insert({
              pessoa_id: pessoaId,
              plataforma: p.platform,
              usuario: p.username,
              url_perfil: p.platform === "facebook"
                ? `https://facebook.com/${p.username}`
                : `https://instagram.com/${p.username}`,
            });
          }
        }
      }
    } catch (pessoaErr) {
      console.error("Erro ao criar pessoa no CRM:", pessoaErr);
    }


    // Return supporter_id and referrer info for the frontend to handle referral linking
    // after auth account is created
    const message = isExisting
      ? `Obrigado, ${name.trim()}! Seu perfil foi vinculado com sucesso. Suas interações anteriores foram contabilizadas!`
      : `Obrigado, ${name.trim()}! Você foi cadastrado(a) com sucesso como apoiador(a) de ${client.name}.`;

    return new Response(JSON.stringify({
      success: true,
      message,
      is_existing: isExisting,
      supporter_id: supporterId,
      referrer_account_id: referrerAccountId,
      referrer_name: referrerName,
      // Devolve handles efetivamente persistidos para o frontend usar em supporter_accounts
      resolved_profiles: profiles,
      pending_shares: pendingShares,
      // Pass location data back so frontend can save after auth
      location_data: { city: city?.trim() || null, neighborhood: neighborhood?.trim() || null, state: state?.trim() || null },
      // Pass extra data so frontend can save in supporter_accounts after auth signup
      account_extra: { cpf: cpfDigits, birth_date: birth_date || null, endereco: endereco?.trim() || null, phone: phoneDigits },
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

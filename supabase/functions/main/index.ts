// Roteador único para edge-runtime self-hosted (EasyPanel) em modo main-service.
// Entry point estático com despacho manual direto.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Handler = (req: Request) => Response | Promise<Response>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown, fallback = "Erro interno"): string {
  return error instanceof Error ? error.message : fallback;
}

function cloneHeadersForInnerRequest(req: Request): Headers {
  const headers = new Headers();
  req.headers.forEach((value, key) => headers.set(key, value));

  const authHeader = headers.get("authorization");
  const apiKeyHeader = headers.get("apikey");
  if (authHeader && !apiKeyHeader) {
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearer) headers.set("apikey", bearer);
  } else if (apiKeyHeader && !authHeader) {
    headers.set("authorization", `Bearer ${apiKeyHeader}`);
  }

  return headers;
}

function parseProfileUrl(url: string): { platform: "facebook" | "instagram"; username: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const fbPatterns = [
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?facebook\.com\/(?:profile\.php\?id=(\d+))/i,
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?facebook\.com\/([a-zA-Z0-9._-]+)\/?/i,
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?fb\.com\/([a-zA-Z0-9._-]+)\/?/i,
  ];
  for (const pattern of fbPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const username = match[1];
      if (["groups", "pages", "events", "watch", "marketplace", "gaming", "reel", "stories", "photo", "permalink"].includes(username.toLowerCase())) continue;
      return { platform: "facebook", username };
    }
  }

  const igPatterns = [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?/i,
    /(?:https?:\/\/)?(?:www\.)?instagr\.am\/([a-zA-Z0-9._]+)\/?/i,
  ];
  for (const pattern of igPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const username = match[1];
      if (["p", "reel", "stories", "explore", "direct", "accounts", "about"].includes(username.toLowerCase())) continue;
      return { platform: "instagram", username };
    }
  }

  return null;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function cleanPhoneForBridge(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
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

  return digits.startsWith("55") ? digits : `55${digits}`;
}

function namesMatch(a: string, b: string): boolean {
  const normalizedA = normalizeName(a);
  const normalizedB = normalizeName(b);
  if (normalizedA === normalizedB) return true;

  const wordsA = normalizedA.split(" ").filter((word) => word.length > 2);
  const wordsB = normalizedB.split(" ").filter((word) => word.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const longer = wordsA.length <= wordsB.length ? wordsB : wordsA;
  const matchCount = shorter.filter((word) => longer.some((longWord) => longWord.includes(word) || word.includes(longWord))).length;
  return matchCount >= Math.ceil(shorter.length * 0.7);
}

async function registerSupporterHandler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { client_id, name, facebook_url, instagram_url, phone, notes, referral_code, city, neighborhood, state } = await req.json();

    if (!client_id || !name?.trim()) {
      return jsonResponse(400, { success: false, error: "Nome e client_id são obrigatórios" });
    }

    if (!city?.trim() || !neighborhood?.trim()) {
      return jsonResponse(400, { success: false, error: "Cidade e bairro são obrigatórios" });
    }

    const profiles: { platform: "facebook" | "instagram"; username: string }[] = [];
    if (facebook_url) {
      const parsed = parseProfileUrl(facebook_url);
      if (parsed) profiles.push(parsed);
    }
    if (instagram_url) {
      const parsed = parseProfileUrl(instagram_url);
      if (parsed) profiles.push(parsed);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: client } = await supabase.from("clients").select("id, name").eq("id", client_id).single();
    if (!client) {
      return jsonResponse(404, { success: false, error: "Cliente não encontrado" });
    }

    if (profiles.length > 0) {
      const { data: existing } = await supabase
        .from("supporter_profiles")
        .select("supporter_id, platform_user_id")
        .in("platform_user_id", profiles.map((profile) => profile.username));

      if (existing && existing.length > 0) {
        return jsonResponse(409, {
          success: false,
          error: "Um ou mais perfis já estão cadastrados. Você já é um apoiador!",
        });
      }
    }

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
        referrerName = (refCode as { supporter_accounts?: { name?: string } }).supporter_accounts?.name || null;
      }
    }

    const { data: existingSupporters } = await supabase.from("supporters").select("id, name").eq("client_id", client_id);

    let supporterId: string | null = null;
    let isExisting = false;

    if (existingSupporters && existingSupporters.length > 0) {
      const matched = existingSupporters.find((supporter) => namesMatch(supporter.name, name.trim()));
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
          notes: [notes?.trim(), phone?.trim() ? `Tel: ${phone.trim()}` : null].filter(Boolean).join(" | ") || null,
        })
        .select()
        .single();

      if (supError) throw supError;
      supporterId = supporter.id;
    } else {
      const updateData: Record<string, unknown> = { classification: "apoiador_ativo" };
      const extraNotes = [notes?.trim(), phone?.trim() ? `Tel: ${phone.trim()}` : null].filter(Boolean).join(" | ");
      if (extraNotes) updateData.notes = extraNotes;
      await supabase.from("supporters").update(updateData).eq("id", supporterId);
    }

    for (const profile of profiles) {
      const avatarUrl = profile.platform === "facebook"
        ? `https://graph.facebook.com/${profile.username}/picture?type=large&redirect=true`
        : null;
      const { error: profileError } = await supabase.from("supporter_profiles").insert({
        supporter_id: supporterId,
        platform: profile.platform,
        platform_user_id: profile.username,
        platform_username: profile.username,
        profile_picture_url: avatarUrl,
      });
      if (profileError) console.error("Profile insert error:", profileError);
    }

    await supabase.rpc("link_orphan_engagement_actions", { p_client_id: client_id });
    await supabase.rpc("calculate_engagement_score", { p_supporter_id: supporterId, p_days: 30 });

    const message = isExisting
      ? `Obrigado, ${name.trim()}! Seu perfil foi vinculado com sucesso. Suas interações anteriores foram contabilizadas!`
      : `Obrigado, ${name.trim()}! Você foi cadastrado(a) com sucesso como apoiador(a) de ${client.name}.`;

    return jsonResponse(200, {
      success: true,
      message,
      is_existing: isExisting,
      supporter_id: supporterId,
      referrer_account_id: referrerAccountId,
      referrer_name: referrerName,
      location_data: { city: city?.trim() || null, neighborhood: neighborhood?.trim() || null, state: state?.trim() || null },
    });
  } catch (error) {
    console.error("Error:", error);
    return jsonResponse(500, { success: false, error: errorMessage(error) });
  }
}

async function registerContratadoHandler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      client_id,
      lider_id,
      nome,
      telefone,
      email,
      senha,
      cidade,
      bairro,
      endereco,
      zona_eleitoral,
      secao_eleitoral,
      notas,
      redes_sociais,
      data_nascimento,
      is_lider,
    } = await req.json();

    const finalIsLider = is_lider === true || !lider_id;

    if (!client_id || !nome || !telefone || !email || !senha) {
      return jsonResponse(400, { error: "Campos obrigatórios: nome, telefone, email, senha" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const { data: clientData } = await adminClient.from("clients").select("id").eq("id", client_id).maybeSingle();
    if (!clientData) return jsonResponse(404, { error: "Cliente não encontrado" });

    const { data: existing } = await adminClient
      .from("contratados")
      .select("id")
      .eq("client_id", client_id)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) return jsonResponse(409, { error: "Este e-mail já está cadastrado como contratado." });

    let authUserId: string | null = null;
    let createdNewAuthUser = false;

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: nome, role: "contratado" },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      if (createError.code === "email_exists" || createError.message.includes("already been registered")) {
        let page = 1;
        const perPage = 200;
        while (true) {
          const { data: usersPage, error: listError } = await adminClient.auth.admin.listUsers({ page, perPage });
          if (listError) {
            console.error("Error listing users:", listError);
            break;
          }
          const found = usersPage.users.find((user) => (user.email || "").toLowerCase() === normalizedEmail);
          if (found) {
            authUserId = found.id;
            await adminClient.auth.admin.updateUserById(found.id, { password: senha });
            break;
          }
          if (usersPage.users.length < perPage) break;
          page += 1;
        }

        if (!authUserId) {
          return jsonResponse(409, { error: "Este e-mail já possui conta, mas não foi possível vinculá-la agora. Tente novamente." });
        }
      } else {
        return jsonResponse(400, { error: createError.message });
      }
    } else {
      authUserId = newUser.user.id;
      createdNewAuthUser = true;
    }

    const { data: contratado, error: insertError } = await adminClient
      .from("contratados")
      .insert({
        client_id,
        lider_id: lider_id || null,
        user_id: authUserId,
        nome: nome.trim(),
        telefone: telefone.trim(),
        email: normalizedEmail,
        cidade: cidade?.trim() || null,
        bairro: bairro?.trim() || null,
        endereco: endereco?.trim() || null,
        zona_eleitoral: zona_eleitoral?.trim() || null,
        secao_eleitoral: secao_eleitoral?.trim() || null,
        notas: notas?.trim() || null,
        redes_sociais: redes_sociais || [],
        contrato_aceito: false,
        is_lider: finalIsLider,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error inserting contratado:", insertError);
      if (createdNewAuthUser && authUserId) await adminClient.auth.admin.deleteUser(authUserId);
      return jsonResponse(500, { error: insertError.message });
    }

    const tipoPessoa = finalIsLider ? "lider" : "contratado";
    const { error: pessoaError } = await adminClient.from("pessoas").insert({
      client_id,
      nome: nome.trim(),
      email: normalizedEmail,
      telefone: telefone.trim(),
      cidade: cidade?.trim() || null,
      bairro: bairro?.trim() || null,
      endereco: endereco?.trim() || null,
      zona_eleitoral: zona_eleitoral?.trim() || null,
      secao_eleitoral: secao_eleitoral?.trim() || null,
      tipo_pessoa: tipoPessoa,
      nivel_apoio: "simpatizante",
      origem_contato: "formulario",
      notas_internas: notas?.trim() || null,
      contratado_id: contratado.id,
      data_nascimento: data_nascimento || null,
    });
    if (pessoaError) console.error("Error creating pessoa for contratado:", pessoaError);

    if (authUserId) {
      const { error: roleError } = await adminClient.from("user_roles").insert({ user_id: authUserId, role: "contratado" });
      if (roleError && roleError.code !== "23505") console.error("Error adding contratado role:", roleError);
    }

    return jsonResponse(200, { success: true, contratado_id: contratado.id, user_id: authUserId });
  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse(500, { error: "Erro interno do servidor" });
  }
}

async function registerFuncionarioHandler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { client_id, nome, telefone, email, senha, cidade, bairro, endereco, redes_sociais, data_nascimento } = await req.json();

    if (!client_id || !nome || !telefone || !email || !senha) {
      return jsonResponse(400, { error: "Campos obrigatórios: nome, telefone, email, senha" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const { data: clientData } = await adminClient.from("clients").select("id").eq("id", client_id).maybeSingle();
    if (!clientData) return jsonResponse(404, { error: "Cliente não encontrado" });

    const { data: existing } = await adminClient
      .from("funcionarios")
      .select("id")
      .eq("client_id", client_id)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) return jsonResponse(409, { error: "Este e-mail já está cadastrado como funcionário." });

    let authUserId: string | null = null;
    let createdNewAuthUser = false;

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: nome, role: "funcionario" },
    });

    if (createError) {
      if (createError.code === "email_exists" || createError.message.includes("already been registered")) {
        let page = 1;
        const perPage = 200;
        while (true) {
          const { data: usersPage, error: listError } = await adminClient.auth.admin.listUsers({ page, perPage });
          if (listError) break;
          const found = usersPage.users.find((user) => (user.email || "").toLowerCase() === normalizedEmail);
          if (found) {
            authUserId = found.id;
            await adminClient.auth.admin.updateUserById(found.id, { password: senha });
            break;
          }
          if (usersPage.users.length < perPage) break;
          page += 1;
        }
        if (!authUserId) return jsonResponse(409, { error: "Este e-mail já possui conta, mas não foi possível vinculá-la." });
      } else {
        return jsonResponse(400, { error: createError.message });
      }
    } else {
      authUserId = newUser.user.id;
      createdNewAuthUser = true;
    }

    let supporterId: string | null = null;
    const socialsArr = redes_sociais || [];

    const { data: supporter } = await adminClient
      .from("supporters")
      .insert({
        client_id,
        name: nome.trim(),
        classification: "neutro",
        first_contact_date: new Date().toISOString(),
        engagement_score: 0,
      })
      .select("id")
      .single();

    if (supporter) {
      supporterId = supporter.id;
      for (const social of socialsArr) {
        await adminClient.from("supporter_profiles").insert({
          supporter_id: supporter.id,
          platform: social.plataforma,
          platform_user_id: social.usuario,
          platform_username: social.usuario,
        });
      }
    }

    const { data: funcionario, error: insertError } = await adminClient
      .from("funcionarios")
      .insert({
        client_id,
        user_id: authUserId,
        nome: nome.trim(),
        telefone: telefone.trim(),
        email: normalizedEmail,
        cidade: cidade?.trim() || null,
        bairro: bairro?.trim() || null,
        endereco: endereco?.trim() || null,
        redes_sociais: socialsArr,
        supporter_id: supporterId,
      })
      .select("id, referral_code")
      .single();

    if (insertError) {
      if (createdNewAuthUser && authUserId) await adminClient.auth.admin.deleteUser(authUserId);
      return jsonResponse(500, { error: insertError.message });
    }

    await adminClient.from("pessoas").insert({
      client_id,
      nome: nome.trim(),
      email: normalizedEmail,
      telefone: telefone.trim(),
      cidade: cidade?.trim() || null,
      bairro: bairro?.trim() || null,
      endereco: endereco?.trim() || null,
      tipo_pessoa: "apoiador",
      nivel_apoio: "militante",
      origem_contato: "formulario",
      supporter_id: supporterId,
      data_nascimento: data_nascimento || null,
    });

    if (socialsArr.length > 0) {
      const { data: pessoa } = await adminClient
        .from("pessoas")
        .select("id")
        .eq("client_id", client_id)
        .eq("email", normalizedEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pessoa) {
        for (const social of socialsArr) {
          await adminClient.from("pessoa_social").insert({
            pessoa_id: pessoa.id,
            plataforma: social.plataforma,
            usuario: social.usuario,
            url_perfil: social.url_perfil || null,
          });
        }
      }
    }

    if (authUserId) {
      const { error: roleError } = await adminClient.from("user_roles").insert({ user_id: authUserId, role: "funcionario" });
      if (roleError && roleError.code !== "23505") console.error("Error adding funcionario role:", roleError);
    }

    return jsonResponse(200, {
      success: true,
      funcionario_id: funcionario.id,
      referral_code: funcionario.referral_code,
      user_id: authUserId,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse(500, { error: "Erro interno do servidor" });
  }
}

async function linkSupporterAccountHandler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { error: "Unauthorized" });

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse(401, { error: "Unauthorized" });

    const { account_id, client_id, supporter_name } = await req.json();
    if (!account_id || !client_id || !supporter_name) return jsonResponse(400, { error: "Missing fields" });

    const { data: existingAccount } = await admin
      .from("supporter_accounts")
      .select("supporter_id")
      .eq("id", account_id)
      .eq("user_id", user.id)
      .single();

    if (!existingAccount) return jsonResponse(404, { error: "Account not found" });

    if (existingAccount.supporter_id) {
      return jsonResponse(200, { success: true, supporter_id: existingAccount.supporter_id, already_linked: true });
    }

    const { data: existingSupporters } = await admin.from("supporters").select("id, name").eq("client_id", client_id);

    const normalized = normalizeName(supporter_name);
    let supporterId: string | null = null;

    if (existingSupporters) {
      const match = existingSupporters.find((supporter) => {
        const normalizedSupporterName = normalizeName(supporter.name);
        if (normalizedSupporterName === normalized) return true;
        const wordsA = normalized.split(" ").filter((word) => word.length > 2);
        const wordsB = normalizedSupporterName.split(" ").filter((word) => word.length > 2);
        if (!wordsA.length || !wordsB.length) return false;
        const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
        const longer = wordsA.length <= wordsB.length ? wordsB : wordsA;
        const matches = shorter.filter((word) => longer.some((longWord) => longWord.includes(word) || word.includes(longWord))).length;
        return matches >= Math.ceil(shorter.length * 0.7);
      });
      if (match) supporterId = match.id;
    }

    if (!supporterId) {
      const { data: newSupporter, error: supporterError } = await admin
        .from("supporters")
        .insert({ client_id, name: supporter_name.trim(), classification: "apoiador_ativo" })
        .select()
        .single();
      if (supporterError) throw supporterError;
      supporterId = newSupporter.id;
    } else {
      await admin.from("supporters").update({ classification: "apoiador_ativo" }).eq("id", supporterId);
    }

    await admin.from("supporter_accounts").update({ supporter_id: supporterId }).eq("id", account_id);
    await admin.rpc("link_orphan_engagement_actions", { p_client_id: client_id });
    await admin.rpc("calculate_engagement_score", { p_supporter_id: supporterId, p_days: 30 });

    return jsonResponse(200, { success: true, supporter_id: supporterId });
  } catch (error) {
    console.error("Error:", error);
    return jsonResponse(500, { error: errorMessage(error, "Internal error") });
  }
}

async function createTeamUserHandler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization")!;
    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return jsonResponse(401, { error: "Não autenticado" });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: clientData } = await adminClient.from("clients").select("id").eq("user_id", caller.id).limit(1).maybeSingle();
    if (!clientData) return jsonResponse(403, { error: "Apenas administradores podem criar usuários" });

    const { name, email, password, role } = await req.json();
    if (!name || !email || !password || !role) {
      return jsonResponse(400, { error: "Campos obrigatórios: name, email, password, role" });
    }

    const validRoles = ["gestor_social", "gestor_campanha", "operacional"];
    const roles = (role as string).split(",").map((item) => item.trim()).filter(Boolean);
    const invalidRoles = roles.filter((item) => !validRoles.includes(item));
    if (roles.length === 0 || invalidRoles.length > 0) {
      return jsonResponse(400, { error: `Perfil(is) inválido(s): ${invalidRoles.join(", ")}. Use: ${validRoles.join(", ")}` });
    }
    const normalizedRole = roles.join(",");

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      return jsonResponse(400, { error: createError.message });
    }

    const { error: teamError } = await adminClient.from("team_members").insert({
      client_id: clientData.id,
      user_id: newUser.user.id,
      name,
      email,
      role: normalizedRole,
      status: "active",
    });

    if (teamError) {
      console.error("Error creating team member:", teamError);
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return jsonResponse(500, { error: teamError.message });
    }

    await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role: "team_member" });

    return jsonResponse(200, {
      success: true,
      user_id: newUser.user.id,
      message: `Usuário ${name} criado com perfil(is): ${normalizedRole}`,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse(500, { error: "Erro interno" });
  }
}

async function calculateIedHandler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const { clientId } = await req.json();
    if (!clientId) throw new Error("clientId required");

    const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).eq("user_id", user.id).single();
    if (!client) throw new Error("Client not found");

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(now.getDate() - 60);

    const { data: comments } = await supabase
      .from("comments")
      .select("sentiment")
      .eq("client_id", clientId)
      .not("text", "eq", "__post_stub__")
      .eq("is_page_owner", false)
      .not("sentiment", "is", null)
      .gte("comment_created_time", thirtyDaysAgo.toISOString());

    const totalAnalyzed = comments?.length || 0;
    const positiveCount = comments?.filter((comment) => comment.sentiment === "positive").length || 0;
    const negativeCount = comments?.filter((comment) => comment.sentiment === "negative").length || 0;
    const neutralCount = comments?.filter((comment) => comment.sentiment === "neutral").length || 0;

    let sentimentScore = 0;
    if (totalAnalyzed > 0) {
      sentimentScore = Math.round(((positiveCount * 100) + (neutralCount * 50) + (negativeCount * 0)) / totalAnalyzed);
    }

    const { count: recentSupporters } = await supabase
      .from("supporters")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("created_at", thirtyDaysAgo.toISOString());

    const { count: previousSupporters } = await supabase
      .from("supporters")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("created_at", sixtyDaysAgo.toISOString())
      .lt("created_at", thirtyDaysAgo.toISOString());

    const { count: totalSupporters } = await supabase
      .from("supporters")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);

    let growthScore = 0;
    const recent = recentSupporters || 0;
    const previous = previousSupporters || 0;
    if (previous > 0) {
      const growthRate = ((recent - previous) / previous) * 100;
      growthScore = Math.round(Math.max(0, Math.min(100, 50 + growthRate / 2)));
    } else if (recent > 0) {
      growthScore = 80;
    } else {
      growthScore = (totalSupporters || 0) > 0 ? 30 : 0;
    }

    const { data: supporters } = await supabase
      .from("supporters")
      .select("engagement_score")
      .eq("client_id", clientId)
      .not("engagement_score", "is", null)
      .gt("engagement_score", 0);

    let engagementScore = 0;
    if (supporters && supporters.length > 0) {
      const avgScore = supporters.reduce((sum, supporter) => sum + (supporter.engagement_score || 0), 0) / supporters.length;
      engagementScore = Math.round(Math.min(100, (avgScore / 30) * 100));
    }

    const activeRatio = (totalSupporters || 0) > 0 ? (supporters?.length || 0) / (totalSupporters || 1) : 0;
    engagementScore = Math.round(engagementScore * 0.6 + activeRatio * 100 * 0.4);

    const { count: checkinCount } = await supabase
      .from("supporter_checkins")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("checkin_at", thirtyDaysAgo.toISOString());

    const { count: accountCount } = await supabase
      .from("supporter_accounts")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);

    let checkinScore = 0;
    const accounts = accountCount || 0;
    const checkins = checkinCount || 0;
    if (accounts > 0) {
      const idealCheckins = accounts * 4;
      checkinScore = Math.round(Math.min(100, (checkins / idealCheckins) * 100));
    }

    const finalScore = Math.round(sentimentScore * 0.30 + growthScore * 0.25 + engagementScore * 0.25 + checkinScore * 0.20);

    const details = {
      sentiment: { total: totalAnalyzed, positive: positiveCount, negative: negativeCount, neutral: neutralCount },
      growth: { recent, previous, total: totalSupporters || 0 },
      engagement: { activeCount: supporters?.length || 0, totalSupporters: totalSupporters || 0 },
      checkins: { count: checkins, accounts },
    };

    const { error: upsertError } = await supabase.from("ied_scores").upsert({
      client_id: clientId,
      score: finalScore,
      sentiment_score: sentimentScore,
      growth_score: growthScore,
      engagement_score: engagementScore,
      checkin_score: checkinScore,
      week_start: weekStartStr,
      details,
    }, { onConflict: "client_id,week_start" });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      throw new Error("Failed to save IED score");
    }

    const { data: history } = await supabase
      .from("ied_scores")
      .select("*")
      .eq("client_id", clientId)
      .order("week_start", { ascending: true })
      .limit(12);

    return jsonResponse(200, {
      success: true,
      current: { score: finalScore, sentiment_score: sentimentScore, growth_score: growthScore, engagement_score: engagementScore, checkin_score: checkinScore, details },
      history: history || [],
    });
  } catch (error) {
    console.error("IED calc error:", error);
    return jsonResponse(400, { error: errorMessage(error) });
  }
}

async function checkAlertsHandler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { client_id } = await req.json();
    if (!client_id) return jsonResponse(400, { error: "client_id required" });

    const alerts: Array<{ client_id: string; tipo: string; severidade: string; titulo: string; descricao: string; dados?: Record<string, unknown> }> = [];
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data: recentNegative } = await supabase
      .from("comments")
      .select("id, text, author_name, comment_created_time")
      .eq("client_id", client_id)
      .eq("sentiment", "negative")
      .eq("is_page_owner", false)
      .gte("comment_created_time", oneDayAgo.toISOString())
      .order("comment_created_time", { ascending: false })
      .limit(50);

    const { data: recentTotal } = await supabase
      .from("comments")
      .select("id")
      .eq("client_id", client_id)
      .eq("is_page_owner", false)
      .gte("comment_created_time", oneDayAgo.toISOString())
      .limit(200);

    const negCount = recentNegative?.length || 0;
    const totalCount = recentTotal?.length || 0;
    const negRatio = totalCount > 0 ? negCount / totalCount : 0;

    if (negCount >= 5 && negRatio >= 0.4) {
      alerts.push({
        client_id,
        tipo: "crise",
        severidade: "critica",
        titulo: `🚨 Crise detectada: ${negCount} comentários negativos nas últimas 24h`,
        descricao: `${Math.round(negRatio * 100)}% dos comentários recentes são negativos. Ação imediata recomendada.`,
        dados: { negCount, totalCount, ratio: negRatio, samples: recentNegative?.slice(0, 3) },
      });
    } else if (negCount >= 3 && negRatio >= 0.3) {
      alerts.push({
        client_id,
        tipo: "sentimento_negativo",
        severidade: "alta",
        titulo: `⚠️ Sentimento negativo em alta: ${negCount} comentários negativos`,
        descricao: `${Math.round(negRatio * 100)}% dos comentários das últimas 24h são negativos.`,
        dados: { negCount, totalCount, ratio: negRatio },
      });
    }

    const { data: unansweredNeg } = await supabase
      .from("comments")
      .select("id, text, author_name, comment_created_time")
      .eq("client_id", client_id)
      .eq("sentiment", "negative")
      .eq("status", "pending")
      .eq("is_page_owner", false)
      .lte("comment_created_time", oneDayAgo.toISOString())
      .limit(20);

    if (unansweredNeg && unansweredNeg.length >= 3) {
      alerts.push({
        client_id,
        tipo: "sentimento_negativo",
        severidade: "alta",
        titulo: `🔴 ${unansweredNeg.length} comentários negativos sem resposta há +24h`,
        descricao: "Comentários negativos sem resposta podem escalar. Responda ou gerencie-os.",
        dados: { count: unansweredNeg.length, samples: unansweredNeg.slice(0, 3) },
      });
    }

    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const { data: recentActions } = await supabase
      .from("engagement_actions")
      .select("id")
      .eq("client_id", client_id)
      .gte("action_date", sevenDaysAgo.toISOString())
      .limit(1000);

    const { data: previousActions } = await supabase
      .from("engagement_actions")
      .select("id")
      .eq("client_id", client_id)
      .gte("action_date", fourteenDaysAgo.toISOString())
      .lt("action_date", sevenDaysAgo.toISOString())
      .limit(1000);

    const recentCount = recentActions?.length || 0;
    const previousCount = previousActions?.length || 0;

    if (previousCount > 10 && recentCount < previousCount * 0.5) {
      const dropPct = Math.round((1 - recentCount / previousCount) * 100);
      alerts.push({
        client_id,
        tipo: "queda_engajamento",
        severidade: dropPct >= 70 ? "critica" : "alta",
        titulo: `📉 Engajamento caiu ${dropPct}% na última semana`,
        descricao: `De ${previousCount} para ${recentCount} interações. Considere criar missões ou conteúdo para reativar a base.`,
        dados: { recentCount, previousCount, dropPct },
      });
    }

    const { data: overdueTasks } = await supabase
      .from("campanha_tarefas")
      .select("id, titulo, prazo, responsavel_id")
      .eq("client_id", client_id)
      .neq("status", "concluida")
      .lt("prazo", now.toISOString().split("T")[0])
      .limit(20);

    if (overdueTasks && overdueTasks.length >= 2) {
      alerts.push({
        client_id,
        tipo: "tarefa_atrasada",
        severidade: overdueTasks.length >= 5 ? "alta" : "media",
        titulo: `⏰ ${overdueTasks.length} tarefas de campanha atrasadas`,
        descricao: "Tarefas passaram do prazo definido. Verifique o Modo Campanha.",
        dados: { count: overdueTasks.length, tasks: overdueTasks.slice(0, 5) },
      });
    }

    const { data: recentCheckins } = await supabase
      .from("supporter_checkins")
      .select("id")
      .eq("client_id", client_id)
      .gte("checkin_date", threeDaysAgo.toISOString().split("T")[0])
      .limit(1);

    const { data: totalAccounts } = await supabase.from("supporter_accounts").select("id").eq("client_id", client_id).limit(1);

    if (totalAccounts && totalAccounts.length > 0 && (!recentCheckins || recentCheckins.length === 0)) {
      alerts.push({
        client_id,
        tipo: "inatividade",
        severidade: "media",
        titulo: "😴 Nenhum check-in nos últimos 3 dias",
        descricao: "Apoiadores não fizeram check-in recentemente. Envie uma notificação push ou crie novas missões.",
      });
    }

    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const { data: existingAlerts } = await supabase
      .from("alertas")
      .select("tipo")
      .eq("client_id", client_id)
      .eq("descartado", false)
      .gte("created_at", sixHoursAgo.toISOString());

    const existingTypes = new Set(existingAlerts?.map((alert) => alert.tipo) || []);
    const newAlerts = alerts.filter((alert) => !existingTypes.has(alert.tipo));

    if (newAlerts.length > 0) await supabase.from("alertas").insert(newAlerts);

    return jsonResponse(200, {
      analyzed: true,
      alerts_generated: newAlerts.length,
      alerts_skipped: alerts.length - newAlerts.length,
      types: newAlerts.map((alert) => alert.tipo),
    });
  } catch (error) {
    return jsonResponse(500, { error: errorMessage(error) });
  }
}

async function resolveWhatsappLinkHandler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { error: "Não autenticado" });

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: authData, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !authData?.user) return jsonResponse(401, { error: "Sessão inválida" });

    const { client_id } = await req.json();
    if (!client_id) return jsonResponse(400, { error: "client_id é obrigatório" });

    const { data: clientData, error: clientError } = await adminClient
      .from("clients")
      .select("whatsapp_oficial")
      .eq("id", client_id)
      .maybeSingle();

    if (clientError) return jsonResponse(400, { error: clientError.message });

    const number = (clientData?.whatsapp_oficial || "").replace(/\D/g, "");
    if (!number) return jsonResponse(404, { error: "WhatsApp oficial não configurado" });

    const waNumber = number.startsWith("55") ? number : `55${number}`;

    const { error: updateError } = await adminClient
      .from("contratados")
      .update({ whatsapp_confirmado: true })
      .eq("client_id", client_id)
      .eq("user_id", authData.user.id);

    if (updateError) return jsonResponse(400, { error: updateError.message });

    return jsonResponse(200, { success: true, wa_url: `https://wa.me/${waNumber}` });
  } catch (error) {
    return jsonResponse(500, { error: errorMessage(error) });
  }
}

// =====================================================================
// manage-whatsapp-instance — proxy para a Bridge UAZAPI por cliente.
// =====================================================================
const WHATSAPP_BRIDGE_URL =
  "https://vxqvrsaxppbgxookyimz.supabase.co/functions/v1/whatsapp-bridge";

function isInvalidApiKeyResponse(status: number, data: { error?: string } | null | undefined) {
  return (
    status === 401 &&
    typeof data?.error === "string" &&
    data.error.toLowerCase().includes("invalid api key")
  );
}

async function bridgeDeleteInstance(adminClient: any, clientId: string, clientApiKey: string | null | undefined) {
  if (clientApiKey) {
    try {
      console.log(`[manage-whatsapp-instance] deleting instance for client ${clientId}`);
      const res = await fetch(WHATSAPP_BRIDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": clientApiKey },
        body: JSON.stringify({ action: "delete_instance" }),
      });
      console.log(`[manage-whatsapp-instance] delete_instance status=${res.status}`);
    } catch (err) {
      console.error("[manage-whatsapp-instance] delete error:", err);
    }
  }

  const { error: updateError } = await adminClient
    .from("clients")
    .update({ whatsapp_bridge_url: null, whatsapp_bridge_api_key: null })
    .eq("id", clientId);

  if (updateError) console.error("[manage-whatsapp-instance] clear creds error:", updateError);
}

async function bridgeCreateInstance(params: {
  adminClient: any;
  bridgeToken: string | undefined;
  clientId: string;
  clientName?: string | null;
  providedName?: string | null;
  currentApiKey?: string | null;
}): Promise<Response> {
  const { adminClient, bridgeToken, clientId, clientName, providedName, currentApiKey } = params;

  if (!bridgeToken) {
    return jsonResponse(500, { error: "WHATSAPP_BRIDGE_TOKEN não configurado no servidor" });
  }

  if (currentApiKey) {
    await bridgeDeleteInstance(adminClient, clientId, currentApiKey);
  }

  const instanceName = providedName || clientName || "WhatsApp Bot";

  const bridgeRes = await fetch(WHATSAPP_BRIDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bridge-Token": bridgeToken },
    body: JSON.stringify({ action: "create_instance", name: instanceName }),
  });

  const bridgeData = await bridgeRes.json().catch(() => ({} as any));

  // The Bridge sometimes responds with success=false but still preserves the
  // instance (and returns api_key). In that case, we save the key and try to
  // fetch the QR via instance_status. Only hard-fail when no api_key at all.
  const apiKey = bridgeData?.api_key || bridgeData?.instance?.api_key || null;

  if (!bridgeRes.ok && !apiKey) {
    return jsonResponse(bridgeRes.status || 500, {
      error: bridgeData.error || "Erro ao criar instância",
      details: bridgeData,
    });
  }

  if (!apiKey) {
    return jsonResponse(502, {
      error: "A ponte não retornou a api_key da instância",
      details: bridgeData,
    });
  }

  const { error: updateError } = await adminClient
    .from("clients")
    .update({
      whatsapp_bridge_url: WHATSAPP_BRIDGE_URL,
      whatsapp_bridge_api_key: apiKey,
    })
    .eq("id", clientId);

  if (updateError) {
    return jsonResponse(500, {
      error: "Erro ao salvar as credenciais da instância",
      details: updateError.message,
    });
  }

  // Try to read the QR code from the create response first.
  let qrcode: string | null =
    (typeof bridgeData?.qrcode === "string" && bridgeData.qrcode) ||
    (typeof bridgeData?.instance?.qrcode === "string" && bridgeData.instance.qrcode) ||
    null;
  let status: string | null =
    bridgeData?.status || bridgeData?.instance?.status || null;

  // If the Bridge didn't return a QR immediately (status="connecting" or QR
  // generation deferred), poll instance_status briefly to pick it up.
  if (!qrcode) {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const statusRes = await fetch(WHATSAPP_BRIDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ action: "instance_status" }),
      });
      const statusData = await statusRes.json().catch(() => ({} as any));
      const nextQr =
        (typeof statusData?.qrcode === "string" && statusData.qrcode) ||
        (typeof statusData?.instance?.qrcode === "string" && statusData.instance.qrcode) ||
        null;
      const nextStatus = statusData?.status || statusData?.instance?.status || null;
      if (nextStatus) status = nextStatus;
      if (nextQr) {
        qrcode = nextQr;
        break;
      }
      if (nextStatus && ["connected", "open"].includes(String(nextStatus).toLowerCase())) {
        break;
      }
    }
  }

  return jsonResponse(200, {
    success: true,
    qrcode,
    status,
    instance: bridgeData.instance,
    recreated: true,
  });
}

async function manageWhatsappInstanceHandler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { error: "Unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const bridgeToken = Deno.env.get("WHATSAPP_BRIDGE_TOKEN");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return jsonResponse(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => ({} as any));
    const { action, phone, message, client_id, name } = body || {};
    if (!action) return jsonResponse(400, { error: "action é obrigatório" });

    const adminClient = createClient(supabaseUrl, serviceKey);

    let resolvedClientId = client_id;
    if (!resolvedClientId) {
      const { data: clientRow } = await adminClient
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      resolvedClientId = clientRow?.id;
    }

    if (!resolvedClientId) return jsonResponse(404, { error: "Client not found" });

    const { data: clientConfig } = await adminClient
      .from("clients")
      .select("name, whatsapp_bridge_url, whatsapp_bridge_api_key")
      .eq("id", resolvedClientId)
      .single();

    const clientApiKey = clientConfig?.whatsapp_bridge_api_key as string | null | undefined;

    if (action === "create_instance") {
      return await bridgeCreateInstance({
        adminClient,
        bridgeToken,
        clientId: resolvedClientId,
        clientName: clientConfig?.name,
        providedName: name,
        currentApiKey: clientApiKey,
      });
    }

    if (action === "disconnect") {
      await bridgeDeleteInstance(adminClient, resolvedClientId, clientApiKey);
      return jsonResponse(200, { success: true, message: "Instância deletada com sucesso" });
    }

    if (action === "check_bridge") {
      const configured = !!(clientConfig?.whatsapp_bridge_url && clientApiKey);
      return jsonResponse(200, { success: true, configured });
    }

    if (!clientApiKey) {
      if (action === "reconnect") {
        return await bridgeCreateInstance({
          adminClient,
          bridgeToken,
          clientId: resolvedClientId,
          clientName: clientConfig?.name,
          currentApiKey: null,
        });
      }
      return jsonResponse(400, {
        error: "Instância WhatsApp não configurada. Crie uma instância primeiro.",
      });
    }

    const proxyBody: Record<string, unknown> = { action };
    if (phone) proxyBody.phone = action === "send" ? cleanPhoneForBridge(String(phone)) : phone;
    if (message) proxyBody.message = message;

    if (action === "send" && typeof phone === "string" && phone) {
      console.log("[WhatsApp main] phone recebido no body:", phone);
      console.log("[WhatsApp main] phone enviado para whatsapp-bridge:", proxyBody.phone);
    }

    const bridgeRes = await fetch(WHATSAPP_BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": clientApiKey },
      body: JSON.stringify(proxyBody),
    });

    const bridgeData = await bridgeRes.json().catch(() => ({} as any));

    if (action === "reconnect" && isInvalidApiKeyResponse(bridgeRes.status, bridgeData)) {
      return await bridgeCreateInstance({
        adminClient,
        bridgeToken,
        clientId: resolvedClientId,
        clientName: clientConfig?.name,
        currentApiKey: clientApiKey,
      });
    }

    if (action === "instance_status" && isInvalidApiKeyResponse(bridgeRes.status, bridgeData)) {
      return jsonResponse(200, {
        success: false,
        status: "disconnected",
        error: bridgeData.error,
        requires_reconnect: true,
      });
    }

    if (!bridgeRes.ok) {
      return jsonResponse(200, {
        success: false,
        error: bridgeData?.error || `Erro na ponte (status ${bridgeRes.status})`,
        details: bridgeData,
      });
    }

    return jsonResponse(200, bridgeData);
  } catch (error) {
    console.error("[manage-whatsapp-instance] error:", error);
    return jsonResponse(200, { success: false, error: errorMessage(error) });
  }
}

// =============================================================================
// send-whatsapp-dispatch (mass dispatch via client bridge)
// =============================================================================

const DISPATCH_DEFAULT_BATCH_SIZE = 10;
const DISPATCH_DEFAULT_DELAY_MIN = 5;
const DISPATCH_DEFAULT_DELAY_MAX = 15;
const DISPATCH_DEFAULT_BATCH_PAUSE = 60;
const DISPATCH_MAX_RUNTIME_MS = 55000;

function dispatchSleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dispatchRandomDelay(minMs: number, maxMs: number) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Normaliza número para a Bridge removendo o nono dígito de celulares BR,
 * pois a ponte/WhatsApp confirma entrega nesse formato neste projeto.
 * Regras:
 *   "(67) 99224-8348"   -> 5567992248348
 *   "67992248348"       -> 5567992248348
 *   "5567992248348"     -> 556792248348
 *   "556792248348"      -> 556792248348
 *   "6792248348"        -> 556792248348
 */
function dispatchNormalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
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

  return digits.startsWith("55") ? digits : `55${digits}`;
}

async function sendWhatsappDispatchHandler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    const user = userData?.user;
    if (authErr || !user) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const body = await req.json().catch(() => ({} as any));
    const {
      client_id,
      titulo,
      mensagem,
      tipo,
      tag_filtro,
      batch_size,
      delay_min,
      delay_max,
      batch_pause,
    } = body || {};

    if (!client_id || !titulo || !mensagem || !tipo) {
      return jsonResponse(400, { error: "Campos obrigatórios: client_id, titulo, mensagem, tipo" });
    }

    const BATCH_SIZE = batch_size || DISPATCH_DEFAULT_BATCH_SIZE;
    const DELAY_MIN_MS = (delay_min || DISPATCH_DEFAULT_DELAY_MIN) * 1000;
    const DELAY_MAX_MS = (delay_max || DISPATCH_DEFAULT_DELAY_MAX) * 1000;
    const BATCH_PAUSE_MS = (batch_pause || DISPATCH_DEFAULT_BATCH_PAUSE) * 1000;

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verifica posse e busca config da ponte
    const { data: clientData } = await adminClient
      .from("clients")
      .select("id, whatsapp_bridge_url, whatsapp_bridge_api_key")
      .eq("id", client_id)
      .eq("user_id", user.id)
      .single();

    if (!clientData) {
      return jsonResponse(403, { error: "Forbidden" });
    }

    const bridgeUrl = clientData.whatsapp_bridge_url as string | null;
    const bridgeApiKey = clientData.whatsapp_bridge_api_key as string | null;

    if (!bridgeUrl || !bridgeApiKey) {
      return jsonResponse(400, {
        error: "Ponte WhatsApp não configurada para este cliente. Contacte o administrador.",
      });
    }

    // Monta lista de destinatários
    let recipients: { telefone: string; nome: string }[] = [];

    if (tipo === "funcionarios") {
      const { data } = await adminClient
        .from("funcionarios")
        .select("telefone, nome")
        .eq("client_id", client_id)
        .eq("status", "ativo")
        .not("telefone", "is", null);
      recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
    } else if (tipo === "contratados") {
      const { data } = await adminClient
        .from("contratados")
        .select("telefone, nome")
        .eq("client_id", client_id)
        .eq("status", "ativo")
        .not("telefone", "is", null);
      recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
    } else {
      if (tag_filtro) {
        const { data: tagData } = await adminClient
          .from("tags")
          .select("id")
          .eq("client_id", client_id)
          .eq("nome", tag_filtro)
          .single();

        if (tagData) {
          const { data: pessoaTagData } = await adminClient
            .from("pessoas_tags")
            .select("pessoa_id")
            .eq("tag_id", (tagData as any).id);

          const pessoaIds = (pessoaTagData || []).map((pt: any) => pt.pessoa_id);
          if (pessoaIds.length > 0) {
            const { data } = await adminClient
              .from("pessoas")
              .select("telefone, nome")
              .eq("client_id", client_id)
              .in("id", pessoaIds)
              .not("telefone", "is", null);
            recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
          }
        }
      } else {
        const { data } = await adminClient
          .from("pessoas")
          .select("telefone, nome")
          .eq("client_id", client_id)
          .not("telefone", "is", null)
          .limit(2000);
        recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
      }
    }

    if (recipients.length === 0) {
      return jsonResponse(400, { error: "Nenhum destinatário encontrado" });
    }

    // Cria o registro do disparo
    const { data: dispatch, error: dispatchErr } = await adminClient
      .from("whatsapp_dispatches")
      .insert({
        client_id,
        tipo,
        titulo,
        mensagem_template: mensagem,
        total_destinatarios: recipients.length,
        tag_filtro,
        status: "enviando",
        started_at: new Date().toISOString(),
        batch_size: BATCH_SIZE,
        delay_min_seconds: Math.round(DELAY_MIN_MS / 1000),
        delay_max_seconds: Math.round(DELAY_MAX_MS / 1000),
        batch_pause_seconds: Math.round(BATCH_PAUSE_MS / 1000),
      })
      .select()
      .single();

    if (dispatchErr || !dispatch) {
      throw new Error("Failed to create dispatch: " + (dispatchErr?.message || "unknown"));
    }

    // Itens do disparo
    const items = recipients.map((r) => ({
      dispatch_id: (dispatch as any).id,
      telefone: r.telefone,
      nome: r.nome,
    }));

    for (let i = 0; i < items.length; i += 100) {
      await adminClient.from("whatsapp_dispatch_items").insert(items.slice(i, i + 100));
    }

    const processDispatch = async () => {
      let sent = 0;
      let failed = 0;

      for (let batch = 0; batch < Math.ceil(recipients.length / BATCH_SIZE); batch++) {
        if (Date.now() - startTime > DISPATCH_MAX_RUNTIME_MS) {
          await adminClient.from("whatsapp_dispatches").update({
            enviados: sent,
            falhas: failed,
            status: sent > 0 ? "concluido" : "falhou",
            error_message: `Tempo limite atingido. ${sent} enviados de ${recipients.length}.`,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", (dispatch as any).id);
          return;
        }

        const batchStart = batch * BATCH_SIZE;
        const batchItems = recipients.slice(batchStart, batchStart + BATCH_SIZE);

        for (const recipient of batchItems) {
          if (Date.now() - startTime > DISPATCH_MAX_RUNTIME_MS) break;

          try {
            const personalizedMsg = String(mensagem).replace(/{nome}/g, recipient.nome || "");
            const phoneNormalized = dispatchNormalizePhone(recipient.telefone);
            console.log("[send-whatsapp-dispatch] phone recebido no body:", recipient.telefone);
            console.log("[send-whatsapp-dispatch] phone após normalize:", phoneNormalized);
            console.log("[send-whatsapp-dispatch] phone enviado para whatsapp-bridge:", phoneNormalized);

            const sendRes = await fetch(bridgeUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Api-Key": bridgeApiKey,
              },
              body: JSON.stringify({
                action: "send",
                phone: phoneNormalized,
                message: personalizedMsg,
              }),
            });

            if (sendRes.ok) {
              sent++;
              await adminClient.from("whatsapp_dispatch_items")
                .update({ status: "enviado", enviado_em: new Date().toISOString() })
                .eq("dispatch_id", (dispatch as any).id)
                .eq("telefone", recipient.telefone);
            } else {
              const errBody = await sendRes.text();
              failed++;
              await adminClient.from("whatsapp_dispatch_items")
                .update({ status: "falha", erro: errBody.slice(0, 200) })
                .eq("dispatch_id", (dispatch as any).id)
                .eq("telefone", recipient.telefone);
            }
          } catch (err) {
            failed++;
            await adminClient.from("whatsapp_dispatch_items")
              .update({ status: "falha", erro: String(err).slice(0, 200) })
              .eq("dispatch_id", (dispatch as any).id)
              .eq("telefone", recipient.telefone);
          }

          if ((sent + failed) % 5 === 0) {
            await adminClient.from("whatsapp_dispatches").update({
              enviados: sent,
              falhas: failed,
              updated_at: new Date().toISOString(),
            }).eq("id", (dispatch as any).id);
          }

          await dispatchSleep(dispatchRandomDelay(DELAY_MIN_MS, DELAY_MAX_MS));
        }

        if (batch < Math.ceil(recipients.length / BATCH_SIZE) - 1) {
          await dispatchSleep(BATCH_PAUSE_MS);
        }
      }

      await adminClient.from("whatsapp_dispatches").update({
        enviados: sent,
        falhas: failed,
        status: "concluido",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", (dispatch as any).id);
    };

    if (typeof (globalThis as any).EdgeRuntime !== "undefined") {
      (globalThis as any).EdgeRuntime.waitUntil(processDispatch());
    } else {
      // fire-and-forget para liberar a resposta rapidamente
      processDispatch().catch((err) => console.error("[send-whatsapp-dispatch] bg error:", err));
    }

    return jsonResponse(200, {
      success: true,
      dispatch_id: (dispatch as any).id,
      total: recipients.length,
    });
  } catch (error) {
    console.error("[send-whatsapp-dispatch] error:", error);
    return jsonResponse(500, { error: errorMessage(error) });
  }
}

const handlers: Record<string, Handler> = {
  "register-supporter": registerSupporterHandler,
  "register-contratado": registerContratadoHandler,
  "register-funcionario": registerFuncionarioHandler,
  "link-supporter-account": linkSupporterAccountHandler,
  "create-team-user": createTeamUserHandler,
  "calculate-ied": calculateIedHandler,
  "check-alerts": checkAlertsHandler,
  "resolve-whatsapp-link": resolveWhatsappLinkHandler,
  "manage-whatsapp-instance": manageWhatsappInstanceHandler,
  "send-whatsapp-dispatch": sendWhatsappDispatchHandler,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  while (segments.length && (segments[0] === "functions" || segments[0] === "v1")) segments.shift();

  const functionName = segments[0];
  console.log(`[main-router] path=${url.pathname} function=${functionName ?? "(none)"}`);

  if (!functionName) {
    return jsonResponse(200, { ok: true, service: "edge-runtime main router", allowed: Object.keys(handlers) });
  }

  if (functionName === "_health") return jsonResponse(200, { ok: true });

  const handler = handlers[functionName];
  if (!handler) {
    return jsonResponse(404, {
      error: `Function "${functionName}" não encontrada ou não habilitada.`,
      allowed: Object.keys(handlers),
    });
  }

  try {
    const innerPath = "/" + segments.slice(1).join("/");
    const innerUrl = new URL(innerPath + url.search, url.origin);
    const innerReq = new Request(innerUrl.toString(), {
      method: req.method,
      headers: cloneHeadersForInnerRequest(req),
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
    });

    return await handler(innerReq);
  } catch (error) {
    const message = errorMessage(error);
    console.error(`[main-router] erro ao executar "${functionName}":`, message);
    return jsonResponse(500, { error: "Falha ao executar function", function: functionName, detail: message });
  }
});

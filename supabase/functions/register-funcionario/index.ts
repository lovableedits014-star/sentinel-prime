import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      client_id, nome, telefone, email, senha, cpf,
      cidade, bairro, endereco, redes_sociais, data_nascimento,
    } = await req.json();

    if (!client_id || !nome || !telefone || !email || !senha || !cpf) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: nome, cpf, telefone, email, senha" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!cidade || !bairro || !endereco) {
      return new Response(JSON.stringify({ error: "Cidade, bairro e rua são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!data_nascimento) {
      return new Response(JSON.stringify({ error: "Data de nascimento é obrigatória" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cpfDigits = String(cpf).replace(/\D/g, "");

    const normalizedEmail = String(email).trim().toLowerCase();

    // Verify client exists
    const { data: clientData } = await adminClient
      .from("clients")
      .select("id")
      .eq("id", client_id)
      .maybeSingle();

    if (!clientData) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if email already exists as funcionario for this client
    const { data: existing } = await adminClient
      .from("funcionarios")
      .select("id")
      .eq("client_id", client_id)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Este e-mail já está cadastrado como funcionário." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user (or reuse if already exists)
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
          const found = usersPage.users.find((u) => (u.email || "").toLowerCase() === normalizedEmail);
          if (found) {
            authUserId = found.id;
            await adminClient.auth.admin.updateUserById(found.id, { password: senha });
            break;
          }
          if (usersPage.users.length < perPage) break;
          page += 1;
        }
        if (!authUserId) {
          return new Response(JSON.stringify({ error: "Este e-mail já possui conta, mas não foi possível vinculá-la." }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      authUserId = newUser.user.id;
      createdNewAuthUser = true;
    }

    // Create supporter record for engagement tracking
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
      // Create supporter_profiles for each social network
      for (const social of socialsArr) {
        await adminClient.from("supporter_profiles").insert({
          supporter_id: supporter.id,
          platform: social.plataforma,
          platform_user_id: social.usuario,
          platform_username: social.usuario,
        });
      }
    }

    // Insert funcionario record
    const { data: funcionario, error: insertError } = await adminClient
      .from("funcionarios")
      .insert({
        client_id,
        user_id: authUserId,
        nome: nome.trim(),
        telefone: telefone.trim(),
        email: normalizedEmail,
        cpf: cpfDigits,
        cidade: cidade?.trim() || null,
        bairro: bairro?.trim() || null,
        endereco: endereco?.trim() || null,
        redes_sociais: socialsArr,
        supporter_id: supporterId,
      })
      .select("id, referral_code")
      .single();

    if (insertError) {
      if (createdNewAuthUser && authUserId) {
        await adminClient.auth.admin.deleteUser(authUserId);
      }
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create pessoa record
    await adminClient.from("pessoas").insert({
      client_id,
      nome: nome.trim(),
      email: normalizedEmail,
      telefone: telefone.trim(),
      cpf: cpfDigits,
      cidade: cidade?.trim() || null,
      bairro: bairro?.trim() || null,
      endereco: endereco?.trim() || null,
      tipo_pessoa: "apoiador",
      nivel_apoio: "militante",
      origem_contato: "formulario",
      supporter_id: supporterId,
      data_nascimento: data_nascimento || null,
    });

    // Also create pessoa_social for engagement mapping
    if (socialsArr.length > 0) {
      // Get the pessoa ID
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

    // Add funcionario role
    if (authUserId) {
      await adminClient.from("user_roles").insert({
        user_id: authUserId,
        role: "funcionario",
      }).then(({ error: roleError }) => {
        if (roleError && roleError.code !== "23505") {
          console.error("Error adding funcionario role:", roleError);
        }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      funcionario_id: funcionario.id,
      referral_code: funcionario.referral_code,
      user_id: authUserId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

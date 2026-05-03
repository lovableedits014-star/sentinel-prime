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
      client_id, lider_id, nome, telefone, email, senha,
      cidade, bairro, endereco, zona_eleitoral, secao_eleitoral, notas, redes_sociais, data_nascimento,
      is_lider,
    } = await req.json();

    // Auto-determine: if no lider_id, this person is a líder
    const finalIsLider = is_lider === true || !lider_id;

    if (!client_id || !nome || !telefone || !email || !senha) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: nome, telefone, email, senha" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Check if email already exists as contratado for this client
    const { data: existing } = await adminClient
      .from("contratados")
      .select("id")
      .eq("client_id", client_id)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Este e-mail já está cadastrado como contratado." }), {
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

          const found = usersPage.users.find((u) => (u.email || "").toLowerCase() === normalizedEmail);
          if (found) {
            authUserId = found.id;
            // Update password for the existing user
            await adminClient.auth.admin.updateUserById(found.id, { password: senha });
            break;
          }

          if (usersPage.users.length < perPage) break;
          page += 1;
        }

        if (!authUserId) {
          return new Response(JSON.stringify({ error: "Este e-mail já possui conta, mas não foi possível vinculá-la agora. Tente novamente." }), {
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

    // Insert contratado record
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
      // Rollback only if user was created in this request
      if (createdNewAuthUser && authUserId) {
        await adminClient.auth.admin.deleteUser(authUserId);
      }
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also create a pessoa record linked to this contratado
    const tipoPessoa = finalIsLider ? 'lider' : 'contratado';
    const { error: pessoaError } = await adminClient
      .from("pessoas")
      .insert({
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
        nivel_apoio: 'simpatizante',
        origem_contato: 'formulario',
        notas_internas: notas?.trim() || null,
        contratado_id: contratado.id,
        data_nascimento: data_nascimento || null,
      });

    if (pessoaError) {
      console.error("Error creating pessoa for contratado:", pessoaError);
      // Non-blocking: contratado was created, pessoa is supplementary
    }

    // Add contratado role
    if (authUserId) {
      const { error: roleError } = await adminClient.from("user_roles").insert({
        user_id: authUserId,
        role: "contratado",
      });
      if (roleError && roleError.code !== "23505") {
        console.error("Error adding contratado role:", roleError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      contratado_id: contratado.id,
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

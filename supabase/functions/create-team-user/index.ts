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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller owns a client
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: clientData } = await adminClient
      .from("clients")
      .select("id")
      .eq("user_id", caller.id)
      .limit(1)
      .maybeSingle();

    if (!clientData) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar usuários" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { name, email, password, role } = await req.json();

    if (!name || !email || !password || !role) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: name, email, password, role" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate roles (supports comma-separated multi-role e.g. "gestor_social,operacional")
    const validRoles = ["gestor_social", "gestor_campanha", "operacional"];
    const roles = (role as string).split(",").map((r: string) => r.trim()).filter(Boolean);
    const invalidRoles = roles.filter((r: string) => !validRoles.includes(r));
    if (roles.length === 0 || invalidRoles.length > 0) {
      return new Response(JSON.stringify({ error: `Perfil(is) inválido(s): ${invalidRoles.join(", ")}. Use: ${validRoles.join(", ")}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Store as comma-separated string
    const normalizedRole = roles.join(",");

    // Create auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create team_member record
    const { error: teamError } = await adminClient
      .from("team_members")
      .insert({
        client_id: clientData.id,
        user_id: newUser.user.id,
        name,
        email,
        role: normalizedRole,
        status: "active",
      });

    if (teamError) {
      console.error("Error creating team member:", teamError);
      // Rollback: delete the auth user
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: teamError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add team_member role
    await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role: "team_member",
    });

    return new Response(JSON.stringify({ 
      success: true, 
      user_id: newUser.user.id,
      message: `Usuário ${name} criado com perfil(is): ${normalizedRole}` 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Não autenticado" }, 401);

    const { data: isAdmin } = await callerClient.rpc("is_super_admin");
    if (isAdmin !== true) return json({ error: "Apenas super admin" }, 403);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const action = body.action as string;

    if (action === "create") {
      const { name, email, password, allowed_paths } = body;
      if (!name || !email || !password || !Array.isArray(allowed_paths)) {
        return json({ error: "Campos obrigatórios: name, email, password, allowed_paths" }, 400);
      }
      if (password.length < 6) return json({ error: "Senha mínima de 6 caracteres" }, 400);

      let userId: string | null = null;
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });

      if (createErr) {
        // Email já existe em auth.users — reaproveita
        const msg = createErr.message?.toLowerCase() || "";
        const isDup = msg.includes("already") || msg.includes("registered") || (createErr as any).code === "email_exists";
        if (!isDup) return json({ error: createErr.message }, 400);

        // Já está vinculado em platform_users?
        const { data: existingPlat } = await admin
          .from("platform_users")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (existingPlat) {
          return json({ error: "Este email já está cadastrado como usuário da plataforma. Edite-o na lista." }, 409);
        }

        // Localiza o user no auth e atualiza senha
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        if (listErr) return json({ error: listErr.message }, 500);
        const found = list.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
        if (!found) return json({ error: "Email já registrado mas usuário não encontrado" }, 500);
        userId = found.id;
        await admin.auth.admin.updateUserById(userId, {
          password,
          user_metadata: { ...(found.user_metadata || {}), full_name: name },
        });
      } else {
        userId = created!.user!.id;
      }

      const { error: insErr } = await admin.from("platform_users").insert({
        user_id: userId,
        name,
        email,
        allowed_paths,
        status: "active",
        created_by: caller.id,
      });
      if (insErr) {
        await admin.auth.admin.deleteUser(userId);
        return json({ error: insErr.message }, 500);
      }

      await admin.from("user_roles").insert({ user_id: userId, role: "platform_user" }).then(() => {}, () => {});

      return json({ success: true, user_id: userId });
    }

    if (action === "update") {
      const { id, name, allowed_paths, status, password } = body;
      if (!id) return json({ error: "id obrigatório" }, 400);

      const { data: target, error: tErr } = await admin
        .from("platform_users")
        .select("user_id")
        .eq("id", id)
        .single();
      if (tErr || !target) return json({ error: "Usuário não encontrado" }, 404);

      const patch: Record<string, unknown> = {};
      if (typeof name === "string") patch.name = name;
      if (Array.isArray(allowed_paths)) patch.allowed_paths = allowed_paths;
      if (typeof status === "string") patch.status = status;

      if (Object.keys(patch).length > 0) {
        const { error: upErr } = await admin.from("platform_users").update(patch).eq("id", id);
        if (upErr) return json({ error: upErr.message }, 500);
      }

      if (typeof password === "string" && password.length > 0) {
        if (password.length < 6) return json({ error: "Senha mínima de 6 caracteres" }, 400);
        const { error: pErr } = await admin.auth.admin.updateUserById(target.user_id, { password });
        if (pErr) return json({ error: pErr.message }, 500);
      }

      if (status === "disabled") {
        await admin.auth.admin.updateUserById(target.user_id, { ban_duration: "876000h" }).catch(() => {});
      } else if (status === "active") {
        await admin.auth.admin.updateUserById(target.user_id, { ban_duration: "none" }).catch(() => {});
      }

      return json({ success: true });
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) return json({ error: "id obrigatório" }, 400);
      const { data: target } = await admin
        .from("platform_users")
        .select("user_id")
        .eq("id", id)
        .single();
      if (target?.user_id) {
        await admin.from("user_roles").delete().eq("user_id", target.user_id).eq("role", "platform_user");
        await admin.from("platform_users").delete().eq("id", id);
        await admin.auth.admin.deleteUser(target.user_id);
      }
      return json({ success: true });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (err) {
    console.error("manage-platform-user error", err);
    return json({ error: (err as Error).message || "Erro interno" }, 500);
  }
});

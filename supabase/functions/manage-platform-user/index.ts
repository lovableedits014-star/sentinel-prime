// Gerencia usuários de equipe (team_members) vinculados a um cliente.
// Permitido para: super admin OU gerente (is_manager=true) do mesmo client_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateInput, z } from "../_shared/validate.ts";
import { logSecurityEvent, extractRequestMeta } from "../_shared/security-log.ts";

const ManagePlatformUserSchema = z.object({
  action: z.enum(["create", "update", "delete", "list", "reset_password"]),
  client_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(255).optional(),
  password: z.string().min(6).max(200).optional(),
  allowed_paths: z.array(z.string()).optional(),
  is_manager: z.boolean().optional(),
}).passthrough();

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

async function canManageClient(
  callerClient: any,
  admin: any,
  callerId: string,
  clientId: string,
): Promise<boolean> {
  const { data: isAdmin } = await callerClient.rpc("is_super_admin");
  if (isAdmin === true) return true;
  // dono do client?
  const { data: ownsClient } = await admin
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", callerId)
    .maybeSingle();
  if (ownsClient) return true;
  // gerente do client?
  const { data: mgr } = await admin
    .from("team_members")
    .select("id")
    .eq("client_id", clientId)
    .eq("user_id", callerId)
    .eq("is_manager", true)
    .eq("status", "active")
    .maybeSingle();
  return !!mgr;
}

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

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const rawBody = await req.json();
    validateInput(ManagePlatformUserSchema, rawBody, { fn: "manage-platform-user" });
    const body = rawBody;
    const action = body.action as string;

    if (action === "create") {
      const { client_id, name, email, password, allowed_paths, is_manager } = body;
      if (!client_id || !name || !email || !password) {
        return json({ error: "Campos obrigatórios: client_id, name, email, password" }, 400);
      }
      if (!Array.isArray(allowed_paths) && !is_manager) {
        return json({ error: "Informe allowed_paths ou is_manager=true" }, 400);
      }
      if (password.length < 6) return json({ error: "Senha mínima de 6 caracteres" }, 400);

      const allowed = await canManageClient(callerClient, admin, caller.id, client_id);
      if (!allowed) return json({ error: "Sem permissão para gerenciar este cliente" }, 403);

      const normalizedEmail = String(email).trim().toLowerCase();

      // 1 usuário = 1 cliente. Bloqueia se já houver vínculo.
      const { data: existing } = await admin
        .from("team_members")
        .select("id, client_id")
        .ilike("email", normalizedEmail)
        .maybeSingle();
      if (existing) {
        return json({ error: "Este email já está vinculado a um cliente." }, 409);
      }

      // Recupera (ou cria) o auth user
      let userId: string | null = null;
      let createdAuthUser = false;
      let foundAuthUser: any = null;
      for (let page = 1; page <= 20; page++) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listErr) return json({ error: listErr.message }, 500);
        foundAuthUser = list.users.find((u: any) => (u.email || "").toLowerCase() === normalizedEmail);
        if (foundAuthUser || list.users.length < 1000) break;
      }

      if (foundAuthUser) {
        userId = foundAuthUser.id;
        const { error: updateAuthErr } = await admin.auth.admin.updateUserById(userId!, {
          password,
          email_confirm: true,
          user_metadata: { ...(foundAuthUser.user_metadata || {}), full_name: name },
        });
        if (updateAuthErr) return json({ error: updateAuthErr.message }, 500);
      } else {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: name },
        });
        if (createErr) return json({ error: createErr.message }, 400);
        userId = created!.user!.id;
        createdAuthUser = true;
      }

      const finalPaths = is_manager ? ["*"] : (allowed_paths as string[]);
      const { error: insErr } = await admin.from("team_members").insert({
        client_id,
        user_id: userId,
        name,
        email: normalizedEmail,
        role: is_manager ? "admin" : "operacional",
        status: "active",
        allowed_paths: finalPaths,
        is_manager: !!is_manager,
      });
      if (insErr) {
        if (createdAuthUser) await admin.auth.admin.deleteUser(userId!);
        return json({ error: insErr.message }, 500);
      }

      await admin.from("user_roles").insert({ user_id: userId, role: "team_member" })
        .then(() => {}, () => {});

      return json({ success: true, user_id: userId });
    }

    if (action === "update") {
      const { id, name, allowed_paths, is_manager, status, password } = body;
      if (!id) return json({ error: "id obrigatório" }, 400);

      const { data: target, error: tErr } = await admin
        .from("team_members")
        .select("user_id, client_id")
        .eq("id", id)
        .single();
      if (tErr || !target) return json({ error: "Usuário não encontrado" }, 404);

      const allowed = await canManageClient(callerClient, admin, caller.id, target.client_id);
      if (!allowed) return json({ error: "Sem permissão" }, 403);

      const patch: Record<string, unknown> = {};
      if (typeof name === "string") patch.name = name;
      if (typeof status === "string") patch.status = status;
      if (typeof is_manager === "boolean") {
        patch.is_manager = is_manager;
        if (is_manager) patch.allowed_paths = ["*"];
      }
      if (Array.isArray(allowed_paths) && !is_manager) {
        patch.allowed_paths = allowed_paths;
      }

      if (Object.keys(patch).length > 0) {
        const { error: upErr } = await admin.from("team_members").update(patch).eq("id", id);
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
        .from("team_members")
        .select("user_id, client_id")
        .eq("id", id)
        .single();
      if (!target) return json({ success: true });

      const allowed = await canManageClient(callerClient, admin, caller.id, target.client_id);
      if (!allowed) return json({ error: "Sem permissão" }, 403);

      await admin.from("team_members").delete().eq("id", id);
      await admin.from("user_roles").delete().eq("user_id", target.user_id).eq("role", "team_member");
      // Não removemos o auth user aqui — pode pertencer a outro contexto.
      return json({ success: true });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (err) {
    console.error("manage-platform-user error", err);
    return json({ error: (err as Error).message || "Erro interno" }, 500);
  }
});

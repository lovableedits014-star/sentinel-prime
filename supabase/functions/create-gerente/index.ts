// Cria um novo gerente (cliente SaaS).
// Apenas super admin pode chamar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateInput, z } from "../_shared/validate.ts";

const Schema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(255),
  password: z.string().min(6).max(200),
  cargo: z.string().max(100).optional(),
});

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
    if (isAdmin !== true) return json({ error: "Apenas super admin pode criar gerentes" }, 403);

    const raw = await req.json();
    validateInput(Schema, raw, { fn: "create-gerente" });
    const { name, email, password, cargo } = raw as z.infer<typeof Schema>;
    const normalizedEmail = email.trim().toLowerCase();

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Cria o auth.user. O trigger handle_new_user, ao ver account_type='gerente',
    // automaticamente cria profile + user_roles.client + clients.
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, account_type: "gerente" },
    });

    if (cErr) {
      if (cErr.message?.includes("already been registered") || (cErr as any).code === "email_exists") {
        return json({ error: "Este e-mail já está cadastrado" }, 409);
      }
      return json({ error: cErr.message }, 400);
    }

    const userId = created.user!.id;

    // Se cargo informado, atualiza a ficha em clients (o trigger criou apenas com name)
    if (cargo) {
      await admin.from("clients").update({ cargo }).eq("user_id", userId);
    }

    // Recupera o client_id final
    const { data: clientRow } = await admin
      .from("clients")
      .select("id, name, cargo")
      .eq("user_id", userId)
      .maybeSingle();

    return json({
      success: true,
      user_id: userId,
      client: clientRow,
      credentials: { email: normalizedEmail, password },
    });
  } catch (err: any) {
    console.error("create-gerente error:", err);
    return json({ error: err?.message || String(err) }, 500);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { pessoa_id, email, password } = await req.json();
    if (!pessoa_id || !email || !password || password.length < 6) {
      return new Response(JSON.stringify({ error: "Dados inválidos" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Verifica que o caller pertence ao client da pessoa
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: pessoa } = await admin.from("eleicao_pessoas").select("id, client_id, nome, email, user_id").eq("id", pessoa_id).maybeSingle();
    if (!pessoa) return new Response(JSON.stringify({ error: "Pessoa não encontrada" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: canAccess } = await admin.rpc("user_can_access_client", { _client_id: pessoa.client_id });
    if (!canAccess) return new Response(JSON.stringify({ error: "Sem permissão" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const emailNorm = email.trim().toLowerCase();

    // Tenta achar usuário existente
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
        email: emailNorm,
        password,
        email_confirm: true,
        user_metadata: { full_name: pessoa.nome },
      });
      if (cErr) throw cErr;
      userId = created.user!.id;
    }

    await admin.from("eleicao_pessoas").update({ email: emailNorm, user_id: userId }).eq("id", pessoa_id);

    return new Response(JSON.stringify({ success: true, user_id: userId }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

// Edge function: Permite que apoiadores migrados (sem senha definida)
// criem/redefinam sua senha SEM precisar de e-mail.
// Restrito aos apoiadores marcados em supporter_accounts.legacy_password_recovery_allowed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, new_password, client_id } = await req.json();

    if (!email || !new_password) {
      return json({ success: false, error: "E-mail e nova senha são obrigatórios" }, 400);
    }
    if (String(new_password).length < 6) {
      return json({ success: false, error: "A senha deve ter pelo menos 6 caracteres" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const normalizedEmail = String(email).trim().toLowerCase();

    // 1) Tenta na allowlist global (todos os usuários migrados)
    const { data: allow, error: allowErr } = await admin
      .from("legacy_password_recovery_allowlist")
      .select("id, user_id, email, used_at")
      .ilike("email", normalizedEmail)
      .is("used_at", null)
      .limit(1);
    if (allowErr) throw allowErr;

    let userId: string | null = allow && allow.length > 0 ? allow[0].user_id : null;
    let allowId: string | null = allow && allow.length > 0 ? allow[0].id : null;
    let supporterAccountId: string | null = null;

    // 2) Fallback: conta de apoiador legada
    if (!userId) {
      let query = admin
        .from("supporter_accounts")
        .select("id, user_id, email, client_id, legacy_password_recovery_allowed")
        .ilike("email", normalizedEmail)
        .eq("legacy_password_recovery_allowed", true);
      if (client_id) query = query.eq("client_id", client_id);
      const { data: accounts, error: accErr } = await query.limit(1);
      if (accErr) throw accErr;
      if (accounts && accounts.length > 0 && accounts[0].user_id) {
        userId = accounts[0].user_id;
        supporterAccountId = accounts[0].id;
      }
    }

    if (!userId) {
      return json({
        success: false,
        error: "E-mail não encontrado entre os usuários cadastrados ou redefinição já utilizada.",
      }, 404);
    }

    // Atualiza a senha via Admin API
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password: String(new_password),
      email_confirm: true,
    });
    if (updErr) throw updErr;

    // Consome o privilégio (uso único)
    if (allowId) {
      await admin
        .from("legacy_password_recovery_allowlist")
        .update({ used_at: new Date().toISOString() })
        .eq("id", allowId);
    }
    if (supporterAccountId) {
      await admin
        .from("supporter_accounts")
        .update({ legacy_password_recovery_allowed: false })
        .eq("id", supporterAccountId);
    }

    return json({ success: true, message: "Senha definida com sucesso. Você já pode entrar." });
  } catch (err: any) {
    console.error("legacy-supporter-set-password error:", err);
    return json({ success: false, error: err?.message || "Erro interno" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

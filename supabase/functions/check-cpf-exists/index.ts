import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function onlyDigits(v: string): string {
  return String(v || "").replace(/\D/g, "");
}

function isValidCpf(cpf: string): boolean {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i], 10) * (10 - i);
  let dig1 = (sum * 10) % 11;
  if (dig1 === 10) dig1 = 0;
  if (dig1 !== parseInt(d[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i], 10) * (11 - i);
  let dig2 = (sum * 10) % 11;
  if (dig2 === 10) dig2 = 0;
  return dig2 === parseInt(d[10], 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_id, cpf } = await req.json();
    const cpfClean = onlyDigits(cpf || "");

    if (!client_id || cpfClean.length !== 11) {
      return new Response(JSON.stringify({ exists: false, valid: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidCpf(cpfClean)) {
      return new Response(JSON.stringify({ exists: false, valid: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);

    // Basic per-IP rate limiting via api_cache (max 20 lookups / 10 min)
    const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const rlKey = `cpf_check:${ip}`;
    try {
      const { data: rl } = await admin
        .from("api_cache")
        .select("payload, expires_at")
        .eq("source", "rate_limit")
        .eq("endpoint_key", rlKey)
        .maybeSingle();
      const now = Date.now();
      let count = 0;
      let expiresAt = new Date(now + 10 * 60_000).toISOString();
      if (rl && new Date(rl.expires_at).getTime() > now) {
        count = Number((rl.payload as any)?.count ?? 0);
        expiresAt = rl.expires_at as string;
      }
      if (count >= 20) {
        await new Promise((r) => setTimeout(r, 1500));
        return new Response(JSON.stringify({ exists: false, valid: false, error: "rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await admin.from("api_cache").upsert({
        source: "rate_limit",
        endpoint_key: rlKey,
        payload: { count: count + 1 },
        expires_at: expiresAt,
        fetched_at: new Date().toISOString(),
      }, { onConflict: "source,endpoint_key" });
    } catch (_e) {
      // Rate limit table might not allow upsert; fail open but add a small delay
    }

    // Deliberate small delay to slow down enumeration
    await new Promise((r) => setTimeout(r, 250));

    const [pessoas, funcionarios, contratados, supporters, accounts] = await Promise.all([
      admin.from("pessoas").select("id").eq("client_id", client_id).eq("cpf", cpfClean).limit(1).maybeSingle(),
      admin.from("funcionarios").select("id").eq("client_id", client_id).eq("cpf", cpfClean).limit(1).maybeSingle(),
      admin.from("contratados").select("id").eq("client_id", client_id).eq("cpf", cpfClean).limit(1).maybeSingle(),
      admin.from("supporters").select("id").eq("client_id", client_id).eq("cpf", cpfClean).limit(1).maybeSingle(),
      admin.from("supporter_accounts").select("id").eq("client_id", client_id).eq("cpf", cpfClean).limit(1).maybeSingle(),
    ]);

    const exists =
      !!(pessoas.data || funcionarios.data || contratados.data || supporters.data || accounts.data);

    return new Response(JSON.stringify({ exists, valid: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-cpf-exists error:", err);
    return new Response(JSON.stringify({ exists: false, valid: false, error: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
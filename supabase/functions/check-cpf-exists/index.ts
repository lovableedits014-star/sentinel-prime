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

    const [pessoas, funcionarios, contratados, supporters, accounts] = await Promise.all([
      admin.from("pessoas").select("id").eq("client_id", client_id).eq("cpf", cpfClean).limit(1).maybeSingle(),
      admin.from("funcionarios").select("id").eq("client_id", client_id).eq("cpf", cpfClean).limit(1).maybeSingle(),
      admin.from("contratados").select("id").eq("client_id", client_id).eq("cpf", cpfClean).limit(1).maybeSingle(),
      admin.from("supporters").select("id").eq("client_id", client_id).eq("cpf", cpfClean).limit(1).maybeSingle(),
      admin.from("supporter_accounts").select("id").eq("client_id", client_id).eq("cpf", cpfClean).limit(1).maybeSingle(),
    ]);

    let where: string | null = null;
    if (pessoas.data) where = "pessoas";
    else if (funcionarios.data) where = "funcionarios";
    else if (contratados.data) where = "contratados";
    else if (supporters.data || accounts.data) where = "apoiadores";

    return new Response(JSON.stringify({ exists: !!where, valid: true, where }), {
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
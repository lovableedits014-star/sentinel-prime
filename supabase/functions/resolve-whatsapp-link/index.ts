import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: authData, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { client_id, role } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // role: "contratado" (default), "funcionario" or "apoiador"
    const targetRole: "contratado" | "funcionario" | "apoiador" =
      role === "funcionario" || role === "apoiador" ? role : "contratado";

    const { data: clientData, error: clientError } = await adminClient
      .from("clients")
      .select("whatsapp_oficial")
      .eq("id", client_id)
      .maybeSingle();

    if (clientError) {
      return new Response(JSON.stringify({ error: clientError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: instanceData } = await adminClient
      .from("whatsapp_instances")
      .select("phone_number")
      .eq("client_id", client_id)
      .eq("status", "connected")
      .eq("is_active", true)
      .not("phone_number", "is", null)
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const number = (instanceData?.phone_number || clientData?.whatsapp_oficial || "").replace(/\D/g, "");
    if (!number) {
      return new Response(JSON.stringify({ error: "WhatsApp oficial não configurado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const waNumber = number.startsWith("55") ? number : `55${number}`;

    return new Response(
      JSON.stringify({
        success: true,
        wa_url: `https://wa.me/${waNumber}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

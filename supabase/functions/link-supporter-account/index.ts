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
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller is the authenticated supporter
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { account_id, client_id, supporter_name } = await req.json();
    if (!account_id || !client_id || !supporter_name) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if account already has a supporter linked
    const { data: existingAccount } = await admin
      .from("supporter_accounts")
      .select("supporter_id")
      .eq("id", account_id)
      .eq("user_id", user.id)
      .single();

    if (!existingAccount) {
      return new Response(JSON.stringify({ error: "Account not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingAccount.supporter_id) {
      return new Response(JSON.stringify({ success: true, supporter_id: existingAccount.supporter_id, already_linked: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try fuzzy name match first
    const { data: existingSupporters } = await admin
      .from("supporters")
      .select("id, name")
      .eq("client_id", client_id);

    const normalizeName = (n: string) =>
      n.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");

    const normalized = normalizeName(supporter_name);
    let supporterId: string | null = null;

    if (existingSupporters) {
      const match = existingSupporters.find((s) => {
        const ns = normalizeName(s.name);
        if (ns === normalized) return true;
        const wordsA = normalized.split(" ").filter((w) => w.length > 2);
        const wordsB = ns.split(" ").filter((w) => w.length > 2);
        if (!wordsA.length || !wordsB.length) return false;
        const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
        const longer = wordsA.length <= wordsB.length ? wordsB : wordsA;
        const matches = shorter.filter((w) => longer.some((lw) => lw.includes(w) || w.includes(lw))).length;
        return matches >= Math.ceil(shorter.length * 0.7);
      });
      if (match) supporterId = match.id;
    }

    if (!supporterId) {
      // Create new supporter
      const { data: newSup, error: supErr } = await admin
        .from("supporters")
        .insert({
          client_id,
          name: supporter_name.trim(),
          classification: "apoiador_ativo",
        })
        .select()
        .single();
      if (supErr) throw supErr;
      supporterId = newSup.id;
    } else {
      // Update existing to active
      await admin.from("supporters").update({ classification: "apoiador_ativo" }).eq("id", supporterId);
    }

    // Link account to supporter
    await admin.from("supporter_accounts").update({ supporter_id: supporterId }).eq("id", account_id);

    // Link orphan engagement actions
    await admin.rpc("link_orphan_engagement_actions", { p_client_id: client_id });
    // Recalculate score
    await admin.rpc("calculate_engagement_score", { p_supporter_id: supporterId, p_days: 30 });

    return new Response(JSON.stringify({ success: true, supporter_id: supporterId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

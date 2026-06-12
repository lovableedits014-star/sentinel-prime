// Geocoding em lote para eleicao_pessoas via Google Maps Platform Gateway.
// Pega até `limit` pessoas sem lat/lng do client e atualiza no banco.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

async function geocode(address: string): Promise<{ lat: number; lng: number; status: string } | null> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gmapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!lovableKey || !gmapsKey) throw new Error("Credenciais Google Maps não configuradas");

  const url = `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=br&language=pt-BR`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmapsKey,
    },
  });
  if (!r.ok) throw new Error(`Gateway ${r.status}`);
  const data = await r.json();
  const status = data.status as string;
  if (status === "OK" && data.results?.[0]?.geometry?.location) {
    const { lat, lng } = data.results[0].geometry.location;
    return { lat, lng, status };
  }
  return { lat: 0, lng: 0, status }; // zero/lat lng só pra registrar status; quem chama trata
}

function buildAddress(p: any): string {
  const parts: string[] = [];
  if (p.rua) parts.push(`${p.rua}${p.numero ? `, ${p.numero}` : ""}`);
  else if (p.endereco) parts.push(p.endereco);
  if (p.bairro) parts.push(p.bairro);
  if (p.cidade) parts.push(p.cidade);
  parts.push("Brasil");
  return parts.join(", ");
}

function addressHash(p: any): string {
  return [p.rua, p.numero, p.bairro, p.cidade, p.endereco].map((v) => (v || "").trim().toLowerCase()).join("|");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { clientId, limit = 25, ids } = await req.json();
    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let q = admin.from("eleicao_pessoas")
      .select("id, rua, numero, bairro, cidade, endereco, geocode_endereco_hash, lat")
      .eq("client_id", clientId)
      .limit(limit);
    if (ids && Array.isArray(ids) && ids.length) {
      q = q.in("id", ids);
    } else {
      q = q.is("lat", null);
    }
    const { data: rows, error } = await q;
    if (error) throw error;

    let success = 0, failed = 0, skipped = 0;
    const results: any[] = [];

    for (const p of rows || []) {
      const addr = buildAddress(p);
      if (!p.cidade && !p.bairro && !p.rua && !p.endereco) {
        skipped++;
        await admin.from("eleicao_pessoas").update({
          geocode_status: "no_address",
          geocoded_at: new Date().toISOString(),
        }).eq("id", p.id);
        continue;
      }
      try {
        const g = await geocode(addr);
        if (g && g.status === "OK" && g.lat !== 0) {
          await admin.from("eleicao_pessoas").update({
            lat: g.lat,
            lng: g.lng,
            geocode_status: "ok",
            geocoded_at: new Date().toISOString(),
            geocode_endereco_hash: addressHash(p),
          }).eq("id", p.id);
          success++;
          results.push({ id: p.id, lat: g.lat, lng: g.lng });
        } else {
          await admin.from("eleicao_pessoas").update({
            geocode_status: g?.status || "failed",
            geocoded_at: new Date().toISOString(),
            geocode_endereco_hash: addressHash(p),
          }).eq("id", p.id);
          failed++;
        }
      } catch (e: any) {
        console.error("[geocode] erro:", p.id, e?.message);
        failed++;
      }
      // pequeno throttling (~10 req/s)
      await new Promise((r) => setTimeout(r, 100));
    }

    // Pendentes restantes
    const { count: pending } = await admin
      .from("eleicao_pessoas")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .is("lat", null);

    return new Response(JSON.stringify({ success, failed, skipped, pending: pending || 0, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[geocode-eleicao-pessoas] erro:", err?.message);
    return new Response(JSON.stringify({ error: err?.message || "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

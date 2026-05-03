import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Limpa arquivos do bucket `whatsapp-media` com mais de TTL_DAYS dias.
// Roda diariamente via cron. Mantém o storage limpo automaticamente.
const TTL_DAYS = 7;
const BUCKET = "whatsapp-media";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000;
    const toDelete: string[] = [];
    let scanned = 0;

    // Percorre recursivamente: outbox/<client>/<file> e dispatches/<client>/<file>
    const prefixes = ["outbox", "dispatches", ""];
    const visited = new Set<string>();

    const walk = async (prefix: string) => {
      if (visited.has(prefix)) return;
      visited.add(prefix);

      let offset = 0;
      const pageSize = 1000;
      // Loop paginado
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
        if (error) {
          console.error("[cleanup] list error", prefix, error);
          break;
        }
        if (!data || data.length === 0) break;

        for (const item of data) {
          // Pasta (sem id) → recursa
          if (!item.id) {
            const sub = prefix ? `${prefix}/${item.name}` : item.name;
            await walk(sub);
            continue;
          }
          scanned++;
          // Tenta determinar a idade pelo prefixo timestamp do nome (Date.now()-...)
          // ou pelo created_at retornado.
          let createdMs: number | null = null;
          const tsMatch = /^(\d{13})-/.exec(item.name);
          if (tsMatch) createdMs = Number(tsMatch[1]);
          if (!createdMs && item.created_at) {
            createdMs = new Date(item.created_at).getTime();
          }
          if (!createdMs) continue; // Sem como datar → preserva

          if (createdMs < cutoff) {
            const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
            toDelete.push(fullPath);
          }
        }

        if (data.length < pageSize) break;
        offset += pageSize;
      }
    };

    for (const p of prefixes) {
      await walk(p);
    }

    let deleted = 0;
    // Apaga em lotes de 100
    for (let i = 0; i < toDelete.length; i += 100) {
      const batch = toDelete.slice(i, i + 100);
      const { error } = await supabase.storage.from(BUCKET).remove(batch);
      if (error) {
        console.error("[cleanup] remove error", error);
        continue;
      }
      deleted += batch.length;
    }

    console.log(`[cleanup-whatsapp-media] scanned=${scanned} deleted=${deleted} ttl_days=${TTL_DAYS}`);
    return json({ success: true, scanned, deleted, ttl_days: TTL_DAYS });
  } catch (err) {
    console.error("cleanup-whatsapp-media error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});

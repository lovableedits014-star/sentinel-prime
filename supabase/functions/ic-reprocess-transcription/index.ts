import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/ic-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body {
  clientId: string;
  transcriptionId: string;
  provider?: string;     // override (groq, openai, anthropic, gemini, mistral, cohere, lovable)
  model?: string;        // override de modelo
  apiKey?: string;       // opcional: chave temporária do override
  reprocessMateriaId?: string; // se informado, regenera UMA matéria existente
  regenerateMemory?: boolean;  // default true — re-extrai conhecimento da transcrição inteira
  generateMateria?: boolean;
  materia?: {
    tipo?: "press_release" | "blog" | "nota_oficial" | "boletim";
    tom?: "formal" | "jornalistico" | "popular" | "tecnico";
    tema?: string;
    briefing?: string;
  };
}

async function callIcFn(name: string, payload: any) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!resp.ok) {
    throw new Error(`${name} HTTP ${resp.status}: ${json?.error || text.slice(0, 240)}`);
  }
  return json ?? {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const {
      clientId,
      transcriptionId,
      provider,
      model,
      apiKey,
      reprocessMateriaId,
      regenerateMemory = true,
      generateMateria = false,
      materia,
    } = body || ({} as Body);

    if (!clientId || !transcriptionId) {
      return errorResponse("clientId e transcriptionId são obrigatórios", 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tr, error: trErr } = await admin
      .from("ic_transcriptions")
      .select("id, full_text, segments, filename, created_at, client_id")
      .eq("id", transcriptionId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (trErr || !tr) return errorResponse("Transcrição não encontrada", 404);

    const segText = Array.isArray(tr.segments)
      ? tr.segments.map((s: any) => s?.text ?? "").join(" ")
      : "";
    const fullText = ((tr.full_text && tr.full_text.length > 30 ? tr.full_text : segText) || "").trim();
    if (fullText.length < 30) {
      return errorResponse("Transcrição vazia ou muito curta para reprocessar", 400);
    }

    const result: any = {
      transcription_id: transcriptionId,
      provider_requested: provider || "(default cliente)",
      model_requested: model || "(default)",
    };

    if (regenerateMemory) {
      try {
        const extract = await callIcFn("ic-extract-knowledge", {
          clientId,
          sourceType: "transcription",
          sourceId: transcriptionId,
          sourceDate: tr.created_at,
          text: fullText,
          triggerSuggestions: false,
          providerOverride: provider,
          modelOverride: model,
          apiKeyOverride: apiKey,
        });
        result.memory = extract;
      } catch (e: any) {
        result.memory_error = e?.message || String(e);
      }
    }

    if (reprocessMateriaId) {
      const { data: cur } = await admin
        .from("materias_geradas")
        .select("tipo, tom, tema, prompt_input, transcription_id, fontes")
        .eq("id", reprocessMateriaId)
        .eq("client_id", clientId)
        .maybeSingle();

      const ids: string[] =
        (cur?.fontes?.transcription_ids as string[] | undefined) ||
        (cur?.transcription_id ? [cur.transcription_id] : [transcriptionId]);
      if (!ids.includes(transcriptionId)) ids.push(transcriptionId);

      try {
        const out = await callIcFn("ic-write-materia", {
          clientId,
          tipo: materia?.tipo || cur?.tipo || "press_release",
          tom: materia?.tom || cur?.tom || "jornalistico",
          tema: materia?.tema ?? cur?.tema ?? undefined,
          briefing: materia?.briefing ?? cur?.prompt_input ?? "",
          transcriptionIds: ids,
          salvarComo: "rascunho",
          providerOverride: provider,
          modelOverride: model,
          apiKeyOverride: apiKey,
          reprocessMateriaId,
        });
        result.materia = out.saved;
        result.materia_provider = out.provider;
        result.materia_model = out.model;
      } catch (e: any) {
        result.materia_error = e?.message || String(e);
      }
    } else if (generateMateria) {
      try {
        const out = await callIcFn("ic-write-materia", {
          clientId,
          tipo: materia?.tipo || "press_release",
          tom: materia?.tom || "jornalistico",
          tema: materia?.tema,
          briefing: materia?.briefing || "",
          transcriptionIds: [transcriptionId],
          salvarComo: "rascunho",
          providerOverride: provider,
          modelOverride: model,
          apiKeyOverride: apiKey,
        });
        result.materia = out.saved;
        result.materia_provider = out.provider;
        result.materia_model = out.model;
      } catch (e: any) {
        result.materia_error = e?.message || String(e);
      }
    }

    return jsonResponse(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-reprocess-transcription error:", msg);
    return errorResponse(msg);
  }
});
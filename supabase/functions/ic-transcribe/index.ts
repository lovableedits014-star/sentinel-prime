import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { getTranscribeConfig, transcribeAudio } from "../_shared/transcribe-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // multipart parse
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return json({ error: "Envie como multipart/form-data" }, 400);
    }
    const form = await req.formData();
    const file = form.get("file");
    const clientId = String(form.get("clientId") ?? "");
    const language = (form.get("language") ? String(form.get("language")) : "") || undefined;
    const prompt = form.get("prompt") ? String(form.get("prompt")) : undefined;

    if (!clientId) return json({ error: "clientId é obrigatório" }, 400);
    if (!(file instanceof File)) return json({ error: "Arquivo ausente" }, 400);
    // Gemini suporta até ~18MB inline; outros provedores: limite Whisper de 25MB
    if (file.size > 25 * 1024 * 1024)
      return json({ error: "Arquivo excede 25MB. Exporte só o áudio (MP3/M4A) do Premiere." }, 400);

    // Tenant guard padronizado
    const { requireClientAccess } = await import("../_shared/auth-guard.ts");
    const guard = await requireClientAccess(req, clientId);
    if (!guard.ok) return guard.response;
    const userId = guard.userId;

    // Resolve provider de transcrição via integrations (gemini, groq, openai)
    const trCfg = await getTranscribeConfig(admin, clientId);
    if (!trCfg) {
      return json(
        {
          error:
            "Nenhum provedor de transcrição configurado. Vá em Configurações > Integrações e selecione Gemini, Groq ou OpenAI com sua API key.",
        },
        400
      );
    }

    // Gemini inline limit (~20MB do request total — usamos margem de 18MB pro base64)
    if (trCfg.provider === "gemini" && file.size > 18 * 1024 * 1024) {
      return json(
        { error: "Arquivo excede 18MB para transcrição via Gemini inline. Reduza o áudio ou use Groq/OpenAI." },
        400
      );
    }

    let tr;
    try {
      tr = await transcribeAudio(trCfg, { file, language, prompt });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ic-transcribe] provider error:", msg);
      const friendly = /429/.test(msg)
        ? `Limite de uso do provedor (${trCfg.provider}) atingido. Aguarde e tente de novo.`
        : /50[234]/.test(msg)
        ? `Servidores do provedor (${trCfg.provider}) instáveis. Tente novamente em alguns minutos.`
        : /too large|413/i.test(msg)
        ? "Arquivo grande demais para o provedor. Reduza para MP3 mono 16kHz ou divida o áudio."
        : `Falha na transcrição: ${msg.slice(0, 300)}`;
      return json({ error: friendly }, 502);
    }

    const { data: inserted, error: insErr } = await admin
      .from("ic_transcriptions")
      .insert({
        client_id: clientId,
        user_id: userId,
        filename: file.name,
        duration_sec: tr.duration ?? null,
        language: tr.language ?? language ?? null,
        model: tr.model,
        full_text: tr.text ?? null,
        segments: tr.segments,
      })
      .select("*")
      .single();

    if (insErr) {
      console.error("Insert error", insErr);
      return json({ error: "Falha ao salvar transcrição" }, 500);
    }

    // Gera título IA a partir da transcrição inteira (sem fragmentar)
    if (inserted?.full_text && inserted.full_text.length > 30) {
      try {
        const llmConfig = await getClientLLMConfig(admin, clientId);
        const titleResp = await callLLM(llmConfig, {
          messages: [
            {
              role: "system",
              content:
                "Você dá títulos curtos e descritivos para transcrições políticas em português. Responda APENAS com o título — máximo 70 caracteres, sem aspas, sem ponto final, sem emojis. Capture o tema central (ex: 'Visita à UBS Moreninha 4 — promessa de novo PSF').",
            },
            {
              role: "user",
              content: `Transcrição:\n"""${(inserted.full_text as string).slice(0, 8000)}"""\n\nTítulo:`,
            },
          ],
          maxTokens: 60,
          temperature: 0.3,
        });
        const rawTitle = (titleResp.content || "")
          .replace(/["'`*]/g, "")
          .replace(/^título:\s*/i, "")
          .split("\n")[0]
          .trim()
          .slice(0, 80);
        if (rawTitle.length >= 5) {
          const { data: updated } = await admin
            .from("ic_transcriptions")
            .update({ filename: rawTitle })
            .eq("id", inserted.id)
            .select("*")
            .maybeSingle();
          if (updated) Object.assign(inserted, updated);
        }
      } catch (e) {
        console.error("[ic-transcribe] title generation failed:", e);
      }
    }

    // Fire-and-forget: extrai inteligência da transcrição
    if (inserted?.full_text && inserted.full_text.length > 50) {
      fetch(`${SUPABASE_URL}/functions/v1/ic-extract-knowledge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          clientId,
          sourceType: "transcription",
          sourceId: inserted.id,
          sourceDate: inserted.created_at,
          text: inserted.full_text,
          triggerSuggestions: true,
        }),
      }).catch((e) => console.error("[ic-transcribe] extract fire failed:", e));
    }

    return json({ transcription: inserted });
  } catch (e) {
    console.error("ic-transcribe fatal", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
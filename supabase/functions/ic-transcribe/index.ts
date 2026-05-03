import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";

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
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Sessão inválida" }, 401);
    const userId = userData.user.id;

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
    if (file.size > 25 * 1024 * 1024)
      return json({ error: "Arquivo excede 25MB. Exporte só o áudio (MP3/M4A) do Premiere." }, 400);

    // verify client access
    const { data: clientRow } = await admin
      .from("clients")
      .select("id,user_id")
      .eq("id", clientId)
      .maybeSingle();
    if (!clientRow) return json({ error: "Cliente não encontrado" }, 404);

    let allowed = clientRow.user_id === userId;
    if (!allowed) {
      const { data: tm } = await admin
        .from("team_members")
        .select("id")
        .eq("client_id", clientId)
        .eq("user_id", userId)
        .maybeSingle();
      allowed = !!tm;
    }
    if (!allowed) return json({ error: "Sem acesso a este cliente" }, 403);

    // Get Groq key from integrations (preferred) or env fallback
    const { data: integ } = await admin
      .from("integrations")
      .select("llm_provider, llm_api_key")
      .eq("client_id", clientId)
      .maybeSingle();

    let groqKey: string | null = null;
    if (integ?.llm_provider === "groq" && integ.llm_api_key) {
      groqKey = integ.llm_api_key as string;
    } else {
      groqKey = Deno.env.get("GROQ_API_KEY") ?? null;
    }
    if (!groqKey) {
      return json(
        {
          error:
            "Groq não configurado. Vá em Configurações > Integrações e selecione Groq como provedor de IA.",
        },
        400
      );
    }

    // Call Groq Whisper
    const groqForm = new FormData();
    groqForm.append("file", file, file.name);
    groqForm.append("model", "whisper-large-v3");
    groqForm.append("response_format", "verbose_json");
    groqForm.append("temperature", "0");
    if (language) groqForm.append("language", language);
    if (prompt) groqForm.append("prompt", prompt);

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: groqForm,
    });

    if (!groqRes.ok) {
      const txt = await groqRes.text();
      console.error("Groq error", groqRes.status, txt);
      return json({ error: `Groq (${groqRes.status}): ${txt.slice(0, 300)}` }, 502);
    }

    const result = await groqRes.json();
    const segments = (result.segments ?? []).map((s: any) => ({
      id: s.id,
      start: Number(s.start),
      end: Number(s.end),
      text: String(s.text ?? "").trim(),
    }));

    const { data: inserted, error: insErr } = await admin
      .from("ic_transcriptions")
      .insert({
        client_id: clientId,
        user_id: userId,
        filename: file.name,
        duration_sec: result.duration ?? null,
        language: result.language ?? language ?? null,
        model: "whisper-large-v3",
        full_text: result.text ?? null,
        segments,
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
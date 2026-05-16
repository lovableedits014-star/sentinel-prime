/**
 * Transcrição roteada pelo provider configurado em integrations.llm_provider.
 * Suporta: groq (Whisper), openai (Whisper), gemini (multimodal 2.5).
 * Retorna sempre no formato Whisper: { text, language, duration, segments[] }.
 */

export interface TranscribeInput {
  file: File;
  language?: string;
  prompt?: string;
}

export interface TranscribeOutput {
  text: string;
  language: string | null;
  duration: number | null;
  segments: Array<{ id: number; start: number; end: number; text: string }>;
  provider: string;
  model: string;
}

export interface TranscribeProviderConfig {
  provider: 'groq' | 'openai' | 'gemini';
  apiKey: string;
}

/**
 * Lê integrations.llm_provider/llm_api_key do tenant.
 * NÃO existe fallback global (ex.: GROQ_API_KEY env) — isolamento multi-tenant.
 * Retorna null quando o tenant não tem provedor de transcrição configurado;
 * o caller DEVE retornar erro explícito, nunca usar credencial compartilhada.
 */
export async function getTranscribeConfig(
  admin: any,
  clientId: string,
): Promise<TranscribeProviderConfig | null> {
  const { data: integ } = await admin
    .from('integrations')
    .select('llm_provider, llm_api_key')
    .eq('client_id', clientId)
    .maybeSingle();

  if (integ?.llm_api_key && ['groq', 'openai', 'gemini'].includes(integ.llm_provider)) {
    return { provider: integ.llm_provider, apiKey: integ.llm_api_key as string };
  }
  return null;
}

export async function transcribeAudio(
  cfg: TranscribeProviderConfig,
  input: TranscribeInput,
): Promise<TranscribeOutput> {
  if (cfg.provider === 'gemini') return transcribeViaGemini(cfg.apiKey, input);
  if (cfg.provider === 'openai') return transcribeViaWhisper(cfg.apiKey, input, 'openai');
  return transcribeViaWhisper(cfg.apiKey, input, 'groq');
}

// ---------- Whisper (Groq / OpenAI compartilham o mesmo formato) ----------
async function transcribeViaWhisper(
  apiKey: string,
  input: TranscribeInput,
  flavor: 'groq' | 'openai',
): Promise<TranscribeOutput> {
  const endpoint =
    flavor === 'groq'
      ? 'https://api.groq.com/openai/v1/audio/transcriptions'
      : 'https://api.openai.com/v1/audio/transcriptions';
  const model = flavor === 'groq' ? 'whisper-large-v3' : 'whisper-1';

  const form = new FormData();
  form.append('file', input.file, input.file.name);
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  if (input.language) form.append('language', input.language);
  if (input.prompt) form.append('prompt', input.prompt);

  const maxAttempts = 4;
  let last: Response | null = null;
  let lastErr = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      last = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (last.ok) break;
      if ([429, 500, 502, 503, 504].includes(last.status) && attempt < maxAttempts) {
        lastErr = await last.text().catch(() => '');
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
    }
  }
  if (!last || !last.ok) {
    const status = last?.status ?? 0;
    const txt = last ? await last.text().catch(() => lastErr) : lastErr;
    throw new Error(`${flavor} whisper ${status}: ${String(txt).slice(0, 300)}`);
  }
  const result = await last.json();
  const segments = (result.segments ?? []).map((s: any) => ({
    id: s.id,
    start: Number(s.start),
    end: Number(s.end),
    text: String(s.text ?? '').trim(),
  }));
  return {
    text: result.text ?? '',
    language: result.language ?? input.language ?? null,
    duration: result.duration ?? null,
    segments,
    provider: flavor,
    model,
  };
}

// ---------- Gemini 2.5 multimodal (áudio inline base64) ----------
async function transcribeViaGemini(apiKey: string, input: TranscribeInput): Promise<TranscribeOutput> {
  // Inline data limit: ~20MB no request total. Para arquivos maiores: Files API (não implementado aqui).
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  // base64 chunked p/ não estourar stack
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);

  const mimeType = input.file.type || guessMime(input.file.name);
  const lang = input.language || 'pt';
  const userInstr =
    `Transcreva o áudio em ${lang === 'pt' ? 'português brasileiro' : lang} com pontuação correta.\n` +
    `Divida em segmentos curtos (10-25s) com timestamps em segundos.\n` +
    `Responda APENAS com JSON válido, sem markdown, no formato:\n` +
    `{"language":"pt","duration":123.4,"text":"transcrição completa","segments":[{"id":0,"start":0.0,"end":5.2,"text":"..."}]}\n` +
    (input.prompt ? `\nContexto adicional para nomes/termos: ${input.prompt}` : '');

  const model = 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const maxAttempts = 4;
  let last: Response | null = null;
  let lastErr = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: b64 } },
              { text: userInstr },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
          maxOutputTokens: 8192,
        },
      }),
    });
    if (last.ok) break;
    if ([429, 500, 502, 503, 504].includes(last.status) && attempt < maxAttempts) {
      lastErr = await last.text().catch(() => '');
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    break;
  }
  if (!last || !last.ok) {
    const status = last?.status ?? 0;
    const txt = last ? await last.text().catch(() => lastErr) : lastErr;
    throw new Error(`gemini transcribe ${status}: ${String(txt).slice(0, 300)}`);
  }
  const data = await last.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // tenta extrair JSON do bloco
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Gemini não retornou JSON válido na transcrição.');
    parsed = JSON.parse(m[0]);
  }
  const segments = Array.isArray(parsed.segments)
    ? parsed.segments.map((s: any, i: number) => ({
        id: Number(s.id ?? i),
        start: Number(s.start ?? 0),
        end: Number(s.end ?? 0),
        text: String(s.text ?? '').trim(),
      }))
    : [];
  return {
    text: String(parsed.text ?? ''),
    language: parsed.language ?? input.language ?? null,
    duration: parsed.duration != null ? Number(parsed.duration) : null,
    segments,
    provider: 'gemini',
    model,
  };
}

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    webm: 'audio/webm',
    flac: 'audio/flac',
    aac: 'audio/aac',
  };
  return map[ext] || 'audio/mpeg';
}

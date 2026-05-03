/**
 * Helpers compartilhados das edge functions de Inteligência de Conteúdo.
 * IMPORTANTE: nunca usar Lovable AI aqui — sempre o provedor configurado pelo cliente
 * via `_shared/llm-router.ts`.
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Faz parse JSON defensivo (remove fences markdown e tenta extrair primeiro objeto). */
export function parseLooseJson<T = any>(raw: string): T {
  if (!raw) throw new Error("Resposta vazia do LLM");
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .replace(/^```/g, "")
    .trim();
  // Tenta direto
  try {
    return JSON.parse(cleaned) as T;
  } catch (_) {
    // Tenta extrair primeiro {...} ou [...]
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    const candidate = objMatch?.[0] || arrMatch?.[0];
    if (candidate) {
      try {
        return JSON.parse(candidate) as T;
      } catch (e) {
        console.error("[ic-utils] parseLooseJson falhou:", raw.slice(0, 500));
        throw new Error("LLM não retornou JSON válido");
      }
    }
    console.error("[ic-utils] parseLooseJson sem objeto:", raw.slice(0, 500));
    throw new Error("LLM não retornou JSON válido");
  }
}

/** Resposta de erro padronizada. */
export function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Resposta JSON padronizada. */
export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Sample helper — pega N elementos aleatórios. */
export function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
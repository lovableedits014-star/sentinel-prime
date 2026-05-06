// Shared embedding helper — uses Lovable AI Gateway (OpenAI-compatible /v1/embeddings).
// Model: google/text-embedding-004 → 768 dimensions (matches ic_knowledge_documents.embedding).

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
export const EMBEDDING_MODEL = "google/text-embedding-004";
export const EMBEDDING_DIMS = 768;

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente para gerar embeddings.");
  const input = (text || "").slice(0, 8000); // ~truncate
  if (!input.trim()) throw new Error("Texto vazio para embedding.");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Resposta de embedding inválida.");
  return vec;
}

/** Build the canonical text used for document embeddings. */
export function buildDocEmbeddingText(doc: {
  titulo?: string | null;
  resumo_executivo?: string | null;
  texto_integral?: string | null;
  tags?: string[] | null;
  bairros_citados?: any[] | null;
  pessoas_citadas?: any[] | null;
  propostas?: any[] | null;
  bandeiras?: any[] | null;
}): string {
  const flatten = (arr: any[] | null | undefined) =>
    Array.isArray(arr)
      ? arr.map((x) => (typeof x === "string" ? x : x?.nome || x?.texto || x?.titulo || "")).filter(Boolean).join(", ")
      : "";
  return [
    doc.titulo ? `Título: ${doc.titulo}` : "",
    doc.resumo_executivo ? `Resumo: ${doc.resumo_executivo}` : "",
    doc.tags?.length ? `Tags: ${doc.tags.join(", ")}` : "",
    flatten(doc.bairros_citados) && `Bairros: ${flatten(doc.bairros_citados)}`,
    flatten(doc.pessoas_citadas) && `Pessoas: ${flatten(doc.pessoas_citadas)}`,
    flatten(doc.propostas) && `Propostas: ${flatten(doc.propostas)}`,
    flatten(doc.bandeiras) && `Bandeiras: ${flatten(doc.bandeiras)}`,
    doc.texto_integral ? `Conteúdo: ${doc.texto_integral.slice(0, 4000)}` : "",
  ].filter(Boolean).join("\n");
}

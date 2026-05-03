import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * municipio-contexto-web
 * Busca em tempo real (sem persistência) contexto recente sobre um município.
 * Fontes 100% gratuitas e sem API key:
 *  - Wikipedia REST API (resumo enciclopédico)
 *  - Google News RSS (notícias dos últimos ~90 dias)
 *  - Bing News RSS (fallback / cobertura adicional)
 *  - Google News RSS filtrado por site:gov.br (decretos / portais oficiais)
 *
 * Body: { municipio: string, uf: string, max_news?: number }
 * Retorna: { wiki, noticias, oficiais, gerado_em }
 */

const NOW = () => new Date();
const MS_DAY = 86_400_000;

function decodeEntities(s: string): string {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseRssItems(xml: string, max = 8): Array<{ titulo: string; link: string; fonte: string; data: string; resumo: string }> {
  const items: Array<any> = [];
  const blockRe = /<item[\s\S]*?<\/item>/gi;
  const blocks = xml.match(blockRe) || [];
  for (const b of blocks.slice(0, max * 2)) {
    const title = (b.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");
    const link = (b.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const pubDate = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim();
    const description = (b.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");
    const source = (b.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");

    // Filtro de idade (últimos 120 dias para garantir margem)
    let ageMs = 0;
    if (pubDate) {
      const t = Date.parse(pubDate);
      if (!Number.isFinite(t)) continue;
      ageMs = Date.now() - t;
      if (ageMs > 120 * MS_DAY) continue;
    }

    items.push({
      titulo: decodeEntities(title),
      link: link,
      fonte: decodeEntities(source) || (() => {
        try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; }
      })(),
      data: pubDate ? new Date(pubDate).toISOString().slice(0, 10) : "",
      resumo: decodeEntities(description).slice(0, 280),
    });
    if (items.length >= max) break;
  }
  return items;
}

async function fetchWikipediaResumo(municipio: string, uf: string): Promise<{ extrato: string; url: string } | null> {
  // Tenta variações de título — preferência por desambiguação com UF
  const candidatos = [
    `${municipio} (${uf})`,
    `${municipio}, ${uf}`,
    `${municipio}`,
  ];
  for (const titulo of candidatos) {
    try {
      const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo)}`;
      const r = await fetch(url, {
        headers: { "User-Agent": "LovableAI-NarrativaPolitica/1.0 (contato@lovable.dev)" },
      });
      if (!r.ok) continue;
      const j = await r.json();
      if (j?.type === "disambiguation") continue;
      if (!j?.extract) continue;
      return {
        extrato: String(j.extract).slice(0, 800),
        url: j?.content_urls?.desktop?.page || `https://pt.wikipedia.org/wiki/${encodeURIComponent(titulo)}`,
      };
    } catch { /* tenta próximo */ }
  }
  return null;
}

/**
 * Busca a maior quantidade possível de informação útil da Wikipedia para o município:
 *  - Wikitext da página (para extrair Infobox: prefeito, área, altitude, gentílico, padroeiro, data fundação, símbolos, etc.)
 *  - Seções do índice (História, Geografia, Cultura, Economia, Política, Saúde, Educação, Transporte, etc.)
 *  - Lista de imagens (para futuros usos visuais)
 */
const SECOES_INTERESSE = [
  // Identidade
  "História", "Historia", "Etimologia", "Toponímia", "Toponimia", "Origem", "Formação",
  "Símbolos", "Simbolos", "Bandeira", "Brasão",
  // Geografia / ambiente
  "Geografia", "Localização", "Localizacao", "Clima", "Hidrografia", "Relevo",
  "Vegetação", "Vegetacao", "Fauna", "Flora", "Meio ambiente", "Geologia",
  // População
  "Demografia", "População", "Populacao",
  // Subdivisões
  "Subdivisões", "Subdivisoes", "Distritos", "Bairros", "Divisão administrativa", "Divisao administrativa",
  // Política
  "Política", "Politica", "Governo", "Administração", "Administracao", "Poder Executivo", "Poder Legislativo",
  // Economia
  "Economia", "Indústria", "Industria", "Comércio", "Comercio", "Agricultura", "Pecuária", "Pecuaria",
  "Serviços", "Servicos", "Turismo", "Setor primário", "Setor secundário", "Setor terciário",
  // Infraestrutura
  "Infraestrutura", "Transporte", "Transportes", "Saúde", "Saude", "Educação", "Educacao",
  "Comunicações", "Comunicacoes", "Energia", "Saneamento",
  // Cultura
  "Cultura", "Gastronomia", "Culinária", "Culinaria", "Festas", "Festas populares",
  "Eventos", "Festividades", "Religião", "Religiao", "Festejos religiosos",
  // Pessoas e patrimônio
  "Personalidades", "Filhos ilustres", "Naturais", "Patrimônio", "Patrimonio",
  "Pontos turísticos", "Atrações turísticas", "Museus", "Monumentos",
  // Esporte / mídia
  "Esportes", "Esporte", "Mídia", "Midia", "Imprensa",
];

async function fetchWikipediaPaginaCompleta(municipio: string, uf: string): Promise<{
  titulo_pagina: string;
  url: string;
  secoes: Record<string, string>;
  infobox: Record<string, string>;
  imagens: string[];
} | null> {
  const candidatos = [`${municipio} (${uf})`, `${municipio}, ${uf}`, `${municipio}`];

  for (const titulo of candidatos) {
    try {
      // 1) Lista de seções + wikitext da seção 0 (para infobox) + lista de imagens em paralelo
      const baseUrl = `https://pt.wikipedia.org/w/api.php`;
      const enc = encodeURIComponent(titulo);
      const [secRes, sec0Res, imgRes] = await Promise.all([
        fetch(`${baseUrl}?action=parse&page=${enc}&prop=sections&format=json&origin=*`, {
          headers: { "User-Agent": "LovableAI-NarrativaPolitica/1.0" },
        }),
        fetch(`${baseUrl}?action=parse&page=${enc}&section=0&prop=wikitext&format=json&origin=*`, {
          headers: { "User-Agent": "LovableAI-NarrativaPolitica/1.0" },
        }),
        fetch(`${baseUrl}?action=parse&page=${enc}&prop=images&format=json&origin=*`, {
          headers: { "User-Agent": "LovableAI-NarrativaPolitica/1.0" },
        }),
      ]);

      if (!secRes.ok || !sec0Res.ok) continue;
      const secJson = await secRes.json();
      const sec0Json = await sec0Res.json();
      const sections = secJson?.parse?.sections;
      const tituloReal = secJson?.parse?.title || titulo;
      if (!Array.isArray(sections) || sections.length === 0) continue;

      // Infobox a partir do wikitext da seção 0 (introdução)
      const wikitext0: string = sec0Json?.parse?.wikitext?.["*"] || "";
      const infobox = extrairInfobox(wikitext0);

      // Imagens (filtra ícones/comuns)
      let imagens: string[] = [];
      if (imgRes.ok) {
        const imgJson = await imgRes.json();
        const lista: string[] = imgJson?.parse?.images || [];
        imagens = lista
          .filter((n) =>
            !/(commons-logo|wiktionary|wikiquote|disambig|edit-icon|info icon|question_book|gnome-edit|ambox|loudspeaker|symbol_support_vote|symbol_oppose_vote|red_pog|crystal|nuvola|wiki_letter|portal\.svg|smiley)/i.test(n),
          )
          .slice(0, 10);
      }

      // Seções relevantes (até 20, top-level e nível 2)
      const out: Record<string, string> = {};
      const alvos = sections
        .filter(
          (s: any) =>
            (s.toclevel === 1 || s.toclevel === 2) &&
            SECOES_INTERESSE.some((nome) =>
              String(s.line || "").toLowerCase().includes(nome.toLowerCase()),
            ),
        )
        .slice(0, 20);

      const fetches = alvos.map(async (s: any) => {
        try {
          const cRes = await fetch(
            `${baseUrl}?action=parse&page=${enc}&section=${s.index}&prop=wikitext&format=json&origin=*`,
            { headers: { "User-Agent": "LovableAI-NarrativaPolitica/1.0" } },
          );
          if (!cRes.ok) return;
          const cJson = await cRes.json();
          const wikitext: string = cJson?.parse?.wikitext?.["*"] || "";
          const limpo = limparWikitext(wikitext).slice(0, 1500);
          if (limpo.length > 60) out[s.line] = limpo;
        } catch { /* ignora seção */ }
      });
      await Promise.all(fetches);

      if (Object.keys(out).length === 0 && Object.keys(infobox).length === 0) continue;

      return {
        titulo_pagina: tituloReal,
        url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(String(tituloReal).replace(/ /g, "_"))}`,
        secoes: out,
        infobox,
        imagens,
      };
    } catch { /* tenta próximo */ }
  }
  return null;
}

/**
 * Extrai a infobox de município (template "Info/Município do Brasil" ou similares)
 * do wikitext da seção 0. Retorna pares chave→valor já com wikitext limpo.
 */
function extrairInfobox(wt: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!wt) return out;

  // Localiza o início de uma infobox
  const startRe = /\{\{\s*(?:Info\/Munic[íi]pio do Brasil|Info\s+munic[íi]pio do Brasil|Infobox\s+(?:Brazilian|settlement|cidade)|Info\/Localidade)\b/i;
  const m = startRe.exec(wt);
  if (!m) return out;

  // Extrai o bloco balanceado começando em m.index
  let depth = 0;
  let i = m.index;
  let end = -1;
  while (i < wt.length) {
    if (wt.startsWith("{{", i)) { depth++; i += 2; continue; }
    if (wt.startsWith("}}", i)) { depth--; i += 2; if (depth === 0) { end = i; break; } continue; }
    i++;
  }
  if (end < 0) return out;
  const bloco = wt.slice(m.index + 2, end - 2);

  // Quebra por "|" no nível 0 (ignora pipes dentro de [[...]] ou {{...}})
  const partes: string[] = [];
  let buf = "";
  let dCh = 0; // [[ depth
  let dT = 0;  // {{ depth
  for (let k = 0; k < bloco.length; k++) {
    const c = bloco[k];
    const d2 = bloco.substr(k, 2);
    if (d2 === "[[") { dCh++; buf += d2; k++; continue; }
    if (d2 === "]]") { dCh--; buf += d2; k++; continue; }
    if (d2 === "{{") { dT++; buf += d2; k++; continue; }
    if (d2 === "}}") { dT--; buf += d2; k++; continue; }
    if (c === "|" && dCh === 0 && dT === 0) { partes.push(buf); buf = ""; continue; }
    buf += c;
  }
  if (buf.trim()) partes.push(buf);
  // descarta primeiro elemento (nome do template)
  partes.shift();

  // Pares chave=valor — campos de interesse
  const CAMPOS_OK = new Set([
    "nome_oficial", "nome", "apelido", "lema", "padroeiro",
    "uf", "estado", "região", "regiao", "região_metropolitana", "regiao_metropolitana",
    "mesorregião", "mesorregiao", "microrregião", "microrregiao",
    "data_fundação", "data_fundacao", "fundação", "fundacao", "aniversário", "aniversario",
    "prefeito", "prefeito_partido", "vice_prefeito", "vice_prefeito_partido",
    "vereadores", "câmara", "camara",
    "área", "area", "área_total_km2", "area_total_km2",
    "altitude", "altitude_m",
    "população", "populacao", "população_total", "populacao_total",
    "população_urbana", "populacao_urbana", "população_rural", "populacao_rural",
    "densidade", "densidade_demográfica", "densidade_demografica",
    "clima", "fuso_horário", "fuso_horario",
    "gentílico", "gentilico",
    "idh", "idh_ano", "pib", "pib_ano", "pib_per_capita",
    "distrito", "distritos", "limites", "limítrofes", "limitrofes", "municípios_limítrofes", "municipios_limitrofes",
    "rios", "bacia",
    "site", "url",
    "imagem_brasão", "imagem_brasao", "imagem_bandeira", "imagem_mapa", "imagem",
  ]);

  for (const p of partes) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase().replace(/\s+/g, "_");
    const vRaw = p.slice(eq + 1).trim();
    if (!CAMPOS_OK.has(k)) continue;
    const v = limparWikitext(vRaw).replace(/\s+/g, " ").trim().slice(0, 240);
    if (v && v.length > 0 && !/^—|^\?+$/.test(v)) out[k] = v;
  }
  return out;
}

function limparWikitext(wt: string): string {
  let t = wt;
  for (let i = 0; i < 6; i++) {
    const before = t.length;
    t = t.replace(/\{\{[^{}]*\}\}/g, "");
    if (t.length === before) break;
  }
  t = t.replace(/\{\|[\s\S]*?\|\}/g, "");
  t = t.replace(/<ref[^>]*\/>/gi, "");
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/\[\[(?:Ficheiro|Arquivo|File|Imagem|Image):[^\]]*\]\]/gi, "");
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  t = t.replace(/\[\[([^\]]+)\]\]/g, "$1");
  t = t.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1");
  t = t.replace(/\[https?:\/\/\S+\]/g, "");
  t = t.replace(/'{2,5}/g, "");
  t = t.replace(/^={2,}\s*([^=]+?)\s*={2,}\s*$/gm, "$1.");
  t = t.replace(/^[*#:;]+\s*/gm, "• ");
  t = t.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

async function fetchGoogleNews(query: string, max: number): Promise<any[]> {
  // Restringe a últimos 90 dias via parâmetro `when:90d`
  const q = `${query} when:90d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 LovableNarrativa/1.0" } });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRssItems(xml, max);
  } catch (e) {
    console.warn("Google News falhou:", (e as Error).message);
    return [];
  }
}

async function fetchBingNews(query: string, max: number): Promise<any[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=pt-br`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 LovableNarrativa/1.0" } });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRssItems(xml, max);
  } catch (e) {
    console.warn("Bing News falhou:", (e as Error).message);
    return [];
  }
}

function dedupNoticias(arr: any[], max: number): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const it of arr) {
    const key = (it.titulo || "").toLowerCase().slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= max) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { municipio, uf, max_news = 8 } = await req.json();
    if (!municipio || !uf) {
      return new Response(JSON.stringify({ error: "municipio e uf obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const queryNoticias = `"${municipio}" ${uf} (prefeitura OR câmara OR vereador OR prefeito OR obra OR decreto OR investigação)`;
    const queryOficiais = `${municipio} ${uf} site:gov.br`;

    // Busca em paralelo — todas independentes
    const [wiki, wikiPagina, googleNews, bingNews, oficiais] = await Promise.all([
      fetchWikipediaResumo(municipio, uf),
      fetchWikipediaPaginaCompleta(municipio, uf),
      fetchGoogleNews(queryNoticias, max_news),
      fetchBingNews(`${municipio} ${uf} prefeitura`, Math.ceil(max_news / 2)),
      fetchGoogleNews(queryOficiais, 5),
    ]);

    const noticias = dedupNoticias([...googleNews, ...bingNews], max_news);
    // Google News encapsula a URL real; .gov.br aparece no título/fonte/resumo.
    const oficiaisFiltrados = oficiais
      .filter((n) => /\.gov\.br/i.test(`${n.link} ${n.fonte} ${n.titulo} ${n.resumo}`))
      .slice(0, 5);

    return new Response(JSON.stringify({
      municipio,
      uf,
      gerado_em: NOW().toISOString(),
      wiki,
      wiki_pagina: wikiPagina,
      // alias retrocompatível para clientes antigos
      wiki_secoes: wikiPagina ? {
        titulo_pagina: wikiPagina.titulo_pagina,
        url: wikiPagina.url,
        secoes: wikiPagina.secoes,
      } : null,
      noticias,
      oficiais: oficiaisFiltrados,
      _stats: {
        wiki: wiki ? 1 : 0,
        wiki_secoes: wikiPagina ? Object.keys(wikiPagina.secoes).length : 0,
        wiki_infobox: wikiPagina ? Object.keys(wikiPagina.infobox).length : 0,
        wiki_imagens: wikiPagina ? wikiPagina.imagens.length : 0,
        noticias: noticias.length,
        oficiais: oficiaisFiltrados.length,
      },
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "erro desconhecido";
    console.error("municipio-contexto-web error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
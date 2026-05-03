const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * preview-social-profile
 * Dado { platform, handle } devolve { name, avatarUrl, canonicalUrl, found }.
 * Usado pelo fluxo guiado de captura de redes sociais para mostrar
 * "É você?" com foto + nome antes do apoiador confirmar.
 */

type Platform = 'facebook' | 'instagram';

const cache = new Map<string, { value: any; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(key: string, value: any) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

const FB_HEADERS = {
  'User-Agent': 'facebookexternalhit/1.1',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// Para o Instagram, o User-Agent do bot do FB devolve uma página vazia.
// Usar User-Agent de iPhone real costuma servir og:image e og:title corretos.
const IG_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const m = html.match(re);
  return m?.[1] || null;
}

function metaContentReverse(html: string, prop: string): string | null {
  // <meta content="..." property="og:image">
  const re = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    'i',
  );
  const m = html.match(re);
  return m?.[1] || null;
}

async function fetchHtml(url: string, headers: Record<string, string> = FB_HEADERS): Promise<string | null> {
  try {
    const res = await fetch(url, { headers, redirect: 'follow' });
    if (!res.ok) {
      await res.text().catch(() => '');
      return null;
    }
    return await res.text();
  } catch (e) {
    console.warn('fetchHtml failed:', url, e);
    return null;
  }
}

async function previewFacebook(handle: string) {
  const isNumeric = /^\d+$/.test(handle);
  const canonicalUrl = isNumeric
    ? `https://www.facebook.com/profile.php?id=${handle}`
    : `https://www.facebook.com/${handle}`;

  // Avatar via Graph API (endpoint público, devolve redirect 302 para a imagem real)
  const avatarUrl = `https://graph.facebook.com/${handle}/picture?type=large&redirect=true`;

  // Nome via og:title da página pública
  const html = await fetchHtml(canonicalUrl);
  let name: string | null = null;
  if (html) {
    name =
      metaContent(html, 'og:title') ||
      metaContentReverse(html, 'og:title') ||
      null;
    if (name) {
      // FB às vezes adiciona " | Facebook" no título
      name = name.replace(/\s*\|\s*Facebook\s*$/i, '').trim() || null;
    }
  }

  return {
    found: true,
    name,
    avatarUrl,
    canonicalUrl,
  };
}

async function previewInstagram(handle: string) {
  const clean = handle.replace(/^@/, '');
  const canonicalUrl = `https://www.instagram.com/${clean}/`;
  const html = await fetchHtml(canonicalUrl, IG_HEADERS);
  if (!html) {
    return {
      found: false,
      name: null,
      avatarUrl: null,
      canonicalUrl,
    };
  }

  let avatarUrl =
    metaContent(html, 'og:image') ||
    metaContentReverse(html, 'og:image') ||
    null;

  let name =
    metaContent(html, 'og:title') ||
    metaContentReverse(html, 'og:title') ||
    null;

  if (name) {
    // og:title do IG vem como "Nome (@handle) • Instagram photos and videos"
    name = name.replace(/\s*•\s*Instagram.*$/i, '').trim();
    name = name.replace(/\s*\(@[^)]+\)\s*$/i, '').trim() || null;
  }

  // Heurística simples para detectar página de "perfil não existe"
  const looksMissing = /Sorry, this page isn|Page Not Found|isn't available/i.test(html);

  return {
    found: !looksMissing && (Boolean(name) || Boolean(avatarUrl)),
    name,
    avatarUrl,
    canonicalUrl,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const platform = String(body?.platform || '').toLowerCase() as Platform;
    const handleRaw = String(body?.handle || '').trim().replace(/^@/, '');

    if (!handleRaw) {
      return new Response(JSON.stringify({ error: 'handle é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (platform !== 'facebook' && platform !== 'instagram') {
      return new Response(JSON.stringify({ error: 'plataforma não suportada' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cacheKey = `${platform}:${handleRaw.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result =
      platform === 'facebook'
        ? await previewFacebook(handleRaw)
        : await previewInstagram(handleRaw);

    setCached(cacheKey, result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('preview-social-profile error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
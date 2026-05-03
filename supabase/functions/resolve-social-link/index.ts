const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Resolve um link "curto" / de share (ex: facebook.com/share/xxx)
 * para o handle/usuário real do perfil. Suporta Facebook e Instagram.
 *
 * Estratégia:
 *  1) Se já é um link "limpo" (facebook.com/<handle>, instagram.com/<handle>),
 *     extrai direto sem fazer rede.
 *  2) Caso contrário, segue redirects (curl-like) e analisa a Location final.
 *     Mesmo quando o destino é a página de login do FB, o parâmetro `next`
 *     contém a URL canônica do perfil.
 */

const BLOCKLIST = new Set([
  'share', 'sharer', 'share.php', 'dialog', 'events', 'groups',
  'pages', 'permalink.php', 'story.php', 'watch', 'reel', 'reels',
  'p', 'stories', 'explore', 'tv', 'accounts', 'login', 'signup',
  'home.php', 'help', 'policies',
]);

function extractFromCleanUrl(platform: string, url: URL): string | null {
  if (platform === 'facebook' && url.pathname.includes('profile.php')) {
    const id = url.searchParams.get('id');
    return id && /^\d+$/.test(id) ? id : null;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (!segments.length) return null;
  const first = segments[0];
  if (BLOCKLIST.has(first.toLowerCase())) return null;
  // valida formato de handle
  if (platform === 'instagram' && !/^[a-zA-Z0-9._]+$/.test(first)) return null;
  if (platform === 'facebook' && !/^[a-zA-Z0-9.]+$/.test(first)) return null;
  return first.replace(/^@/, '');
}

function safeParseUrl(raw: string): URL | null {
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

async function followAndResolve(platform: string, url: URL): Promise<string | null> {
  // 1) tentativa direta
  const direct = extractFromCleanUrl(platform, url);
  if (direct) return direct;

  // Lista de User-Agents pra tentar — bots costumam receber resposta server-rendered
  // mais previsível e SEM página interstitial JS.
  const userAgents = [
    'facebookexternalhit/1.1',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile',
  ];

  for (const ua of userAgents) {
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': ua,
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      // 1) Tentar URL final do navegador (após todos os redirects)
      const finalUrl = safeParseUrl(res.url);
      if (finalUrl) {
        // FB redireciona para /login/?next=<perfil> — extrair next
        if (
          platform === 'facebook' &&
          finalUrl.pathname.includes('/login') &&
          finalUrl.searchParams.get('next')
        ) {
          const decoded = safeParseUrl(decodeURIComponent(finalUrl.searchParams.get('next')!));
          if (decoded) {
            const handle = extractFromCleanUrl(platform, decoded);
            if (handle) return handle;
          }
        }
        const handle = extractFromCleanUrl(platform, finalUrl);
        if (handle) return handle;
      }

      // 2) Tentar HTML (og:url / canonical)
      try {
        const html = await res.text();
        const ogMatch = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
        const canMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
        // FB às vezes coloca a URL real dentro de scripts: "userVanity":"mayer.baclan"
        const vanityMatch = html.match(/"userVanity"\s*:\s*"([a-zA-Z0-9.]+)"/i);
        const profileLinkMatch = html.match(/href=["']https?:\/\/(?:www\.|m\.)?facebook\.com\/([a-zA-Z0-9.]+)["']/i);

        if (platform === 'facebook' && vanityMatch?.[1]) return vanityMatch[1];

        for (const candidate of [ogMatch?.[1], canMatch?.[1]]) {
          if (!candidate) continue;
          const u = safeParseUrl(candidate);
          if (u) {
            const handle = extractFromCleanUrl(platform, u);
            if (handle) return handle;
          }
        }

        // último recurso para Instagram: meta com username
        if (platform === 'instagram') {
          const igMatch =
            html.match(/"username"\s*:\s*"([a-zA-Z0-9._]+)"/i) ||
            html.match(/@([a-zA-Z0-9._]+)\s*[\u2022•]/i);
          if (igMatch?.[1]) return igMatch[1];
        }

        if (platform === 'facebook' && profileLinkMatch?.[1]) {
          const candidate = profileLinkMatch[1];
          if (!BLOCKLIST.has(candidate.toLowerCase())) return candidate;
        }
      } catch {
        // ignore html parse errors
      }
    } catch (err) {
      console.warn(`Falha ao buscar com UA "${ua}":`, err);
    }
  }

  return null;
}

function detectPlatform(url: URL): 'facebook' | 'instagram' | null {
  const host = url.hostname.toLowerCase();
  if (host.includes('facebook.com') || host.includes('fb.com') || host === 'fb.me') return 'facebook';
  if (host.includes('instagram.com')) return 'instagram';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url, platform: hintedPlatform } = await req.json();
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'url é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = safeParseUrl(url.trim());
    if (!parsed) {
      return new Response(JSON.stringify({ error: 'URL inválida' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const platform = (hintedPlatform as string) || detectPlatform(parsed);
    if (!platform || (platform !== 'facebook' && platform !== 'instagram')) {
      return new Response(JSON.stringify({ error: 'Plataforma não suportada' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const handle = await followAndResolve(platform, parsed);

    if (!handle) {
      return new Response(
        JSON.stringify({ resolved: false, error: 'Não foi possível identificar o usuário' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const profileUrl =
      platform === 'instagram'
        ? `https://www.instagram.com/${handle}`
        : /^\d+$/.test(handle)
        ? `https://www.facebook.com/profile.php?id=${handle}`
        : `https://www.facebook.com/${handle}`;

    return new Response(
      JSON.stringify({ resolved: true, platform, usuario: handle, url: profileUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('resolve-social-link error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
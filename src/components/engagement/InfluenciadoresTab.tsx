import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, RefreshCw, Award, Crown, Medal, Trophy, Star, ThumbsUp, ThumbsDown, Minus, Facebook, Instagram,
} from "lucide-react";
import { Wand2, Activity } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EngagementDiagnostics from "./EngagementDiagnostics";
import AutoresolveScheduler from "./AutoresolveScheduler";

type Influencer = {
  supporterId: string;
  registeredName: string;
  origin: "pessoa" | "funcionario" | "contratado" | "apoiador";
  category: string; // chave de filtro: "apoiador" | "funcionario" | "lider" | "liderado" | "indicado" | "lideranca" | "influenciador" | "voluntario" | "jornalista" | "eleitor" | "cidadao" | "adversario" | "outro"
  authorPicture: string | null;
  platforms: Set<string>;
  totalComments: number;
  totalReactions: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  repliesReceived: number;
  uniquePosts: number;
  firstSeen: string;
  lastSeen: string;
  score: number;
  byPlatform: Record<string, { comments: number; reactions: number; replies: number; posts: number; pos: number; neg: number; neu: number }>;
  profileUrls: Record<string, string>;
  profilePictures: Record<string, string>;
};

function computeScore(inf: Influencer): number {
  return (
    inf.totalComments * 3 +
    inf.totalReactions * 1 +
    inf.repliesReceived * 5 +
    inf.uniquePosts * 2 +
    inf.positiveCount * 1 +
    inf.negativeCount * 2
  );
}

const ORIGIN_LABEL: Record<Influencer["origin"], string> = {
  pessoa: "CRM",
  funcionario: "Funcionário",
  contratado: "Contratado",
  apoiador: "Apoiador",
};

const CATEGORY_LABEL: Record<string, string> = {
  apoiador: "Apoiador",
  funcionario: "Funcionário",
  lider: "Líder",
  liderado: "Liderado",
  indicado: "Indicado",
  lideranca: "Liderança",
  influenciador: "Influenciador",
  voluntario: "Voluntário",
  jornalista: "Jornalista",
  eleitor: "Eleitor",
  cidadao: "Cidadão",
  adversario: "Adversário",
  outro: "Outro",
};

const PlatformBadges = ({
  platforms,
  breakdown,
  urls,
  pictures,
}: {
  platforms: string[];
  breakdown: Influencer["byPlatform"];
  urls: Record<string, string>;
  pictures: Record<string, string>;
}) => (
  <div className="flex flex-wrap gap-1">
    {platforms.map((p) => {
      const b = breakdown[p];
      const Icon = p === "instagram" ? Instagram : Facebook;
      const url = urls[p];
      const pic = pictures[p];
      const content = (
        <>
          {pic ? (
            <Avatar className="w-3.5 h-3.5">
              <AvatarImage src={pic} />
              <AvatarFallback><Icon className="w-2 h-2" /></AvatarFallback>
            </Avatar>
          ) : (
            <Icon className="w-3 h-3" />
          )}
          {b?.comments || 0}
        </>
      );
      if (url) {
        return (
          <a
            key={p}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Abrir perfil no ${p === "instagram" ? "Instagram" : "Facebook"}`}
          >
            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 hover:bg-accent hover:border-primary cursor-pointer transition-colors">
              {content}
            </Badge>
          </a>
        );
      }
      return (
        <Badge key={p} variant="outline" className="text-[10px] gap-1 px-1.5 py-0 opacity-70">
          {content}
        </Badge>
      );
    })}
  </div>
);

function buildProfileUrl(platform: string, username: string | null, platformUserId: string): string | null {
  if (platform === "instagram") {
    const handle = (username || platformUserId || "").replace(/^@/, "").trim();
    if (!handle) return null;
    return `https://instagram.com/${handle}`;
  }
  if (platform === "facebook") {
    if (username && /^[a-zA-Z0-9.]+$/.test(username)) return `https://facebook.com/${username}`;
    if (platformUserId && /^\d+$/.test(platformUserId)) return `https://facebook.com/${platformUserId}`;
    if (username) return `https://facebook.com/${username}`;
    return null;
  }
  return null;
}

// ===== Cache de fotos de perfil (localStorage) =====
// Estrutura: { [supporterId:platform]: { url: string, ts: number } }
const PIC_CACHE_KEY = "engagement.profilePics.v1";
const PIC_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — revalida diariamente

type PicCache = Record<string, { url: string; ts: number }>;

function loadPicCache(): PicCache {
  try {
    const raw = localStorage.getItem(PIC_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PicCache;
  } catch {
    return {};
  }
}

function savePicCache(cache: PicCache) {
  try {
    localStorage.setItem(PIC_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // quota exceeded — limpa entradas antigas
    try {
      const now = Date.now();
      const trimmed: PicCache = {};
      for (const [k, v] of Object.entries(cache)) {
        if (now - v.ts < PIC_CACHE_TTL_MS) trimmed[k] = v;
      }
      localStorage.setItem(PIC_CACHE_KEY, JSON.stringify(trimmed));
    } catch { /* desiste silenciosamente */ }
  }
}

function picCacheGet(cache: PicCache, supporterId: string, platform: string): string | null {
  const entry = cache[`${supporterId}:${platform}`];
  if (!entry) return null;
  if (Date.now() - entry.ts > PIC_CACHE_TTL_MS) return null; // expirado → força revalidação
  return entry.url;
}

function picCacheSet(cache: PicCache, supporterId: string, platform: string, url: string) {
  cache[`${supporterId}:${platform}`] = { url, ts: Date.now() };
}

const RANK_ICONS = [Crown, Trophy, Medal];
const RANK_COLORS = ["text-amber-500", "text-muted-foreground", "text-orange-400"];

const SentimentBar = ({ pos, neg, neu }: { pos: number; neg: number; neu: number }) => {
  const total = pos + neg + neu;
  if (total === 0) return null;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-muted w-full min-w-[60px]">
      {pos > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${(pos / total) * 100}%` }} />}
      {neu > 0 && <div className="bg-muted-foreground/30 h-full" style={{ width: `${(neu / total) * 100}%` }} />}
      {neg > 0 && <div className="bg-destructive h-full" style={{ width: `${(neg / total) * 100}%` }} />}
    </div>
  );
};

export default function InfluenciadoresTab({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [days, setDays] = useState(30);
  const [categoryFilter, setCategoryFilter] = useState<string>("todos");

  const fetchData = async () => {
    setLoading(true);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const picCache = loadPicCache();
    let cacheDirty = false;

    // 1) Carrega TODAS as entidades cadastradas (com ou sem supporter_id)
    //    para cruzar por supporter_id direto, telefone e nome normalizado.
    const [pessoasRes, funcionariosRes, contratadosRes, indicadosRes, accountsRes] = await Promise.all([
      supabase.from("pessoas").select("supporter_id, nome, tipo_pessoa, telefone").eq("client_id", clientId),
      supabase.from("funcionarios").select("supporter_id, nome, telefone, redes_sociais").eq("client_id", clientId),
      supabase.from("contratados" as any).select("nome, telefone, is_lider, redes_sociais").eq("client_id", clientId),
      supabase.from("contratado_indicados" as any).select("nome, telefone").eq("client_id", clientId),
      supabase.from("supporter_accounts").select("supporter_id, name, instagram_username, facebook_username").eq("client_id", clientId).not("supporter_id", "is", null),
    ]);

    // Helpers de normalização
    const normName = (s: string | null | undefined) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const normPhone = (s: string | null | undefined) => (s || "").replace(/\D/g, "").replace(/^55/, "");
    // Tokens significativos (>= 3 letras) para matching tolerante por intersecção
    // Ex.: "MAYER RODRIGUES BACLAN" ∩ "Mayer Baclan" = {mayer, baclan} → match
    const STOP_TOKENS = new Set(["da", "de", "do", "das", "dos", "e", "jr", "neto", "filho", "the"]);
    const nameTokens = (s: string | null | undefined): string[] => {
      const base = (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return base
        .split(/[^a-z0-9]+/)
        .map((t) => t.replace(/\d+$/, "")) // remove sufixos numéricos tipo "014"
        .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
    };
    const PRIORITY: Record<string, number> = {
      funcionario: 100, lider: 90, liderado: 80, indicado: 70,
      lideranca: 60, influenciador: 55, voluntario: 50, jornalista: 45,
      apoiador: 40, eleitor: 30, cidadao: 20, adversario: 15, outro: 10,
    };
    const VALID_TIPOS = new Set(["lider", "liderado", "indicado", "lideranca", "apoiador", "influenciador", "voluntario", "jornalista", "eleitor", "cidadao", "adversario"]);

    // Índices por nome (exato) e telefone → { category, name, origin }
    type CategoryHit = { name: string; origin: Influencer["origin"]; category: string };
    const byName = new Map<string, CategoryHit>();
    const byPhone = new Map<string, CategoryHit>();
    // Lista de hits cadastrados (para matching tolerante por tokens)
    const registeredHits: Array<{ tokens: string[]; hit: CategoryHit }> = [];
    const upsertHit = (key: string, store: Map<string, CategoryHit>, hit: CategoryHit) => {
      if (!key) return;
      const existing = store.get(key);
      if (!existing || (PRIORITY[hit.category] || 0) > (PRIORITY[existing.category] || 0)) {
        store.set(key, hit);
      }
    };
    const registerHit = (hit: CategoryHit) => {
      const toks = nameTokens(hit.name);
      if (toks.length > 0) registeredHits.push({ tokens: toks, hit });
    };

    // funcionários (alta prioridade)
    for (const r of (funcionariosRes.data || []) as any[]) {
      const hit: CategoryHit = { name: r.nome, origin: "funcionario", category: "funcionario" };
      upsertHit(normName(r.nome), byName, hit);
      upsertHit(normPhone(r.telefone), byPhone, hit);
      registerHit(hit);
    }
    // contratados (líder ou liderado)
    for (const r of (contratadosRes.data || []) as any[]) {
      const cat = r.is_lider ? "lider" : "liderado";
      const hit: CategoryHit = { name: r.nome, origin: "contratado", category: cat };
      upsertHit(normName(r.nome), byName, hit);
      upsertHit(normPhone(r.telefone), byPhone, hit);
      registerHit(hit);
    }
    // indicados (de líderes)
    for (const r of (indicadosRes.data || []) as any[]) {
      const hit: CategoryHit = { name: r.nome, origin: "contratado", category: "indicado" };
      upsertHit(normName(r.nome), byName, hit);
      upsertHit(normPhone(r.telefone), byPhone, hit);
      registerHit(hit);
    }
    // pessoas (CRM)
    for (const r of (pessoasRes.data || []) as any[]) {
      const tipo = (r.tipo_pessoa as string) || "cidadao";
      const cat = VALID_TIPOS.has(tipo) ? tipo : "outro";
      const hit: CategoryHit = { name: r.nome, origin: "pessoa", category: cat };
      upsertHit(normName(r.nome), byName, hit);
      upsertHit(normPhone(r.telefone), byPhone, hit);
      registerHit(hit);
    }
    // apoiadores do portal
    for (const r of (accountsRes.data || []) as any[]) {
      const hit: CategoryHit = { name: r.name, origin: "apoiador", category: "apoiador" };
      upsertHit(normName(r.name), byName, hit);
      // não registramos apoiador para matching tolerante — evita "promover" categorias por colisão de primeiro nome
    }

    // Função de matching tolerante: para um nome de supporter, tenta encontrar
    // o melhor cadastro com pelo menos 2 tokens em comum (ou 1 token se o nome do supporter só tem 1 token).
    const findBestHitByTokens = (supporterName: string): CategoryHit | null => {
      const supTokens = nameTokens(supporterName);
      if (supTokens.length === 0) return null;
      const minOverlap = supTokens.length === 1 ? 1 : 2;
      let best: { hit: CategoryHit; score: number } | null = null;
      for (const { tokens, hit } of registeredHits) {
        const overlap = tokens.filter((t) => supTokens.includes(t)).length;
        if (overlap < minOverlap) continue;
        const prio = PRIORITY[hit.category] || 0;
        const composite = overlap * 1000 + prio;
        if (!best || composite > best.score) best = { hit, score: composite };
      }
      return best?.hit || null;
    };

    // 2) Mapa supporter_id → meta (por supporter_id direto)
    const supporterMeta = new Map<string, { name: string; origin: Influencer["origin"]; category: string }>();
    const upsertSupporter = (supporterId: string | null | undefined, hit: CategoryHit) => {
      if (!supporterId) return;
      const existing = supporterMeta.get(supporterId);
      if (!existing || (PRIORITY[hit.category] || 0) > (PRIORITY[existing.category] || 0)) {
        supporterMeta.set(supporterId, hit);
      }
    };
    // Aplica supporter_id direto onde existe
    for (const r of (accountsRes.data || []) as any[]) {
      upsertSupporter(r.supporter_id, { name: r.name, origin: "apoiador", category: "apoiador" });
    }
    for (const r of (funcionariosRes.data || []) as any[]) {
      if (r.supporter_id) upsertSupporter(r.supporter_id, { name: r.nome, origin: "funcionario", category: "funcionario" });
    }
    for (const r of (pessoasRes.data || []) as any[]) {
      if (r.supporter_id) {
        const tipo = (r.tipo_pessoa as string) || "cidadao";
        const cat = VALID_TIPOS.has(tipo) ? tipo : "outro";
        upsertSupporter(r.supporter_id, { name: r.nome, origin: "pessoa", category: cat });
      }
    }

    // 3) RECLASSIFICAÇÃO: para cada supporter já mapeado, tenta promover categoria.
    //    1º — match exato por nome normalizado.
    //    2º — match tolerante por intersecção de tokens (ex.: "Mayer Baclan" ↔ "MAYER RODRIGUES BACLAN").
    for (const [sid, meta] of supporterMeta.entries()) {
      const exact = byName.get(normName(meta.name));
      if (exact && (PRIORITY[exact.category] || 0) > (PRIORITY[meta.category] || 0)) {
        supporterMeta.set(sid, exact);
        continue;
      }
      const tokenHit = findBestHitByTokens(meta.name);
      if (tokenHit && (PRIORITY[tokenHit.category] || 0) > (PRIORITY[meta.category] || 0)) {
        supporterMeta.set(sid, tokenHit);
      }
    }

    const supporterIds = Array.from(supporterMeta.keys());
    if (supporterIds.length === 0) {
      setInfluencers([]);
      setLoading(false);
      return;
    }

    // 2) Busca perfis sociais (platform + platform_user_id) desses supporters
    const profileKeyToSupporter = new Map<string, string>();
    const supporterProfileUrls = new Map<string, Record<string, string>>();
    {
      let pFrom = 0;
      const pSize = 1000;
      while (true) {
        const { data } = await supabase
          .from("supporter_profiles")
          .select("supporter_id, platform, platform_user_id, platform_username")
          .in("supporter_id", supporterIds)
          .range(pFrom, pFrom + pSize - 1);
        if (!data || data.length === 0) break;
        for (const sp of data) {
          profileKeyToSupporter.set(`${sp.platform}:${sp.platform_user_id}`, sp.supporter_id);
          const url = buildProfileUrl(sp.platform, (sp as any).platform_username, sp.platform_user_id);
          if (url) {
            const existing = supporterProfileUrls.get(sp.supporter_id) || {};
            existing[sp.platform] = url;
            supporterProfileUrls.set(sp.supporter_id, existing);
          }
        }
        pFrom += pSize;
        if (data.length < pSize) break;
      }
    }

    if (profileKeyToSupporter.size === 0) {
      setInfluencers([]);
      setLoading(false);
      return;
    }

    let allComments: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from("comments")
        .select("platform_user_id, author_name, author_profile_picture, platform, sentiment, post_id, parent_comment_id, comment_created_time, is_page_owner, text, comment_id")
        .eq("client_id", clientId)
        .eq("is_page_owner", false)
        .gte("created_at", since)
        .neq("text", "__post_stub__")
        .range(from, from + pageSize - 1);
      if (data && data.length > 0) {
        // filtra apenas os vinculados a entidades cadastradas
        const filtered = data.filter((c) =>
          profileKeyToSupporter.has(`${c.platform || "facebook"}:${c.platform_user_id}`)
        );
        allComments = allComments.concat(filtered);
        from += pageSize;
        if (data.length < pageSize) break;
      } else break;
    }

    let replies: any[] = [];
    from = 0;
    while (true) {
      const { data } = await supabase
        .from("comments")
        .select("parent_comment_id")
        .eq("client_id", clientId)
        .eq("is_page_owner", true)
        .gte("created_at", since)
        .not("parent_comment_id", "is", null)
        .range(from, from + pageSize - 1);
      if (data && data.length > 0) {
        replies = replies.concat(data);
        from += pageSize;
        if (data.length < pageSize) break;
      } else break;
    }

    const replyCountByParent = new Map<string, number>();
    for (const r of replies) {
      replyCountByParent.set(r.parent_comment_id, (replyCountByParent.get(r.parent_comment_id) || 0) + 1);
    }

    // 2.5) Busca reactions/likes (engagement_actions) do período
    //      action_type != 'comment' (que já contamos via comments).
    let allReactions: any[] = [];
    {
      let rFrom = 0;
      while (true) {
        const { data } = await supabase
          .from("engagement_actions")
          .select("supporter_id, platform, action_type, action_date, post_id")
          .eq("client_id", clientId)
          .in("supporter_id", supporterIds as any)
          .neq("action_type", "comment")
          .gte("action_date", since)
          .range(rFrom, rFrom + pageSize - 1);
        if (data && data.length > 0) {
          allReactions = allReactions.concat(data);
          rFrom += pageSize;
          if (data.length < pageSize) break;
        } else break;
      }
    }

    // Agrupa por supporterId (unifica Facebook + Instagram)
    const map = new Map<string, Influencer>();
    for (const c of allComments) {
      if (!c.platform_user_id) continue;
      const platform = c.platform || "facebook";
      const key = `${platform}:${c.platform_user_id}`;
      const supporterId = profileKeyToSupporter.get(key);
      if (!supporterId) continue;
      const meta = supporterMeta.get(supporterId);
      if (!meta) continue;
      let inf = map.get(supporterId);
      if (!inf) {
        inf = {
          supporterId, registeredName: meta.name, origin: meta.origin,
          category: meta.category,
          authorPicture: c.author_profile_picture,
          platforms: new Set<string>(),
          totalComments: 0, totalReactions: 0,
          positiveCount: 0, negativeCount: 0, neutralCount: 0,
          repliesReceived: 0, uniquePosts: 0,
          firstSeen: c.comment_created_time || "", lastSeen: c.comment_created_time || "", score: 0,
          byPlatform: {},
          profileUrls: supporterProfileUrls.get(supporterId) || {},
          profilePictures: {},
        };
        map.set(supporterId, inf);
      }
      if (!inf.authorPicture && c.author_profile_picture) inf.authorPicture = c.author_profile_picture;
      // Foto: prioriza foto do comentário mais recente; senão usa cache
      if (c.author_profile_picture) {
        // Sobrescreve só se ainda não tem foto OU o cache para este (supporter,plataforma) está expirado/ausente
        const cached = picCacheGet(picCache, supporterId, platform);
        if (!inf.profilePictures[platform] || !cached || cached !== c.author_profile_picture) {
          inf.profilePictures[platform] = c.author_profile_picture;
          picCacheSet(picCache, supporterId, platform, c.author_profile_picture);
          cacheDirty = true;
        }
      } else if (!inf.profilePictures[platform]) {
        // sem foto no comentário → tenta cache
        const cached = picCacheGet(picCache, supporterId, platform);
        if (cached) inf.profilePictures[platform] = cached;
      }
      inf.platforms.add(platform);
      if (!inf.byPlatform[platform]) inf.byPlatform[platform] = { comments: 0, reactions: 0, replies: 0, posts: 0, pos: 0, neg: 0, neu: 0 };
      const pb = inf.byPlatform[platform];
      pb.comments++;
      inf.totalComments++;
      if (c.sentiment === "positive") { inf.positiveCount++; pb.pos++; }
      else if (c.sentiment === "negative") { inf.negativeCount++; pb.neg++; }
      else { inf.neutralCount++; pb.neu++; }
      const ts = c.comment_created_time || "";
      if (ts < inf.firstSeen || !inf.firstSeen) inf.firstSeen = ts;
      if (ts > inf.lastSeen) inf.lastSeen = ts;
    }

    // Calcula posts únicos e respostas por supporter (unificado)
    const commentsBySupporter = new Map<string, any[]>();
    for (const c of allComments) {
      const supporterId = profileKeyToSupporter.get(`${c.platform || "facebook"}:${c.platform_user_id}`);
      if (!supporterId) continue;
      if (!commentsBySupporter.has(supporterId)) commentsBySupporter.set(supporterId, []);
      commentsBySupporter.get(supporterId)!.push(c);
    }
    for (const inf of map.values()) {
      const userComments = commentsBySupporter.get(inf.supporterId) || [];
      inf.uniquePosts = new Set(userComments.map((c) => c.post_id)).size;
      let repliesCount = 0;
      for (const c of userComments) {
        const r = replyCountByParent.get(c.comment_id || "") || 0;
        repliesCount += r;
        const pb = inf.byPlatform[c.platform || "facebook"];
        if (pb) pb.replies += r;
      }
      inf.repliesReceived = repliesCount;
      // posts únicos por plataforma
      const postsByPlat: Record<string, Set<string>> = {};
      for (const c of userComments) {
        const p = c.platform || "facebook";
        if (!postsByPlat[p]) postsByPlat[p] = new Set();
        postsByPlat[p].add(c.post_id);
      }
      for (const [p, set] of Object.entries(postsByPlat)) {
        if (inf.byPlatform[p]) inf.byPlatform[p].posts = set.size;
      }
    }

    // Agrega reactions/likes — inclui supporters que SÓ reagiram (sem comentar)
    for (const r of allReactions) {
      const supporterId = r.supporter_id as string;
      if (!supporterId) continue;
      const meta = supporterMeta.get(supporterId);
      if (!meta) continue;
      const platform = (r.platform as string) || "facebook";
      let inf = map.get(supporterId);
      if (!inf) {
        inf = {
          supporterId, registeredName: meta.name, origin: meta.origin,
          category: meta.category,
          authorPicture: null,
          platforms: new Set<string>(),
          totalComments: 0, totalReactions: 0,
          positiveCount: 0, negativeCount: 0, neutralCount: 0,
          repliesReceived: 0, uniquePosts: 0,
          firstSeen: r.action_date || "", lastSeen: r.action_date || "", score: 0,
          byPlatform: {},
          profileUrls: supporterProfileUrls.get(supporterId) || {},
          profilePictures: {},
        };
        map.set(supporterId, inf);
      }
      inf.platforms.add(platform);
      if (!inf.byPlatform[platform]) inf.byPlatform[platform] = { comments: 0, reactions: 0, replies: 0, posts: 0, pos: 0, neg: 0, neu: 0 };
      inf.byPlatform[platform].reactions++;
      inf.totalReactions++;
      const ts = r.action_date || "";
      if (!inf.firstSeen || ts < inf.firstSeen) inf.firstSeen = ts;
      if (ts > inf.lastSeen) inf.lastSeen = ts;
    }

    // Recalcula score após somar reactions
    for (const inf of map.values()) {
      inf.score = computeScore(inf);
    }

    const sorted = Array.from(map.values())
      .filter((i) => i.totalComments + i.totalReactions >= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    // Hidratação final: garante que toda plataforma vinculada tente puxar do cache
    for (const inf of sorted) {
      for (const plat of inf.platforms) {
        if (!inf.profilePictures[plat]) {
          const cached = picCacheGet(picCache, inf.supporterId, plat);
          if (cached) inf.profilePictures[plat] = cached;
        }
      }
    }

    if (cacheDirty) savePicCache(picCache);

    setInfluencers(sorted);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [clientId, days]);

  const [resolving, setResolving] = useState(false);
  const handleResolveProfiles = async () => {
    if (!clientId) return;
    setResolving(true);
    const tid = toast.loading("Resolvendo IDs de perfis...");
    try {
      const { data, error } = await supabase.functions.invoke("resolve-supporter-profiles", {
        body: { client_id: clientId, limit: 200 },
      });
      if (error) throw error;
      const r = data as { total: number; resolved_via_comments: number; resolved_via_graph: number; resolved_via_share: number; failed: number };
      const ok = (r?.resolved_via_comments || 0) + (r?.resolved_via_graph || 0) + (r?.resolved_via_share || 0);
      toast.success(`${ok} de ${r?.total ?? 0} perfis corrigidos. ${r?.failed ?? 0} falharam.`, { id: tid });
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao resolver perfis", { id: tid });
    } finally {
      setResolving(false);
    }
  };

  // Categorias presentes nos dados (para mostrar só chips relevantes)
  const availableCategories = Array.from(new Set(influencers.map((i) => i.category))).sort();
  const categoryCounts = influencers.reduce<Record<string, number>>((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + 1;
    return acc;
  }, {});

  const filtered = categoryFilter === "todos"
    ? influencers
    : influencers.filter((i) => i.category === categoryFilter);

  const topInfluencers = filtered.slice(0, 3);
  const restInfluencers = filtered.slice(3);

  return (
    <Tabs defaultValue="ranking" className="space-y-4">
      <TabsList>
        <TabsTrigger value="ranking" className="gap-1.5 text-xs sm:text-sm">
          <Award className="w-4 h-4" /> Ranking
        </TabsTrigger>
        <TabsTrigger value="diagnostico" className="gap-1.5 text-xs sm:text-sm">
          <Activity className="w-4 h-4" /> Diagnóstico
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ranking" className="space-y-4 mt-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Top comentaristas e formadores de opinião detectados automaticamente
          </p>
          <p className="text-xs text-muted-foreground/80 mt-0.5">
            <span className="font-medium text-foreground">Período:</span>{" "}
            {days >= 3650 ? "todo o histórico" : `últimos ${days} dias`} · contabiliza comentários e reações/curtidas
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-muted rounded-lg p-0.5">
            {[
              { v: 7, label: "7d" },
              { v: 30, label: "30d" },
              { v: 90, label: "90d" },
              { v: 365, label: "1 ano" },
              { v: 3650, label: "Tudo" },
            ].map(({ v, label }) => (
              <button key={v} onClick={() => setDays(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${days === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleResolveProfiles} disabled={resolving} title="Converte usernames e links de share em IDs numéricos do Facebook para que o engajamento passe a contar">
            <Wand2 className={`w-4 h-4 mr-2 ${resolving ? "animate-pulse" : ""}`} />
            Resolver IDs
          </Button>
        </div>
      </div>

      {!loading && influencers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Filtrar por:</span>
          <button
            onClick={() => setCategoryFilter("todos")}
            className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${categoryFilter === "todos" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}
          >
            Todos <span className="opacity-70">({influencers.length})</span>
          </button>
          {availableCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${categoryFilter === cat ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}
            >
              {CATEGORY_LABEL[cat] || cat} <span className="opacity-70">({categoryCounts[cat]})</span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6 space-y-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardContent></Card>
          ))}
        </div>
      )}

      {!loading && influencers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Users className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              Nenhuma interação de pessoas cadastradas {days >= 3650 ? "no histórico" : `nos últimos ${days} dias`}.
            </p>
            <p className="text-xs text-muted-foreground/70">Apenas pessoas, funcionários, contratados e apoiadores cadastrados — com rede social vinculada — geram pontuação.</p>
          </CardContent>
        </Card>
      )}

      {!loading && topInfluencers.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {topInfluencers.map((inf, idx) => {
            const RankIcon = RANK_ICONS[idx] || Star;
            const rankColor = RANK_COLORS[idx] || "text-muted-foreground";
            const platformList = Array.from(inf.platforms).sort();
            return (
              <Card key={inf.supporterId} className={idx === 0 ? "border-primary/40 shadow-md" : ""}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={inf.authorPicture || undefined} />
                        <AvatarFallback className="text-sm font-bold">{inf.registeredName.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-background border flex items-center justify-center">
                        <RankIcon className={`w-3 h-3 ${rankColor}`} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{inf.registeredName}</p>
                      <p className="text-xs text-muted-foreground">{CATEGORY_LABEL[inf.category] || ORIGIN_LABEL[inf.origin]}</p>
                    </div>
                    <Badge variant={idx === 0 ? "default" : "secondary"} className="text-xs">#{idx + 1}</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div><p className="text-lg font-bold">{inf.totalComments}</p><p className="text-[10px] text-muted-foreground">coment.</p></div>
                    <div><p className="text-lg font-bold">{inf.totalReactions}</p><p className="text-[10px] text-muted-foreground">reações</p></div>
                    <div><p className="text-lg font-bold">{inf.uniquePosts}</p><p className="text-[10px] text-muted-foreground">posts</p></div>
                    <div><p className="text-lg font-bold">{inf.repliesReceived}</p><p className="text-[10px] text-muted-foreground">respostas</p></div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Por rede</span>
                    <PlatformBadges platforms={platformList} breakdown={inf.byPlatform} urls={inf.profileUrls} pictures={inf.profilePictures} />
                  </div>
                  <div className="space-y-1">
                    <SentimentBar pos={inf.positiveCount} neg={inf.negativeCount} neu={inf.neutralCount} />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5"><ThumbsUp className="w-2.5 h-2.5" /> {inf.positiveCount}</span>
                      <span className="flex items-center gap-0.5"><Minus className="w-2.5 h-2.5" /> {inf.neutralCount}</span>
                      <span className="flex items-center gap-0.5"><ThumbsDown className="w-2.5 h-2.5" /> {inf.negativeCount}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t">
                    <span className="text-xs text-muted-foreground">Score de influência</span>
                    <span className="text-sm font-bold text-primary">{inf.score}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && restInfluencers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" />Ranking completo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden sm:table-cell">Redes</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Comentários</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Reações</TableHead>
                  <TableHead className="text-center hidden md:table-cell">Posts</TableHead>
                  <TableHead className="text-center hidden md:table-cell">Respostas</TableHead>
                  <TableHead className="hidden lg:table-cell w-32">Sentimento</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {restInfluencers.map((inf, idx) => {
                  const platformList = Array.from(inf.platforms).sort();
                  return (
                  <TableRow key={inf.supporterId}>
                    <TableCell className="font-medium text-muted-foreground">{idx + 4}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7">
                          <AvatarImage src={inf.authorPicture || undefined} />
                          <AvatarFallback className="text-[10px]">{inf.registeredName.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate max-w-[150px]">{inf.registeredName}</p>
                          <p className="text-[10px] text-muted-foreground">{CATEGORY_LABEL[inf.category] || ORIGIN_LABEL[inf.origin]}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <PlatformBadges platforms={platformList} breakdown={inf.byPlatform} urls={inf.profileUrls} pictures={inf.profilePictures} />
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">{inf.totalComments}</TableCell>
                    <TableCell className="text-center hidden sm:table-cell">{inf.totalReactions}</TableCell>
                    <TableCell className="text-center hidden md:table-cell">{inf.uniquePosts}</TableCell>
                    <TableCell className="text-center hidden md:table-cell">{inf.repliesReceived}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <SentimentBar pos={inf.positiveCount} neg={inf.negativeCount} neu={inf.neutralCount} />
                    </TableCell>
                    <TableCell className="text-right font-semibold">{inf.score}</TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      </TabsContent>

      <TabsContent value="diagnostico" className="mt-0">
        <div className="space-y-4">
          <AutoresolveScheduler clientId={clientId} />
          <EngagementDiagnostics clientId={clientId} />
        </div>
      </TabsContent>
    </Tabs>
  );
}

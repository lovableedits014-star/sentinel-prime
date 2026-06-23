import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Facebook, Instagram, TrendingUp, TrendingDown,
  Users, Calendar, Loader2, MessageSquare, Eye, BarChart3, FileText, ExternalLink,
  Flame, Ban, ChevronDown, ChevronRight, ThumbsUp, Minus, ShieldOff, Unlock, RefreshCw, User,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { BADGE_META, getBadgeMeta } from "@/lib/militant-badges";
import { MilitantBadge } from "@/components/comments/MilitantBadge";
import { AuthorHistoryDrawer } from "@/components/comments/AuthorHistoryDrawer";
import { MilitanciaCharts } from "@/components/militancia/MilitanciaCharts";
import { MilitanciaReport } from "@/components/militancia/MilitanciaReport";
import { getDirectSocialProfileUrl, getBestProfileLink } from "@/lib/social-url";
import { useBlockedUserIds } from "@/hooks/useBlockedUserIds";
import type { MilitantRow } from "@/hooks/useMilitants";

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number | string; accent?: string }) {
  return (
    <div className="bg-card rounded-xl border p-3 sm:p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent || 'bg-primary/10 text-primary'}`}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function MilitantList({
  militants, loading, onOpen, blockedIds,
}: {
  militants: MilitantRow[];
  loading: boolean;
  onOpen: (m: MilitantRow) => void;
  blockedIds?: Set<string>;
}) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-muted rounded-lg"></div>)}
      </div>
    );
  }
  if (militants.length === 0) {
    return (
      <Card>
        <CardContent className="py-16">
          <div className="text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium">Nenhum perfil encontrado</p>
            <p className="text-sm mt-1">Os perfis aparecem automaticamente conforme as pessoas comentam.</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="bg-card rounded-xl border shadow-sm divide-y overflow-hidden">
      {militants.map((m) => (
        <div
          key={m.id}
          className="w-full px-3 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
        >
          <button
            onClick={() => onOpen(m)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
          >
            <Avatar className="h-10 w-10 shrink-0">
              {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.author_name || ""} />}
              <AvatarFallback className={m.platform === 'instagram' ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white text-xs' : 'bg-primary/10 text-primary text-xs'}>
                {m.author_name?.charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{m.author_name || "Autor desconhecido"}</span>
                <MilitantBadge militant={m} />
                {blockedIds?.has(`${m.platform}:${m.platform_user_id}`) && (
                  <Badge variant="outline" className="h-5 gap-1 text-[10px] border-destructive/40 text-destructive bg-destructive/5">
                    <Ban className="w-3 h-3" />Bloqueado
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                <span className="inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" />{m.total_comments}</span>
                <span className="inline-flex items-center gap-1 text-green-600"><TrendingUp className="w-3 h-3" />{m.total_positive}</span>
                <span className="inline-flex items-center gap-1 text-destructive"><TrendingDown className="w-3 h-3" />{m.total_negative}</span>
                <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />última: {new Date(m.last_seen_at).toLocaleDateString("pt-BR")}</span>
              </div>
            </div>
          </button>
          {(() => {
            const url = getDirectSocialProfileUrl(m.platform, m.platform_user_id, m.platform_username ?? null);
            return url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Abrir perfil no ${m.platform === 'instagram' ? 'Instagram' : 'Facebook'}`}
                className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            ) : null;
          })()}
          <button
            onClick={() => onOpen(m)}
            title="Ver histórico"
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

type NegComment = {
  id: string;
  comment_id: string;
  text: string;
  sentiment: string | null;
  comment_created_time: string | null;
  post_message: string | null;
  post_permalink_url: string | null;
  platform: string;
  platform_user_id: string | null;
  sentiment_reason?: string | null;
};


interface BlockedUserRow {
  id: string;
  client_id: string;
  platform: string;
  platform_user_id: string;
  author_name: string | null;
  avatar_url: string | null;
  reason: string | null;
  blocked_at: string;
}

function BlockedUsersTab({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const autoSyncedRef = useRef(false);

  const { data: blocked = [], isLoading } = useQuery({
    queryKey: ["blocked-users", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("blocked_users")
        .select("*")
        .eq("client_id", clientId)
        .order("blocked_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BlockedUserRow[];
    },
    enabled: !!clientId,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return blocked;
    return blocked.filter(b =>
      (b.author_name || "").toLowerCase().includes(q) ||
      (b.platform_user_id || "").toLowerCase().includes(q)
    );
  }, [blocked, search]);

  async function runSync(silent = false) {
    if (syncing) return;
    setSyncing(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("sync-blocked-users", {
        body: { clientId },
      });
      if (error) throw error;
      if (!res?.success) throw new Error(res?.error || "Falha na sincronização");
      if (!silent) toast.success(res.message || "Bloqueados sincronizados!");
      qc.invalidateQueries({ queryKey: ["blocked-users", clientId] });
    } catch (e: any) {
      if (!silent) toast.error(e?.message || "Erro ao sincronizar");
      else console.warn("[sync-blocked-users auto]:", e?.message);
    } finally {
      setSyncing(false);
    }
  }

  // Auto-sync once on first mount if there are no Facebook records yet
  useEffect(() => {
    if (autoSyncedRef.current || isLoading || !clientId) return;
    const hasFb = blocked.some(b => b.platform === "facebook");
    if (!hasFb) {
      autoSyncedRef.current = true;
      runSync(true);
    } else {
      autoSyncedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, clientId, blocked.length]);

  async function handleUnblock(id: string) {
    setUnblockingId(id);
    try {
      const { data: res, error } = await supabase.functions.invoke("manage-comment", {
        body: { blockedUserId: id, clientId, action: "unblock_user" },
      });
      if (error) throw error;
      if (!res?.success) throw new Error(res?.error || "Falha ao desbloquear");
      toast.success(res.message || "Usuário desbloqueado!");
      qc.invalidateQueries({ queryKey: ["blocked-users", clientId] });
      qc.invalidateQueries({ queryKey: ["blocked-users-ids", clientId] });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao desbloquear");
    } finally {
      setUnblockingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <ShieldOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">Usuários bloqueados</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Lista de todos os perfis bloqueados na sua página do Facebook (sincronizados automaticamente) e bloqueios manuais do Instagram.
              Use <strong>Sincronizar</strong> para atualizar com o que está no Facebook agora.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar bloqueado por nome ou ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => runSync(false)} disabled={syncing} className="gap-2">
          {syncing
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />}
          Sincronizar do Facebook
        </Button>
      </div>


      {isLoading ? (
        <div className="animate-pulse space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <ShieldOff className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium">{blocked.length === 0 ? "Nenhum usuário bloqueado" : "Nenhum resultado para a busca"}</p>
            {blocked.length === 0 && (
              <p className="text-sm mt-1">Quando você bloquear alguém pelos comentários, aparecerá aqui.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="bg-card rounded-xl border shadow-sm divide-y overflow-hidden">
          {filtered.map((b) => (
            <div key={b.id} className="px-3 py-3 flex items-center gap-3">
              <Avatar className="h-10 w-10 shrink-0">
                {b.avatar_url && <AvatarImage src={b.avatar_url} alt={b.author_name || ""} />}
                <AvatarFallback className={b.platform === 'instagram' ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white text-xs' : 'bg-primary/10 text-primary text-xs'}>
                  {b.author_name?.charAt(0).toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{b.author_name || "Sem nome"}</p>
                  {b.platform === 'instagram'
                    ? <Instagram className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                    : <Facebook className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Bloqueado em {new Date(b.blocked_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={unblockingId === b.id}>
                    {unblockingId === b.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Unlock className="w-3.5 h-3.5" />}
                    Desbloquear
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desbloquear {b.author_name || "este usuário"}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {b.platform === 'instagram'
                        ? "O Instagram não permite desbloqueio via API. O registro será removido daqui, mas você precisa desbloquear manualmente pelo app."
                        : "O usuário voltará a poder comentar e interagir com sua página no Facebook."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleUnblock(b.id)}>
                      Confirmar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function NegativeRanking({
  militants, clientId, onOpen, blockedIds,
}: {
  militants: MilitantRow[];
  clientId: string | null | undefined;
  onOpen: (m: MilitantRow) => void;
  blockedIds?: Set<string>;
}) {
  const queryClient = useQueryClient();
  const [blocking, setBlocking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reclassifying, setReclassifying] = useState<string | null>(null);

  // Load all negative comments for this client (one query, then group by author)
  const { data: negativeComments = [], isLoading: loadingNeg } = useQuery({
    queryKey: ["negative-comments-by-author", clientId],
    queryFn: async () => {
      if (!clientId) return [] as NegComment[];
      const { data, error } = await (supabase as any)
        .from("comments")
        .select("id, comment_id, text, sentiment, sentiment_reason, comment_created_time, post_message, post_permalink_url, platform, platform_user_id")
        .eq("client_id", clientId)
        .eq("sentiment", "negative")
        .eq("is_page_owner", false)
        .neq("text", "__post_stub__")
        .order("comment_created_time", { ascending: false })
        .limit(5000);
      if (error) {
        console.warn("[negative-comments-by-author] error:", error.message);
        return [];
      }
      return (data ?? []) as NegComment[];
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 2,
  });

  const commentsByAuthor = useMemo(() => {
    const map = new Map<string, NegComment[]>();
    for (const c of negativeComments) {
      if (!c.platform_user_id) continue;
      const key = `${c.platform}:${c.platform_user_id}`;
      const arr = map.get(key) || [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [negativeComments]);

  const ranking = useMemo(() => {
    return [...militants]
      .filter(m => (m.total_negative || 0) > 0)
      .sort((a, b) => (b.total_negative || 0) - (a.total_negative || 0))
      .slice(0, 200);
  }, [militants]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleReclassify = async (
    comment: NegComment,
    newSentiment: "positive" | "neutral" | "negative",
  ) => {
    if (!clientId) return;
    setReclassifying(comment.id);
    try {
      const { error } = await (supabase as any)
        .from("comments")
        .update({
          sentiment: newSentiment,
          sentiment_source: "human",
          sentiment_confidence: 1,
          needs_review: false,
        })
        .eq("id", comment.id);
      if (error) throw error;

      // Log correction for AI few-shot learning
      if (comment.sentiment && comment.sentiment !== newSentiment) {
        (supabase as any)
          .from("sentiment_corrections")
          .insert({
            client_id: clientId,
            comment_id: comment.id,
            text: comment.text,
            post_message: comment.post_message,
            ai_sentiment: comment.sentiment,
            human_sentiment: newSentiment,
            ai_reason: comment.sentiment_reason ?? null,
          })
          .then(({ error: insErr }: any) => {
            if (insErr) console.warn("[sentiment_corrections] insert error:", insErr.message);
          });
      }

      // Optimistic: remove from negative list if reclassified away
      queryClient.setQueryData(["negative-comments-by-author", clientId], (old: any) => {
        if (!Array.isArray(old)) return old;
        return newSentiment === "negative"
          ? old
          : (old as NegComment[]).filter(c => c.id !== comment.id);
      });
      // Refresh militants (badges + counts will recompute)
      queryClient.invalidateQueries({ queryKey: ["militants-all", clientId] });
      queryClient.invalidateQueries({ queryKey: ["militants-map", clientId] });

      toast.success(
        `Reclassificado como ${newSentiment === "positive" ? "positivo" : newSentiment === "neutral" ? "neutro" : "negativo"}`
      );
    } catch (e: any) {
      toast.error(e.message || "Erro ao reclassificar");
    } finally {
      setReclassifying(null);
    }
  };

  const handleBlock = async (m: MilitantRow, profileUrl?: string | null) => {
    if (!clientId) return;

    // Instagram: API da Meta não permite bloqueio. Abrimos o perfil/comentário
    // no Instagram (para o usuário bloquear manualmente pelo app) e registramos
    // localmente em blocked_users para histórico.
    if (m.platform === 'instagram') {
      if (profileUrl) {
        window.open(profileUrl, "_blank", "noopener,noreferrer");
      }
      const key = `${m.platform}:${m.platform_user_id}`;
      const latest = commentsByAuthor.get(key)?.[0];
      setBlocking(m.id);
      try {
        if (latest?.id) {
          const { error } = await supabase.functions.invoke('manage-comment', {
            body: { commentId: latest.id, clientId, action: 'block_user' },
          });
          if (error) console.warn("[block instagram local]", error.message);
        }
        toast.success(
          "Abrimos o Instagram para você bloquear manualmente. Registrado aqui para histórico.",
          { duration: 6000 },
        );
        queryClient.invalidateQueries({ queryKey: ["blocked-users-ids", clientId] });
        queryClient.invalidateQueries({ queryKey: ["blocked-users", clientId] });
      } finally {
        setBlocking(null);
      }
      return;
    }

    if (!confirm(`Bloquear ${m.author_name || "este autor"} da página? Esta ação remove a capacidade de comentar.`)) return;
    setBlocking(m.id);
    try {
      const { data: c, error: cErr } = await (supabase as any)
        .from("comments")
        .select("id")
        .eq("client_id", clientId)
        .eq("platform", m.platform)
        .eq("platform_user_id", m.platform_user_id)
        .order("comment_created_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!c?.id) {
        toast.error("Nenhum comentário deste autor encontrado para vincular o bloqueio.");
        return;
      }
      const { data, error } = await supabase.functions.invoke('manage-comment', {
        body: { commentId: c.id, clientId, action: 'block_user' },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(data.message || "Autor bloqueado!");
        queryClient.invalidateQueries({ queryKey: ["blocked-users-ids", clientId] });
        queryClient.invalidateQueries({ queryKey: ["blocked-users", clientId] });
      } else {
        toast.error(data?.error || "Falha ao bloquear");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao bloquear autor");
    } finally {
      setBlocking(null);
    }
  };

  if (ranking.length === 0) {
    return (
      <Card>
        <CardContent className="py-16">
          <div className="text-center text-muted-foreground">
            <Flame className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium">Nenhum hater identificado 🎉</p>
            <p className="text-sm mt-1">Quando alguém deixar comentários negativos, aparece aqui.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="bg-card rounded-xl border shadow-sm divide-y overflow-hidden">
      {ranking.map((m, idx) => {
        const key = `${m.platform}:${m.platform_user_id}`;
        const isBlocked = blockedIds?.has(key) ?? false;
        const isOpen = expanded.has(m.id);
        const authorComments = commentsByAuthor.get(key) || [];
        const latest = authorComments[0];
        const best = getBestProfileLink(m.platform, {
          platformUserId: m.platform_user_id,
          platformUsername: (m as any).platform_username ?? null,
          authorName: m.author_name,
          latestPermalinkUrl: latest?.post_permalink_url ?? null,
          latestCommentId: latest?.comment_id ?? null,
        });
        const isInstagram = m.platform === 'instagram';
        const openLabel = best?.kind === "profile"
          ? "Perfil direto"
          : best?.kind === "comment"
          ? "Comentário exato"
          : "Buscar no Facebook";
        const openTitle = best?.kind === "comment"
          ? "A Meta não entrega o link direto deste perfil. Abrimos o comentário exato; clique no nome/foto do autor lá para cair no perfil certo."
          : best?.kind === "search"
          ? "Sem username público salvo: busca por nome pode mostrar pessoas iguais. Prefira o comentário exato quando disponível."
          : "Abrir perfil direto em nova aba";
        const profileUrl = getDirectSocialProfileUrl(
          m.platform,
          m.platform_user_id,
          (m as any).platform_username ?? null,
        );
        // Só mostra perfil separado quando é link direto real; nunca busca por nome.
        const showProfileButton = profileUrl && profileUrl !== best?.url;
        return (
          <div key={m.id}>
            <div className="px-3 py-3 flex items-center gap-3 hover:bg-muted/50">
              <button
                onClick={() => toggleExpand(m.id)}
                className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-muted text-muted-foreground"
                title={isOpen ? "Recolher comentários" : "Ver comentários negativos"}
              >
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              <div className="w-6 text-center text-sm font-bold text-muted-foreground shrink-0">
                {idx + 1}
              </div>
              <button onClick={() => onOpen(m)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <Avatar className="h-10 w-10 shrink-0">
                  {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.author_name || ""} />}
                  <AvatarFallback className={m.platform === 'instagram' ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white text-xs' : 'bg-primary/10 text-primary text-xs'}>
                    {m.author_name?.charAt(0).toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{m.author_name || "Autor desconhecido"}</span>
                    <MilitantBadge militant={m} />
                    {isBlocked && (
                      <Badge variant="outline" className="h-5 gap-1 text-[10px] border-destructive/40 text-destructive bg-destructive/5">
                        <Ban className="w-3 h-3" />Bloqueado
                      </Badge>
                    )}
                    {m.platform === 'facebook'
                      ? <Facebook className="w-3.5 h-3.5 text-blue-600" />
                      : <Instagram className="w-3.5 h-3.5 text-pink-500" />}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                    <span className="inline-flex items-center gap-1 text-destructive font-semibold">
                      <TrendingDown className="w-3 h-3" />{m.total_negative} negativos
                    </span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" />{m.total_comments} total</span>
                    <span className="inline-flex items-center gap-1 text-green-600"><TrendingUp className="w-3 h-3" />{m.total_positive}</span>
                  </div>
                </div>
              </button>
              {best && (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-8 gap-1.5"
                  title={openTitle}
                >
                  <a href={best.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{openLabel}</span>
                  </a>
                </Button>
              )}
              {showProfileButton && (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-8 gap-1.5"
                  title={`Abrir o perfil da pessoa no ${isInstagram ? 'Instagram' : 'Facebook'} em nova aba`}
                >
                  <a href={profileUrl!} target="_blank" rel="noopener noreferrer">
                    <User className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Perfil direto</span>
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant={isBlocked ? "outline" : isInstagram ? "secondary" : "destructive"}
                disabled={blocking === m.id || isBlocked}
                onClick={() => handleBlock(m, best?.url)}
                className="shrink-0 h-8 gap-1.5"
                title={isBlocked
                  ? "Este perfil já está bloqueado"
                  : isInstagram
                  ? "Instagram não permite bloqueio via API. Abre o Instagram para você bloquear manualmente e registra aqui para histórico."
                  : "Bloquear autor da página"}
              >
                {blocking === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isBlocked ? <ShieldOff className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isBlocked ? "Já bloqueado" : isInstagram ? "Bloquear no app" : "Bloquear"}</span>
              </Button>
            </div>


            {isOpen && (
              <div className="bg-muted/30 px-3 py-3 space-y-2 border-t">
                {loadingNeg ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">Carregando comentários...</p>
                ) : authorComments.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    Nenhum comentário negativo encontrado para este autor (pode ter sido reclassificado).
                  </p>
                ) : (
                  authorComments.map(c => (
                    <div key={c.id} className="bg-card border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm whitespace-pre-wrap break-words">{c.text}</p>
                          {c.sentiment_reason && (
                            <p className="text-[11px] text-muted-foreground mt-1 italic">
                              💭 IA: {c.sentiment_reason}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1.5">
                            {c.comment_created_time && (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(c.comment_created_time).toLocaleString("pt-BR")}
                              </span>
                            )}
                            {c.post_permalink_url && (
                              <a
                                href={c.post_permalink_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:text-foreground"
                              >
                                <ExternalLink className="w-3 h-3" /> ver post
                              </a>
                            )}
                            <button
                              onClick={async () => {
                                if (!clientId) return;
                                setReclassifying(c.id);
                                try {
                                  const { data, error } = await (supabase as any).functions.invoke('analyze-sentiment', {
                                    body: { commentId: c.id, clientId },
                                  });
                                  if (error) throw error;
                                  if (data?.sentiment && data.sentiment !== 'negative') {
                                    queryClient.setQueryData(["negative-comments-by-author", clientId], (old: any) =>
                                      Array.isArray(old) ? (old as NegComment[]).filter(x => x.id !== c.id) : old
                                    );
                                    toast.success(`IA reclassificou para ${data.sentiment}`);
                                  } else {
                                    toast.info('IA manteve como negativo');
                                  }
                                } catch (e: any) {
                                  toast.error(e.message || 'Erro ao reanalisar');
                                } finally {
                                  setReclassifying(null);
                                }
                              }}
                              className="inline-flex items-center gap-1 hover:text-foreground"
                              disabled={reclassifying === c.id}
                            >
                              {reclassifying === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flame className="w-3 h-3" />}
                              Reanalisar IA
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t">
                        <span className="text-[11px] text-muted-foreground mr-1">Reclassificar:</span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reclassifying === c.id}
                          onClick={() => handleReclassify(c, "positive")}
                          className="h-7 gap-1 text-xs border-green-500/40 text-green-700 hover:bg-green-500/10"
                        >
                          {reclassifying === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                          Positivo
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reclassifying === c.id}
                          onClick={() => handleReclassify(c, "neutral")}
                          className="h-7 gap-1 text-xs"
                        >
                          {reclassifying === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Minus className="w-3 h-3" />}
                          Neutro
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reclassifying === c.id}
                          onClick={() => handleReclassify(c, "negative")}
                          className="h-7 gap-1 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                        >
                          <TrendingDown className="w-3 h-3" />
                          Negativo
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const Militancia = () => {
  const [search, setSearch] = useState("");
  const [badgeFilter, setBadgeFilter] = useState<string>("all");
  const [drawer, setDrawer] = useState<MilitantRow | null>(null);

  const { data: clientId } = useQuery({
    queryKey: ["current-client-id-active", "militancia"],
    queryFn: async () => {
      const { resolveClientId } = await import("@/lib/resolveClientId");
      return await resolveClientId();
    },
  });

  const { data: militants = [], isLoading } = useQuery({
    queryKey: ["militants-all", clientId],
    queryFn: async () => {
      if (!clientId) return [] as MilitantRow[];
      const { data, error } = await (supabase as any)
        .from("social_militants")
        .select("*")
        .eq("client_id", clientId)
        .order("total_comments", { ascending: false })
        .limit(2000);
      if (error) {
        console.warn("[militants-all] error:", error.message);
        return [];
      }
      return (data ?? []) as MilitantRow[];
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 2,
  });

  const { data: blockedIds } = useBlockedUserIds(clientId);

  const filterByPlatform = (platform: string) => {
    return militants.filter((m) => {
      if (m.platform !== platform) return false;
      if (badgeFilter !== "all" && m.current_badge !== badgeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(m.author_name || "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  };

  const fbList = useMemo(() => filterByPlatform("facebook"), [militants, search, badgeFilter]);
  const igList = useMemo(() => filterByPlatform("instagram"), [militants, search, badgeFilter]);

  const computeStats = (list: MilitantRow[]) => ({
    total: list.length,
    defensores: list.filter(m => m.current_badge === 'defensor' || m.current_badge === 'elite').length,
    haters: list.filter(m => m.current_badge === 'hater' || m.current_badge === 'critico').length,
    novos: list.filter(m => m.current_badge === 'novo').length,
  });
  const fbStats = computeStats(militants.filter(m => m.platform === 'facebook'));
  const igStats = computeStats(militants.filter(m => m.platform === 'instagram'));

  return (
    <div className="p-4 md:p-8 space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Militância Digital</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Mapeia automaticamente todo perfil que interage com seus posts. Identifica defensores, críticos e novos rostos sem trabalho manual — assim que alguém comenta, ele já entra aqui com o selo certo.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={badgeFilter === "all" ? "default" : "outline"} onClick={() => setBadgeFilter("all")} className="h-8 text-xs">Todos</Button>
          {Object.entries(BADGE_META).sort((a, b) => a[1].priority - b[1].priority).map(([key, meta]) => (
            <Button
              key={key}
              size="sm"
              variant={badgeFilter === key ? "default" : "outline"}
              onClick={() => setBadgeFilter(key)}
              className="h-8 text-xs gap-1"
            >
              <span>{meta.emoji}</span>
              <span>{meta.label}</span>
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="facebook">
        <TabsList>
          <TabsTrigger value="facebook" className="gap-1.5">
            <Facebook className="w-4 h-4 text-blue-600" />
            <span>Facebook</span>
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-[10px] px-1.5">{fbStats.total}</Badge>
          </TabsTrigger>
          <TabsTrigger value="instagram" className="gap-1.5">
            <Instagram className="w-4 h-4 text-pink-500" />
            <span>Instagram</span>
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-[10px] px-1.5">{igStats.total}</Badge>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="w-4 h-4 text-violet-600" />
            <span>Análise</span>
          </TabsTrigger>
          <TabsTrigger value="haters" className="gap-1.5">
            <Flame className="w-4 h-4 text-destructive" />
            <span>Ranking Negativos</span>
          </TabsTrigger>
          <TabsTrigger value="blocked" className="gap-1.5">
            <ShieldOff className="w-4 h-4 text-amber-600" />
            <span>Bloqueados</span>
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5">
            <FileText className="w-4 h-4 text-amber-600" />
            <span>Relatório</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="facebook" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<Users className="w-4 h-4" />} label="Perfis Facebook" value={fbStats.total} />
            <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Defensores" value={fbStats.defensores} accent="bg-green-500/10 text-green-700" />
            <StatCard icon={<TrendingDown className="w-4 h-4" />} label="Críticos/Haters" value={fbStats.haters} accent="bg-destructive/10 text-destructive" />
            <StatCard icon={<Users className="w-4 h-4" />} label="Novos rostos" value={fbStats.novos} accent="bg-cyan-500/10 text-cyan-700" />
          </div>
          <MilitantList militants={fbList} loading={isLoading} onOpen={setDrawer} blockedIds={blockedIds} />
        </TabsContent>

        <TabsContent value="instagram" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<Users className="w-4 h-4" />} label="Perfis Instagram" value={igStats.total} accent="bg-pink-500/10 text-pink-600" />
            <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Defensores" value={igStats.defensores} accent="bg-green-500/10 text-green-700" />
            <StatCard icon={<TrendingDown className="w-4 h-4" />} label="Críticos/Haters" value={igStats.haters} accent="bg-destructive/10 text-destructive" />
            <StatCard icon={<Users className="w-4 h-4" />} label="Novos rostos" value={igStats.novos} accent="bg-cyan-500/10 text-cyan-700" />
          </div>
          <MilitantList militants={igList} loading={isLoading} onOpen={setDrawer} blockedIds={blockedIds} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4 mt-4">
          <Tabs defaultValue="fb-charts">
            <TabsList>
              <TabsTrigger value="fb-charts" className="gap-1.5"><Facebook className="w-3.5 h-3.5 text-blue-600" /> Facebook</TabsTrigger>
              <TabsTrigger value="ig-charts" className="gap-1.5"><Instagram className="w-3.5 h-3.5 text-pink-500" /> Instagram</TabsTrigger>
            </TabsList>
            <TabsContent value="fb-charts" className="mt-4">
              <MilitanciaCharts militants={militants} platform="facebook" />
            </TabsContent>
            <TabsContent value="ig-charts" className="mt-4">
              <MilitanciaCharts militants={militants} platform="instagram" />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="haters" className="space-y-4 mt-4">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <Flame className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-destructive mb-1">Quem mais ataca a campanha</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Ranking dos perfis com mais comentários negativos. <strong>Perfil direto</strong> aparece só quando a Meta entrega username público; quando não entrega, <strong>Comentário exato</strong> abre o comentário da pessoa para você clicar no nome/foto correto. <strong>Bloquear</strong> remove a permissão de comentar no <strong>Facebook</strong>; no <strong>Instagram</strong> a Meta não permite bloqueio via API — abrimos o perfil para você bloquear pelo app e registramos aqui para histórico.
                </p>
              </div>
            </div>
          </div>
          <NegativeRanking militants={militants} clientId={clientId} onOpen={setDrawer} blockedIds={blockedIds} />
        </TabsContent>

        <TabsContent value="blocked" className="space-y-4 mt-4">
          {clientId && <BlockedUsersTab clientId={clientId} />}
        </TabsContent>

        <TabsContent value="report" className="mt-4">
          <MilitanciaReport militants={militants} />
        </TabsContent>
      </Tabs>

      {drawer && clientId && (
        <AuthorHistoryDrawer
          open={!!drawer}
          onOpenChange={(o) => !o && setDrawer(null)}
          clientId={clientId}
          platform={drawer.platform}
          platformUserId={drawer.platform_user_id}
          authorName={drawer.author_name}
          avatarUrl={drawer.avatar_url}
          militant={drawer}
        />
      )}
    </div>
  );
};

export default Militancia;

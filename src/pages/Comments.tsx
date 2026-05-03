import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageSquare, Search, TrendingUp, TrendingDown,
  Instagram, Facebook, RefreshCw, LayoutGrid, List,
  EyeOff, Eye, Sparkles, SkipForward,
} from "lucide-react";
import { toast } from "sonner";
import { PostCard } from "@/components/PostCard";
import { CommentItem, type CommentData } from "@/components/CommentItem";
import { useMilitantsMap, type MilitantRow } from "@/hooks/useMilitants";
import { AuthorHistoryDrawer } from "@/components/comments/AuthorHistoryDrawer";
import { AlertTriangle } from "lucide-react";
import { syncCooldownRemaining, markSyncDone, formatCooldown } from "@/lib/sync-throttle";

type Comment = CommentData;

interface PostGroup {
  post_id: string;
  post_message: string | null;
  post_permalink_url: string | null;
  post_full_picture: string | null;
  post_media_type: string | null;
  comments: Comment[];
  platforms: Set<string>;
  sentimentCounts: { positive: number; neutral: number; negative: number };
}

const Comments = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [postsLimit, setPostsLimit] = useState<number>(6);
  const [generatingResponse, setGeneratingResponse] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [managingComment, setManagingComment] = useState<string | null>(null);
  const clientIdRef = useRef<string>("");
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState("posts");
  const [classifyingSentiment, setClassifyingSentiment] = useState<string | null>(null);
  const [reactingComment, setReactingComment] = useState<string | null>(null);
  const [hideResponded, setHideResponded] = useState(true);
  const [showIgnored, setShowIgnored] = useState(false);
  const [reanalyzingSentiments, setReanalyzingSentiments] = useState(false);
  const [authorDrawer, setAuthorDrawer] = useState<{
    open: boolean;
    platform: string;
    platformUserId: string;
    authorName: string | null;
    avatarUrl: string | null;
    militant: MilitantRow | null;
  } | null>(null);
  const queryClient = useQueryClient();

  const fetchCommentsData = useCallback(async (limit: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user");

    const { data: clients } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", user.id);

    if (!clients || clients.length === 0) return { comments: [] as Comment[], clientId: "" };

    const clientIds = clients.map(c => c.id);
    const cId = clientIds[0];

    // Step 1: Find the N most recent distinct post_ids
    const { data: stubs } = await supabase
      .from("comments")
      .select("post_id, platform, comment_created_time")
      .in("client_id", clientIds)
      .like("comment_id", "post_stub_%")
      .order("comment_created_time", { ascending: false })
      .limit(limit * 2);

    const seenFromStubs = new Set<string>();
    const stubPostIds: Array<{post_id: string; platform: string; time: string}> = [];
    for (const row of stubs || []) {
      if (!row?.post_id || seenFromStubs.has(row.post_id)) continue;
      seenFromStubs.add(row.post_id);
      stubPostIds.push({ post_id: row.post_id, platform: row.platform || '', time: row.comment_created_time || '' });
    }

    const scanLimit = Math.max(limit * 200, 2000);
    const { data: recent, error: recentError } = await supabase
      .from("comments")
      .select("post_id, platform, comment_created_time")
      .in("client_id", clientIds)
      .not("comment_id", "like", "post_stub_%")
      .not("text", "eq", "__post_stub__")
      .order("comment_created_time", { ascending: false })
      .limit(scanLimit);

    if (recentError) throw recentError;

    const allCandidates: Array<{post_id: string; platform: string; time: string}> = [...stubPostIds];
    const seenAll = new Set<string>(seenFromStubs);
    for (const row of recent || []) {
      if (!row?.post_id || seenAll.has(row.post_id)) continue;
      seenAll.add(row.post_id);
      allCandidates.push({ post_id: row.post_id, platform: row.platform || '', time: row.comment_created_time || '' });
    }

    allCandidates.sort((a, b) => b.time.localeCompare(a.time));

    const fbCandidates = allCandidates.filter(p => p.platform === 'facebook');
    const igCandidates = allCandidates.filter(p => p.platform === 'instagram');
    const otherCandidates = allCandidates.filter(p => p.platform !== 'facebook' && p.platform !== 'instagram');

    const interleaved: string[] = [];
    const maxLen = Math.max(fbCandidates.length, igCandidates.length, otherCandidates.length);
    for (let i = 0; i < maxLen && interleaved.length < limit; i++) {
      if (fbCandidates[i]) interleaved.push(fbCandidates[i].post_id);
      if (igCandidates[i] && interleaved.length < limit) interleaved.push(igCandidates[i].post_id);
      if (otherCandidates[i] && interleaved.length < limit) interleaved.push(otherCandidates[i].post_id);
    }

    const recentPostIds = interleaved.slice(0, limit);
    if (recentPostIds.length === 0) return { comments: [] as Comment[], clientId: cId };

    // Step 2: Fetch ALL comments for these posts
    const PAGE_SIZE = 1000;
    let allComments: Comment[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .in("client_id", clientIds)
        .in("post_id", recentPostIds)
        .not("text", "eq", "__post_stub__")
        .order("comment_created_time", { ascending: false })
        .range(from, to);

      if (error) throw error;
      allComments = [...allComments, ...(data || [])];
      hasMore = (data?.length || 0) === PAGE_SIZE;
      page++;
    }

    const postOrder = new Map<string, number>(recentPostIds.map((id, idx) => [id, idx]));
    allComments.sort((a, b) => {
      const orderDiff = (postOrder.get(a.post_id) ?? 999) - (postOrder.get(b.post_id) ?? 999);
      if (orderDiff !== 0) return orderDiff;
      return (b.comment_created_time || '').localeCompare(a.comment_created_time || '');
    });

    return { comments: allComments, clientId: cId };
  }, []);

  const { data: commentsData, isLoading: loading } = useQuery({
    queryKey: ["comments-data", postsLimit],
    queryFn: () => fetchCommentsData(postsLimit),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const comments = commentsData?.comments ?? [];

  // Keep clientId in sync via ref (no re-render)
  if (commentsData?.clientId && commentsData.clientId !== clientIdRef.current) {
    clientIdRef.current = commentsData.clientId;
  }
  const clientId = clientIdRef.current;

  // Load militant profiles for badge rendering on comments
  const { data: militantsMap } = useMilitantsMap(commentsData?.clientId || null);

  const openAuthorHistory = useCallback((info: {
    platform: string;
    platformUserId: string;
    authorName: string | null;
    avatarUrl: string | null;
    militant: MilitantRow | null;
  }) => {
    setAuthorDrawer({ open: true, ...info });
  }, []);

  // ====== AI Review Queue (low-confidence sentiment classifications) ======
  const { data: reviewQueue = [], isLoading: loadingReview } = useQuery({
    queryKey: ["ai-review-queue", commentsData?.clientId],
    queryFn: async () => {
      if (!commentsData?.clientId) return [] as Comment[];
      const { data, error } = await (supabase as any)
        .from("comments")
        .select("*")
        .eq("client_id", commentsData.clientId)
        .eq("needs_review", true)
        .eq("is_page_owner", false)
        .neq("text", "__post_stub__")
        .order("comment_created_time", { ascending: false })
        .limit(100);
      if (error) {
        console.warn("[ai-review-queue] error:", error.message);
        return [];
      }
      return (data ?? []) as Comment[];
    },
    enabled: !!commentsData?.clientId,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const filteredReviewQueue = useMemo(() => {
    return reviewQueue.filter((c) => {
      const matchesSearch = !searchTerm ||
        c.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.author_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPlatform = platformFilter === "all" || c.platform === platformFilter;
      return matchesSearch && matchesPlatform;
    });
  }, [reviewQueue, searchTerm, platformFilter]);

  // Independent query for Recentes tab — fetches latest comments regardless of post age
  const fetchRecentComments = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user");

    const { data: clients } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", user.id);

    if (!clients || clients.length === 0) return [] as Comment[];

    const clientIds = clients.map(c => c.id);
    const PAGE_SIZE = 1000;
    const MAX_COMMENTS = 3000;
    let allComments: Comment[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore && allComments.length < MAX_COMMENTS) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .in("client_id", clientIds)
        .eq("is_page_owner", false)
        .not("text", "eq", "__post_stub__")
        .not("comment_id", "like", "post_stub_%")
        .order("comment_created_time", { ascending: false })
        .range(from, to);

      if (error) throw error;
      allComments = [...allComments, ...(data || [])];
      hasMore = (data?.length || 0) === PAGE_SIZE;
      page++;
    }

    return allComments;
  }, []);

  const { data: recentCommentsData, isLoading: loadingRecent } = useQuery({
    queryKey: ["recent-comments-independent"],
    queryFn: fetchRecentComments,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    enabled: activeTab === "recent",
  });

  const recentCommentsIndependent = recentCommentsData ?? [];

  // Fetch registered supporters for this client
  const { data: registeredSupportersMap } = useQuery({
    queryKey: ["registered-supporters", commentsData?.clientId],
    queryFn: async () => {
      if (!commentsData?.clientId) return new Map<string, { name: string; classification: string }>();
      const { data: profiles } = await supabase
        .from("supporter_profiles")
        .select("platform, platform_user_id, supporter_id, supporters!inner(name, classification, client_id)")
        .eq("supporters.client_id", commentsData.clientId);

      const map = new Map<string, { name: string; classification: string }>();
      if (profiles) {
        for (const p of profiles) {
          const supporter = (p as any).supporters;
          if (supporter) {
            const key = `${p.platform}:${p.platform_user_id}`;
            map.set(key, {
              name: supporter.name,
              classification: supporter.classification || "neutro",
            });
          }
        }
      }
      return map;
    },
    enabled: !!commentsData?.clientId,
    staleTime: 1000 * 60 * 5,
  });

  const reloadComments = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["comments-data"] });
    queryClient.invalidateQueries({ queryKey: ["recent-comments-independent"] });
  }, [queryClient]);

  const handleSyncComments = useCallback(async () => {
    const cid = clientIdRef.current;
    if (!cid) {
      toast.error("Cliente não encontrado");
      return;
    }
    const remaining = syncCooldownRemaining(cid);
    if (remaining > 0) {
      toast.info(`Aguarde ${formatCooldown(remaining)} antes de sincronizar novamente (limite anti-custo).`);
      return;
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-meta-comments', {
        body: { clientId: cid, postsLimit }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        markSyncDone(cid);
        if (data.warnings && data.warnings.length > 0) {
          data.warnings.forEach((w: string) => {
            if (w.startsWith('⚠️')) {
              toast.warning(w.replace('⚠️ ', ''), { duration: 10000 });
            }
          });
        }
        reloadComments();
      } else {
        toast.error(data.error || 'Erro ao sincronizar comentários');
      }
    } catch (error: any) {
      console.error("Error syncing comments:", error);
      toast.error(error.message || "Erro ao sincronizar comentários");
    } finally {
      setSyncing(false);
    }
  }, [postsLimit, reloadComments]);

  const handleGenerateResponse = useCallback(async (commentId: string, isRegenerate = false, userGuidance?: string) => {
    setGeneratingResponse(commentId);
    try {
      const body: any = { commentId, clientId: clientIdRef.current };
      if (userGuidance) body.userGuidance = userGuidance;
      const { data, error } = await supabase.functions.invoke('generate-response', {
        body
      });

      if (error) throw error;

      if (data.success) {
        reloadComments();
        toast.success(isRegenerate ? "Nova resposta gerada!" : "Resposta gerada!");
      } else {
        toast.error(data.error || 'Erro ao gerar resposta.');
      }
    } catch (error: any) {
      console.error("Error generating response:", error);
      toast.error(error.message || "Erro ao gerar resposta.");
    } finally {
      setGeneratingResponse(null);
    }
  }, [reloadComments]);

  const handleReactToComment = useCallback(async (commentId: string) => {
    setReactingComment(commentId);
    try {
      const { data, error } = await supabase.functions.invoke('react-to-comment', {
        body: { commentId, clientId: clientIdRef.current }
      });
      if (error) throw error;
      if (data.success) {
        toast.success("Comentário curtido! 👍");
      } else {
        toast.error(data.error || 'Erro ao curtir comentário.');
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao curtir comentário.");
    } finally {
      setReactingComment(null);
    }
  }, []);

  const handleSendResponse = useCallback(async (commentId: string, responseText: string, platform: string) => {
    if (!responseText || responseText.trim().length === 0) {
      toast.error("A resposta não pode estar vazia");
      return;
    }

    setResponding(commentId);
    try {
      const { data, error } = await supabase.functions.invoke('respond-to-comment', {
        body: { commentId, clientId: clientIdRef.current, responseText }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`Resposta publicada no ${platform === 'instagram' ? 'Instagram' : 'Facebook'}!`);
        // Optimistic update: mark as responded immediately so it leaves the "Pendentes" view
        const nowIso = new Date().toISOString();
        const markResponded = (c: any) =>
          c.id === commentId
            ? { ...c, status: 'responded', final_response: responseText, responded_at: nowIso }
            : c;
        queryClient.setQueryData(["comments-data", postsLimit], (old: any) => {
          if (!old) return old;
          return { ...old, comments: old.comments.map(markResponded) };
        });
        queryClient.setQueryData(["recent-comments-independent"], (old: any) => {
          if (!old) return old;
          return (old as any[]).map(markResponded);
        });
        // Delay full reload so user can see sentiment classification before any background refresh
        setTimeout(() => reloadComments(), 3000);
      } else if (data.code === 'RATE_LIMITED') {
        toast.warning(data.error, { duration: 10000 });
      } else {
        toast.error(data.error || 'Falha ao publicar');
      }
    } catch (error: any) {
      console.error("Error sending response:", error);
      const msg = error.message || "Erro ao publicar resposta";
      const isRateLimit = msg.includes('32') || msg.includes('368') || msg.includes('rate') || 
                          msg.includes('temporarily') || msg.includes('spam') || msg.includes('block');
      if (isRateLimit) {
        toast.error("Facebook bloqueou temporariamente seu acesso. Aguarde alguns minutos e tente novamente.", { duration: 8000 });
      } else {
        toast.error(msg);
      }
    } finally {
      setResponding(null);
    }
  }, [reloadComments, queryClient, postsLimit]);

  const handleManageComment = useCallback(async (commentId: string, action: 'delete' | 'hide' | 'unhide' | 'block_user') => {
    setManagingComment(commentId);
    try {
      const { data, error } = await supabase.functions.invoke('manage-comment', {
        body: { commentId, clientId: clientIdRef.current, action }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        reloadComments();
      } else {
        toast.error(data.error || 'Erro na operação');
      }
    } catch (error: any) {
      console.error(`Error ${action} comment:`, error);
      toast.error(error.message || 'Erro ao gerenciar comentário');
    } finally {
      setManagingComment(null);
    }
  }, [reloadComments]);

  const handleIgnoreComment = useCallback(async (commentId: string) => {
    try {
      const { error } = await supabase
        .from("comments")
        .update({ status: 'ignored' as any })
        .eq("id", commentId);

      if (error) throw error;

      // Update local cache optimistically
      queryClient.setQueryData(["comments-data", postsLimit], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          comments: old.comments.map((c: any) =>
            c.id === commentId ? { ...c, status: 'ignored' } : c
          ),
        };
      });
      queryClient.setQueryData(["recent-comments-independent"], (old: any) => {
        if (!old) return old;
        return (old as any[]).map((c: any) =>
          c.id === commentId ? { ...c, status: 'ignored' } : c
        );
      });
      toast.success("Comentário ignorado — removido da fila");
    } catch (error: any) {
      console.error("Error ignoring comment:", error);
      toast.error("Erro ao ignorar comentário");
    }
  }, [queryClient, postsLimit]);

  const handleUnignoreComment = useCallback(async (commentId: string) => {
    try {
      const { error } = await supabase
        .from("comments")
        .update({ status: 'pending' as any })
        .eq("id", commentId);

      if (error) throw error;

      queryClient.setQueryData(["comments-data", postsLimit], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          comments: old.comments.map((c: any) =>
            c.id === commentId ? { ...c, status: 'pending' } : c
          ),
        };
      });
      queryClient.setQueryData(["recent-comments-independent"], (old: any) => {
        if (!old) return old;
        return (old as any[]).map((c: any) =>
          c.id === commentId ? { ...c, status: 'pending' } : c
        );
      });
      toast.success("Comentário restaurado para a fila");
    } catch (error: any) {
      console.error("Error unignoring comment:", error);
      toast.error("Erro ao restaurar comentário");
    }
  }, [queryClient, postsLimit]);

  const handleClassifySentiment = useCallback(async (commentId: string, sentiment: 'positive' | 'neutral' | 'negative') => {
    setClassifyingSentiment(commentId);
    try {
      // Find original sentiment to log the correction (for AI learning)
      const allCached: any[] = [
        ...((queryClient.getQueryData(["comments-data", postsLimit]) as any)?.comments ?? []),
        ...((queryClient.getQueryData(["recent-comments-independent"]) as any[]) ?? []),
      ];
      const original = allCached.find((c: any) => c.id === commentId);

      const { error } = await supabase
        .from("comments")
        .update({
          sentiment,
          sentiment_source: 'human',
          sentiment_confidence: 1,
          needs_review: false,
        } as any)
        .eq("id", commentId);

      if (error) throw error;

      // Log correction for few-shot learning (best-effort, ignore failure)
      if (original && original.sentiment && original.sentiment !== sentiment && clientIdRef.current) {
        (supabase as any)
          .from("sentiment_corrections")
          .insert({
            client_id: clientIdRef.current,
            comment_id: commentId,
            text: original.text,
            post_message: original.post_message,
            ai_sentiment: original.sentiment,
            human_sentiment: sentiment,
          })
          .then(({ error: insErr }: any) => {
            if (insErr) console.warn("[sentiment_corrections] insert error:", insErr.message);
          });
      }

      // Update local cache optimistically
      queryClient.setQueryData(["comments-data", postsLimit], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          comments: old.comments.map((c: any) =>
            c.id === commentId ? { ...c, sentiment, sentiment_source: 'human', needs_review: false } : c
          ),
        };
      });
      queryClient.setQueryData(["recent-comments-independent"], (old: any) => {
        if (!old) return old;
        return (old as any[]).map((c: any) =>
          c.id === commentId ? { ...c, sentiment, sentiment_source: 'human', needs_review: false } : c
        );
      });
      // Remove from AI review queue (it was just confirmed/corrected by a human)
      queryClient.setQueryData(["ai-review-queue", clientIdRef.current], (old: any) => {
        if (!old) return old;
        return (old as any[]).filter((c: any) => c.id !== commentId);
      });
      // Refresh militants (badges may change)
      queryClient.invalidateQueries({ queryKey: ["militants-map", clientIdRef.current] });
      toast.success(`Sentimento classificado como ${sentiment === 'positive' ? 'positivo' : sentiment === 'negative' ? 'negativo' : 'neutro'}`);
    } catch (error: any) {
      console.error("Error classifying sentiment:", error);
      toast.error("Erro ao classificar sentimento");
    } finally {
      setClassifyingSentiment(null);
    }
  }, [queryClient, postsLimit]);

  // Compute author recurrence stats across ALL comments
  const authorStats = useMemo(() => {
    const map = new Map<string, { total: number; positive: number; neutral: number; negative: number; name: string }>();
    for (const c of comments) {
      if (c.is_page_owner || !c.platform_user_id) continue;
      const key = `${c.platform}:${c.platform_user_id}`;
      if (!map.has(key)) {
        map.set(key, { total: 0, positive: 0, neutral: 0, negative: 0, name: c.author_name || "" });
      }
      const s = map.get(key)!;
      s.total++;
      if (c.sentiment === "positive") s.positive++;
      else if (c.sentiment === "negative") s.negative++;
      else s.neutral++;
    }
    return map;
  }, [comments]);

  // Filtered comments (shared between both tabs)
  const filteredComments = useMemo(() => {
    return comments.filter((comment) => {
      const matchesSearch = comment.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           comment.author_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSentiment = sentimentFilter === "all" || comment.sentiment === sentimentFilter;
      const matchesPlatform = platformFilter === "all" || comment.platform === platformFilter;
      return matchesSearch && matchesSentiment && matchesPlatform;
    });
  }, [comments, searchTerm, sentimentFilter, platformFilter]);

  // For the "Recentes" tab: use independent query data, filtered and sorted by comment_created_time desc
  const recentComments = useMemo(() => {
    const source = recentCommentsIndependent;
    const filtered = source.filter((comment) => {
      const matchesSearch = comment.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           comment.author_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSentiment = sentimentFilter === "all" || comment.sentiment === sentimentFilter;
      const matchesPlatform = platformFilter === "all" || comment.platform === platformFilter;
      return matchesSearch && matchesSentiment && matchesPlatform;
    });
    return filtered.sort((a, b) =>
      (b.comment_created_time || b.created_at || '').localeCompare(a.comment_created_time || a.created_at || '')
    );
  }, [recentCommentsIndependent, searchTerm, sentimentFilter, platformFilter]);

  // Pre-compute filtered + grouped data for recent tab to avoid recalculating in render
  const recentViewData = useMemo(() => {
    const pendingOnly = recentComments.filter(c => {
      if (c.is_page_owner) return false;
      if (c.status === 'responded') return false;
      if (c.status === 'ignored') return false;
      if (c.final_response || c.responded_at) return false;
      return true;
    });
    const ignoredOnly = recentComments.filter(c => !c.is_page_owner && c.status === 'ignored');
    const ignoredCount = ignoredOnly.filter(c => !c.parent_comment_id).length;
    
    let source: Comment[];
    if (showIgnored) {
      source = ignoredOnly;
    } else if (hideResponded) {
      source = pendingOnly;
    } else {
      source = recentComments;
    }
    
    const topLevel = source.filter(c => !c.parent_comment_id);
    const repliesByParent = new Map<string, Comment[]>();
    for (const c of source) {
      if (c.parent_comment_id) {
        const arr = repliesByParent.get(c.parent_comment_id) || [];
        arr.push(c);
        repliesByParent.set(c.parent_comment_id, arr);
      }
    }
    const totalCount = recentComments.filter(c => !c.parent_comment_id).length;
    const pendingTopLevel = pendingOnly.filter(c => !c.parent_comment_id).length;
    const respondedCount = totalCount - pendingTopLevel - ignoredCount;
    return { topLevel, repliesByParent, totalCount, pendingTopLevel, respondedCount, ignoredCount };
  }, [recentComments, hideResponded, showIgnored]);

  const postGroups = useMemo((): PostGroup[] => {
    const groups = new Map<string, PostGroup>();
    // Track the post publication date per post (from stub: comment_created_time = post created_time)
    const postDates = new Map<string, string>();
    // Track platform per post
    const postPlatform = new Map<string, string>();

    filteredComments.forEach(comment => {
      const postId = comment.post_id;
      if (!groups.has(postId)) {
        groups.set(postId, {
          post_id: postId,
          post_message: comment.post_message,
          post_permalink_url: comment.post_permalink_url,
          post_full_picture: comment.post_full_picture,
          post_media_type: comment.post_media_type,
          comments: [],
          platforms: new Set(),
          sentimentCounts: { positive: 0, neutral: 0, negative: 0 }
        });
      }

      const group = groups.get(postId)!;
      group.comments.push(comment);
      if (comment.platform) {
        group.platforms.add(comment.platform);
        postPlatform.set(postId, comment.platform);
      }
      if (comment.sentiment === 'positive') group.sentimentCounts.positive++;
      else if (comment.sentiment === 'negative') group.sentimentCounts.negative++;
      else group.sentimentCounts.neutral++;

      // The stub row has comment_created_time = actual post publication date
      // We want the EARLIEST time per post (stub date = post creation, real comments are later)
      const t = comment.comment_created_time || comment.created_at || '';
      if (t) {
        const existing = postDates.get(postId);
        // Use stub date if present (stubs are __post_stub__ entries with post creation date)
        // Otherwise keep the earliest known date (proxy for post date)
        if (!existing || t < existing) postDates.set(postId, t);
      }
    });

    const allGroups = Array.from(groups.values());

    // Sort each group's comments by date desc (latest comment first)
    allGroups.forEach(g => {
      g.comments.sort((a, b) =>
        (b.comment_created_time || '').localeCompare(a.comment_created_time || '')
      );
    });

    // Sort groups by post publication date desc (most recent post first)
    allGroups.sort((a, b) => {
      const at = postDates.get(a.post_id) || '';
      const bt = postDates.get(b.post_id) || '';
      return bt.localeCompare(at);
    });

    // Interleave Facebook and Instagram posts when platformFilter is "all"
    // Since posts are published simultaneously on both platforms, pair them by date rank
    if (platformFilter === "all") {
      const fb = allGroups.filter(g => g.platforms.has('facebook') && !g.platforms.has('instagram'));
      const ig = allGroups.filter(g => g.platforms.has('instagram') && !g.platforms.has('facebook'));
      // both/other go at bottom since they're mixed
      const other = allGroups.filter(g =>
        (!g.platforms.has('facebook') && !g.platforms.has('instagram')) ||
        (g.platforms.has('facebook') && g.platforms.has('instagram'))
      );

      // Interleave by rank: FB[0], IG[0], FB[1], IG[1], ...
      const interleaved: PostGroup[] = [];
      const maxLen = Math.max(fb.length, ig.length);
      for (let i = 0; i < maxLen; i++) {
        if (fb[i]) interleaved.push(fb[i]);
        if (ig[i]) interleaved.push(ig[i]);
      }
      interleaved.push(...other);
      return interleaved;
    }

    return allGroups;
  }, [filteredComments, platformFilter]);

  const stats = useMemo(() => {
    const facebookCount = comments.filter(c => c.platform === 'facebook').length;
    const instagramCount = comments.filter(c => c.platform === 'instagram').length;
    const pendingCount = comments.filter(c => c.status === 'pending').length;
    const totalPosts = new Set(comments.map(c => c.post_id)).size;
    return { facebookCount, instagramCount, pendingCount, totalPosts };
  }, [comments]);

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-muted rounded-xl"></div>)}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-36 bg-muted rounded-xl"></div>)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comentários</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Todos os comentários do Facebook e Instagram em um só lugar. Responda, oculte, gere respostas com IA e acompanhe o sentimento de cada interação. Posts aparecem em ordem cronológica com as duas plataformas intercaladas.
          </p>
        </div>
        {/* Action buttons: primary = Sincronizar, secondary = Atualizar */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => reloadComments()} disabled={syncing} size="sm">
            <RefreshCw className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
          <Button onClick={handleSyncComments} disabled={syncing || !clientId} size="sm">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? "Sincronizando..." : "Sincronizar Meta"}
          </Button>
        </div>
      </div>

      {/* Stats — compact row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl border p-3 sm:p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <LayoutGrid className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold">{stats.totalPosts}</p>
            <p className="text-xs text-muted-foreground">Postagens</p>
          </div>
        </div>
        <div className="bg-card rounded-xl border p-3 sm:p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Facebook className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold">{stats.facebookCount}</p>
            <p className="text-xs text-muted-foreground">Facebook</p>
          </div>
        </div>
        <div className="bg-card rounded-xl border p-3 sm:p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
            <Instagram className="w-4 h-4 text-secondary-foreground" />
          </div>
          <div>
            <p className="text-xl font-bold">{stats.instagramCount}</p>
            <p className="text-xs text-muted-foreground">Instagram</p>
          </div>
        </div>
        <div className="bg-card rounded-xl border p-3 sm:p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <p className="text-xl font-bold">{stats.pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </div>
        </div>
      </div>

      {/* Filters + Tabs integrated */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Top bar: tabs on the left, filters on the right */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <TabsList className="shrink-0">
            <TabsTrigger value="posts" className="gap-1.5">
              <LayoutGrid className="w-4 h-4" />
              <span>Por Postagem</span>
            </TabsTrigger>
            <TabsTrigger value="recent" className="gap-1.5">
              <List className="w-4 h-4" />
              <span>Recentes</span>
              {stats.pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] text-[10px] px-1.5">
                  {stats.pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="review" className="gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>Revisar IA</span>
              {reviewQueue.length > 0 && (
                <Badge variant="outline" className="ml-1 h-5 min-w-[20px] text-[10px] px-1.5 border-orange-500/40 text-orange-600">
                  {reviewQueue.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Filters inline */}
          <div className="flex flex-1 flex-wrap gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar comentário ou autor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-[130px] h-9 text-sm">
                <SelectValue placeholder="Plataforma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(postsLimit)} onValueChange={(v) => setPostsLimit(Number(v))}>
              <SelectTrigger className="w-[130px] h-9 text-sm">
                <SelectValue placeholder="Posts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 postagens</SelectItem>
                <SelectItem value="10">10 postagens</SelectItem>
                <SelectItem value="20">20 postagens</SelectItem>
                <SelectItem value="30">30 postagens</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
              <SelectTrigger className="w-[120px] h-9 text-sm">
                <SelectValue placeholder="Sentimento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="positive">Positivos</SelectItem>
                <SelectItem value="neutral">Neutros</SelectItem>
                <SelectItem value="negative">Negativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tab: Por Postagem */}
        <TabsContent value="posts">
          <div className="space-y-4">
            {postGroups.length === 0 ? (
              <Card>
                <CardContent className="py-16">
                  <div className="text-center text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-medium">Nenhum comentário encontrado</p>
                    <p className="text-sm mt-1">Ajuste os filtros ou clique em Sincronizar Meta</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              postGroups.map((group) => (
                <PostCard
                  key={group.post_id}
                  group={group}
                  authorStats={authorStats}
                  registeredSupporters={registeredSupportersMap}
                  militants={militantsMap}
                  onOpenAuthorHistory={openAuthorHistory}
                  onGenerateResponse={handleGenerateResponse}
                  onSendResponse={handleSendResponse}
                  onManageComment={handleManageComment}
                  onReactToComment={handleReactToComment}
                  onClassifySentiment={handleClassifySentiment}
                  generatingResponse={generatingResponse}
                  responding={responding}
                  managingComment={managingComment}
                  reactingComment={reactingComment}
                  classifyingSentiment={classifyingSentiment}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* Tab: Últimos Comentários */}
        <TabsContent value="recent">
          {loadingRecent ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-20 bg-muted rounded-xl"></div>)}
            </div>
          ) : (
          <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Button
              variant={hideResponded && !showIgnored ? "default" : "outline"}
              size="sm"
              onClick={() => { setHideResponded(true); setShowIgnored(false); }}
              className="gap-1.5"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Pendentes
              {recentViewData.pendingTopLevel > 0 && (
                <Badge variant={hideResponded && !showIgnored ? "secondary" : "outline"} className="ml-1 h-5 min-w-[20px] text-[10px] px-1.5">
                  {recentViewData.pendingTopLevel}
                </Badge>
              )}
            </Button>
            <Button
              variant={!hideResponded && !showIgnored ? "default" : "outline"}
              size="sm"
              onClick={() => { setHideResponded(false); setShowIgnored(false); }}
              className="gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              Todos
              <Badge variant={!hideResponded && !showIgnored ? "secondary" : "outline"} className="ml-1 h-5 min-w-[20px] text-[10px] px-1.5">
                {recentViewData.totalCount}
              </Badge>
            </Button>
            {recentViewData.ignoredCount > 0 && (
              <Button
                variant={showIgnored ? "default" : "outline"}
                size="sm"
                onClick={() => { setShowIgnored(!showIgnored); setHideResponded(false); }}
                className="gap-1.5"
              >
                <SkipForward className="w-3.5 h-3.5" />
                Ignorados
                <Badge variant={showIgnored ? "secondary" : "outline"} className="ml-1 h-5 min-w-[20px] text-[10px] px-1.5">
                  {recentViewData.ignoredCount}
                </Badge>
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                disabled={reanalyzingSentiments || !clientId}
                onClick={async () => {
                  setReanalyzingSentiments(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('batch-analyze-sentiments', {
                      body: { clientId, reanalyzeAll: true }
                    });
                    if (error) throw error;
                    if (data.success) {
                      toast.success(data.message);
                      reloadComments();
                    } else {
                      toast.error(data.error || 'Erro ao reanalisar');
                    }
                  } catch (err: any) {
                    toast.error(err.message || 'Erro ao reanalisar sentimentos');
                  } finally {
                    setReanalyzingSentiments(false);
                  }
                }}
              >
                <Sparkles className={`w-3.5 h-3.5 ${reanalyzingSentiments ? 'animate-spin' : ''}`} />
                {reanalyzingSentiments ? 'Reanalisando...' : 'Reanalisar Sentimentos'}
              </Button>
            </div>
            <span className="text-xs text-muted-foreground w-full sm:w-auto sm:ml-2">
              Exibindo {recentViewData.topLevel.length} comentário{recentViewData.topLevel.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-0 bg-card rounded-xl border shadow-sm overflow-hidden divide-y">
            {recentViewData.topLevel.length === 0 ? (
              <div className="py-16">
                <div className="text-center text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="font-medium">Nenhum comentário encontrado</p>
                  <p className="text-sm mt-1">Ajuste os filtros ou clique em Sincronizar Meta</p>
                </div>
              </div>
            ) : (
              recentViewData.topLevel.map((comment) => (
                <div key={comment.id}>
                  <CommentItem
                    comment={comment}
                    authorStats={authorStats}
                    registeredSupporters={registeredSupportersMap}
                    militants={militantsMap}
                    onOpenAuthorHistory={openAuthorHistory}
                    onGenerateResponse={handleGenerateResponse}
                    onSendResponse={handleSendResponse}
                    onManageComment={handleManageComment}
                    onReactToComment={handleReactToComment}
                    onClassifySentiment={handleClassifySentiment}
                    onIgnoreComment={handleIgnoreComment}
                    onUnignoreComment={handleUnignoreComment}
                    isGenerating={generatingResponse === comment.id}
                    isResponding={responding === comment.id}
                    isManaging={managingComment === comment.id}
                    isReacting={reactingComment === comment.id}
                    isClassifying={classifyingSentiment === comment.id}
                    showPostInfo
                  />
                  {recentViewData.repliesByParent.get(comment.comment_id)?.map((reply) => (
                    <div key={reply.id} className="ml-8 border-l-2 border-primary/20">
                      <CommentItem
                        comment={reply}
                        authorStats={authorStats}
                        registeredSupporters={registeredSupportersMap}
                        militants={militantsMap}
                        onOpenAuthorHistory={openAuthorHistory}
                        onGenerateResponse={handleGenerateResponse}
                        onSendResponse={handleSendResponse}
                        onManageComment={handleManageComment}
                        onReactToComment={handleReactToComment}
                        onClassifySentiment={handleClassifySentiment}
                        isGenerating={generatingResponse === reply.id}
                        isResponding={responding === reply.id}
                        isManaging={managingComment === reply.id}
                        isReacting={reactingComment === reply.id}
                        isClassifying={classifyingSentiment === reply.id}
                      />
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          {recentViewData.topLevel.length > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              {recentViewData.topLevel.length} comentário{recentViewData.topLevel.length !== 1 ? 's' : ''} listado{recentViewData.topLevel.length !== 1 ? 's' : ''}
            </p>
          )}
          </>
          )}
        </TabsContent>

        {/* Tab: Revisar IA */}
        <TabsContent value="review">
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-orange-700 dark:text-orange-300 mb-1">Fila de revisão da IA</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Comentários onde a IA classificou o sentimento mas ficou em dúvida (baixa confiança).
                  Confirme ou corrija a classificação manualmente. Cada correção sua treina a IA para acertar mais nos próximos.
                </p>
              </div>
            </div>
          </div>
          {loadingReview ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-xl"></div>)}
            </div>
          ) : filteredReviewQueue.length === 0 ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center text-muted-foreground">
                  <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="font-medium">Nada para revisar 🎉</p>
                  <p className="text-sm mt-1">A IA está confiante em todas as classificações recentes.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-0 bg-card rounded-xl border shadow-sm overflow-hidden divide-y">
              {filteredReviewQueue.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  authorStats={authorStats}
                  registeredSupporters={registeredSupportersMap}
                  militants={militantsMap}
                  onOpenAuthorHistory={openAuthorHistory}
                  onGenerateResponse={handleGenerateResponse}
                  onSendResponse={handleSendResponse}
                  onManageComment={handleManageComment}
                  onReactToComment={handleReactToComment}
                  onClassifySentiment={handleClassifySentiment}
                  onIgnoreComment={handleIgnoreComment}
                  onUnignoreComment={handleUnignoreComment}
                  isGenerating={generatingResponse === comment.id}
                  isResponding={responding === comment.id}
                  isManaging={managingComment === comment.id}
                  isReacting={reactingComment === comment.id}
                  isClassifying={classifyingSentiment === comment.id}
                  showPostInfo
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {authorDrawer && (
        <AuthorHistoryDrawer
          open={authorDrawer.open}
          onOpenChange={(o) => setAuthorDrawer((prev) => prev ? { ...prev, open: o } : prev)}
          clientId={clientId}
          platform={authorDrawer.platform}
          platformUserId={authorDrawer.platformUserId}
          authorName={authorDrawer.authorName}
          avatarUrl={authorDrawer.avatarUrl}
          militant={authorDrawer.militant}
        />
      )}
    </div>
  );
};

export default Comments;

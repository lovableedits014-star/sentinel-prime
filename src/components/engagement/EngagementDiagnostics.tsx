import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, Link2, RefreshCw, Users, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Diag = {
  totalSupporters: number;
  withProfile: number;
  withValidId: number;
  withInvalidId: number;
  withRecentActions: number;
  fbProfiles: number;
  igProfiles: number;
  orphanActions: number;
};

const RECENT_DAYS = 30;
const ORPHANS_PAGE_SIZE = 20;
const INVALID_PAGE_SIZE = 20;

type OrphanAction = {
  id: string;
  action_type: string;
  platform: string;
  platform_username: string | null;
  platform_user_id: string | null;
  reaction_type: string | null;
  comment_id: string | null;
  post_id: string | null;
  action_date: string;
};

type InvalidProfile = {
  id: string;
  supporter_id: string;
  platform: string;
  platform_user_id: string | null;
  platform_username: string | null;
  supporter_name: string | null;
};

function isValidPlatformUserId(platform: string | null, id: string | null): boolean {
  if (!id) return false;
  const v = id.trim();
  if (!v) return false;
  if (v.startsWith("share_") || v.startsWith("placeholder_")) return false;
  if (platform === "facebook" || platform === "instagram") {
    // IDs reais de Facebook/Instagram são numéricos
    return /^\d{5,}$/.test(v);
  }
  return true;
}

export default function EngagementDiagnostics({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [data, setData] = useState<Diag | null>(null);
  const [orphans, setOrphans] = useState<OrphanAction[]>([]);
  const [orphansPage, setOrphansPage] = useState(0);
  const [orphansLoading, setOrphansLoading] = useState(false);
  const [orphanTexts, setOrphanTexts] = useState<Record<string, string>>({});
  const [relinkingPage, setRelinkingPage] = useState(false);
  const [invalidProfiles, setInvalidProfiles] = useState<InvalidProfile[]>([]);
  const [invalidPage, setInvalidPage] = useState(0);
  const [invalidLoading, setInvalidLoading] = useState(false);
  const [resolvingProfileId, setResolvingProfileId] = useState<string | null>(null);

  const fetchDiag = async () => {
    setLoading(true);
    try {
      const sinceIso = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // 1) Supporters do cliente
      const { data: supporters, error: e1 } = await supabase
        .from("supporters")
        .select("id")
        .eq("client_id", clientId);
      if (e1) throw e1;
      const supporterIds = (supporters || []).map((s) => s.id);
      const totalSupporters = supporterIds.length;

      let withProfile = 0;
      let withValidId = 0;
      let withInvalidId = 0;
      let fbProfiles = 0;
      let igProfiles = 0;
      let withRecentActions = 0;
      let orphanActions = 0;

      if (supporterIds.length > 0) {
        // 2) Perfis sociais — paginado para evitar limite de 1000
        const profilesAll: { supporter_id: string; platform: string; platform_user_id: string | null }[] = [];
        const pageSize = 1000;
        let from = 0;
        while (true) {
          const { data: page, error } = await supabase
            .from("supporter_profiles")
            .select("supporter_id, platform, platform_user_id")
            .in("supporter_id", supporterIds)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!page || page.length === 0) break;
          profilesAll.push(...(page as any));
          if (page.length < pageSize) break;
          from += pageSize;
        }

        const supportersWithProfile = new Set<string>();
        const supportersWithValid = new Set<string>();
        const supportersWithInvalid = new Set<string>();
        for (const p of profilesAll) {
          supportersWithProfile.add(p.supporter_id);
          if (p.platform === "facebook") fbProfiles++;
          if (p.platform === "instagram") igProfiles++;
          if (isValidPlatformUserId(p.platform, p.platform_user_id)) {
            supportersWithValid.add(p.supporter_id);
          } else {
            supportersWithInvalid.add(p.supporter_id);
          }
        }
        withProfile = supportersWithProfile.size;
        withValidId = supportersWithValid.size;
        withInvalidId = supportersWithInvalid.size;

        // 3) Ações recentes (últimos 30 dias) — supporters distintos
        const recentActive = new Set<string>();
        from = 0;
        while (true) {
          const { data: page, error } = await supabase
            .from("engagement_actions")
            .select("supporter_id")
            .eq("client_id", clientId)
            .gte("action_date", sinceIso)
            .not("supporter_id", "is", null)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!page || page.length === 0) break;
          for (const r of page as any[]) if (r.supporter_id) recentActive.add(r.supporter_id);
          if (page.length < pageSize) break;
          from += pageSize;
        }
        // intersecta com supporters do cliente
        for (const sid of recentActive) if (supporterIds.includes(sid)) withRecentActions++;
      }

      // 4) Ações órfãs (sem supporter_id) do cliente
      const { count: orphanCount } = await supabase
        .from("engagement_actions")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId)
        .is("supporter_id", null);
      orphanActions = orphanCount || 0;

      setData({
        totalSupporters,
        withProfile,
        withValidId,
        withInvalidId,
        withRecentActions,
        fbProfiles,
        igProfiles,
        orphanActions,
      });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar diagnóstico");
    } finally {
      setLoading(false);
    }
  };

  const fetchOrphans = async (page: number) => {
    setOrphansLoading(true);
    try {
      const fromIdx = page * ORPHANS_PAGE_SIZE;
      const toIdx = fromIdx + ORPHANS_PAGE_SIZE - 1;
      const { data: rows, error } = await supabase
        .from("engagement_actions")
        .select("id, action_type, platform, platform_username, platform_user_id, reaction_type, comment_id, post_id, action_date")
        .eq("client_id", clientId)
        .is("supporter_id", null)
        .order("action_date", { ascending: false })
        .range(fromIdx, toIdx);
      if (error) throw error;
      const list = (rows || []) as OrphanAction[];
      setOrphans(list);

      // Buscar textos dos comentários referenciados (quando houver)
      const commentIds = list.map((r) => r.comment_id).filter((v): v is string => !!v);
      if (commentIds.length > 0) {
        const { data: comments } = await supabase
          .from("comments")
          .select("comment_id, text")
          .eq("client_id", clientId)
          .in("comment_id", commentIds);
        const map: Record<string, string> = {};
        for (const c of (comments || []) as any[]) map[c.comment_id] = c.text;
        setOrphanTexts(map);
      } else {
        setOrphanTexts({});
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar ações órfãs");
    } finally {
      setOrphansLoading(false);
    }
  };

  useEffect(() => { fetchDiag(); }, [clientId]);
  useEffect(() => { fetchOrphans(orphansPage); }, [clientId, orphansPage]);
  useEffect(() => { fetchInvalidProfiles(); }, [clientId]);

  const fetchInvalidProfiles = async () => {
    setInvalidLoading(true);
    try {
      const { data: supporters, error: e1 } = await supabase
        .from("supporters")
        .select("id, name")
        .eq("client_id", clientId);
      if (e1) throw e1;
      const supportersList = (supporters || []) as { id: string; name: string }[];
      const supportersMap = new Map(supportersList.map((s) => [s.id, s.name]));
      const supporterIds = supportersList.map((s) => s.id);
      if (supporterIds.length === 0) { setInvalidProfiles([]); return; }

      const all: any[] = [];
      const chunkSize = 200;
      for (let i = 0; i < supporterIds.length; i += chunkSize) {
        const chunk = supporterIds.slice(i, i + chunkSize);
        const pageSize = 1000;
        let from = 0;
        while (true) {
          const { data: page, error } = await supabase
            .from("supporter_profiles")
            .select("id, supporter_id, platform, platform_user_id, platform_username")
            .in("supporter_id", chunk)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!page || page.length === 0) break;
          all.push(...page);
          if (page.length < pageSize) break;
          from += pageSize;
        }
      }

      const invalid: InvalidProfile[] = all
        .filter((p: any) => !isValidPlatformUserId(p.platform, p.platform_user_id))
        .map((p: any) => ({
          id: p.id,
          supporter_id: p.supporter_id,
          platform: p.platform,
          platform_user_id: p.platform_user_id,
          platform_username: p.platform_username,
          supporter_name: supportersMap.get(p.supporter_id) || null,
        }))
        .sort((a, b) => (a.supporter_name || "").localeCompare(b.supporter_name || ""));

      setInvalidProfiles(invalid);
      setInvalidPage(0);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar perfis inválidos");
    } finally {
      setInvalidLoading(false);
    }
  };

  const handleResolveSingle = async (profileId: string) => {
    setResolvingProfileId(profileId);
    const tid = toast.loading("Tentando resolver perfil...");
    try {
      const { data: r, error } = await supabase.functions.invoke("resolve-supporter-profiles", {
        body: { client_id: clientId, profile_id: profileId },
      });
      if (error) throw error;
      const res = r as any;
      const ok = (res?.resolved_via_comments || 0) + (res?.resolved_via_graph || 0) + (res?.resolved_via_share || 0);
      const detail = Array.isArray(res?.details) ? res.details[0] : null;
      if (ok > 0 && detail?.new_user_id) {
        toast.success(`Resolvido para ${detail.new_user_id} (${detail.strategy || "match"})`, { id: tid });
      } else {
        toast.error("Não foi possível resolver automaticamente este perfil.", { id: tid });
      }
      await Promise.all([fetchDiag(), fetchInvalidProfiles()]);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao resolver perfil", { id: tid });
    } finally {
      setResolvingProfileId(null);
    }
  };

  const handleResolveProfiles = async () => {
    setResolving(true);
    const tid = toast.loading("Resolvendo IDs de perfis...");
    try {
      const { data: r, error } = await supabase.functions.invoke("resolve-supporter-profiles", {
        body: { client_id: clientId, limit: 200 },
      });
      if (error) throw error;
      const res = r as any;
      const ok = (res?.resolved_via_comments || 0) + (res?.resolved_via_graph || 0) + (res?.resolved_via_share || 0);
      toast.success(`${ok} de ${res?.total ?? 0} perfis corrigidos. ${res?.failed ?? 0} falharam.`, { id: tid });
      await fetchDiag();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao resolver perfis", { id: tid });
    } finally {
      setResolving(false);
    }
  };

  const handleRelinkOrphans = async () => {
    setLinking(true);
    const tid = toast.loading("Reprocessando vínculos de ações órfãs...");
    try {
      const { data: r, error } = await supabase.rpc("link_orphan_engagement_actions" as any, {
        p_client_id: clientId,
      });
      if (error) throw error;
      const linked = (r as any) ?? 0;
      toast.success(`${linked} ações vinculadas a apoiadores.`, { id: tid });
      await fetchDiag();
      await fetchOrphans(orphansPage);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao reprocessar vínculos", { id: tid });
    } finally {
      setLinking(false);
    }
  };

  const handleRelinkVisible = async () => {
    if (orphans.length === 0) return;
    setRelinkingPage(true);
    const tid = toast.loading(`Reprocessando ${orphans.length} ações desta página...`);
    try {
      const ids = orphans.map((o) => o.id);
      const { data: r, error } = await supabase.rpc("link_orphan_engagement_actions" as any, {
        p_client_id: clientId,
        p_action_ids: ids,
      });
      if (error) {
        // Fallback: se a RPC não aceitar p_action_ids, roda o reprocessamento global
        const { data: r2, error: e2 } = await supabase.rpc("link_orphan_engagement_actions" as any, {
          p_client_id: clientId,
        });
        if (e2) throw e2;
        const linked = (r2 as any) ?? 0;
        toast.success(`${linked} ações vinculadas (modo geral, RPC sem filtro por IDs).`, { id: tid });
      } else {
        const linked = (r as any) ?? 0;
        toast.success(`${linked} ações desta página vinculadas.`, { id: tid });
      }
      await fetchDiag();
      await fetchOrphans(orphansPage);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao reprocessar página", { id: tid });
    } finally {
      setRelinkingPage(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch { return iso; }
  };

  const totalOrphanPages = data ? Math.max(1, Math.ceil(data.orphanActions / ORPHANS_PAGE_SIZE)) : 1;
  const totalInvalidPages = Math.max(1, Math.ceil(invalidProfiles.length / INVALID_PAGE_SIZE));
  const invalidPageRows = invalidProfiles.slice(invalidPage * INVALID_PAGE_SIZE, (invalidPage + 1) * INVALID_PAGE_SIZE);

  const stats = data;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Diagnóstico da saúde do rastreamento de engajamento
          </p>
          <p className="text-xs text-muted-foreground/80 mt-0.5">
            Mostra quantos apoiadores têm perfil social vinculado, quantos têm ID válido (numérico do Facebook/Instagram) e quantos interagiram nos últimos {RECENT_DAYS} dias.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchDiag} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleResolveProfiles} disabled={resolving}
            title="Converte usernames e links de share em IDs numéricos do Facebook">
            <Wand2 className={`w-4 h-4 mr-2 ${resolving ? "animate-pulse" : ""}`} />
            Resolver IDs
          </Button>
          <Button variant="default" size="sm" onClick={handleRelinkOrphans} disabled={linking}
            title="Reprocessa ações sem apoiador vinculado tentando casar por ID, username ou nome">
            <Link2 className={`w-4 h-4 mr-2 ${linking ? "animate-pulse" : ""}`} />
            Reprocessar vínculos
          </Button>
        </div>
      </div>

      {loading && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32" />
            </CardContent></Card>
          ))}
        </div>
      )}

      {!loading && stats && (
        <>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Apoiadores</span>
                  <Users className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold">{stats.totalSupporters}</p>
                <p className="text-xs text-muted-foreground">Total cadastrado no cliente</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Com perfil vinculado</span>
                  <Link2 className="w-4 h-4 text-primary" />
                </div>
                <p className="text-3xl font-bold">{stats.withProfile}</p>
                <p className="text-xs text-muted-foreground">
                  {pct(stats.withProfile, stats.totalSupporters)}% · FB {stats.fbProfiles} · IG {stats.igProfiles}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Com ID válido</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.withValidId}</p>
                <p className="text-xs text-muted-foreground">
                  {pct(stats.withValidId, stats.withProfile)}% dos vinculados · ID numérico real
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Ativos ({RECENT_DAYS}d)</span>
                  <Activity className="w-4 h-4 text-primary" />
                </div>
                <p className="text-3xl font-bold text-primary">{stats.withRecentActions}</p>
                <p className="text-xs text-muted-foreground">
                  {pct(stats.withRecentActions, stats.totalSupporters)}% interagiram recentemente
                </p>
              </CardContent>
            </Card>
          </div>

          {(stats.withInvalidId > 0 || stats.orphanActions > 0) && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Pontos de atenção
                </CardTitle>
                <CardDescription className="text-xs">
                  Use os botões acima para corrigir automaticamente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.withInvalidId > 0 && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex-1">
                      <p className="font-medium">Perfis com ID inválido</p>
                      <p className="text-xs text-muted-foreground">
                        Usernames ou links de share que não geram pontuação. Use <span className="font-medium">Resolver IDs</span>.
                      </p>
                    </div>
                    <Badge variant="destructive">{stats.withInvalidId}</Badge>
                  </div>
                )}
                {stats.orphanActions > 0 && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex-1">
                      <p className="font-medium">Ações sem apoiador vinculado</p>
                      <p className="text-xs text-muted-foreground">
                        Curtidas/comentários capturados mas não atribuídos. Use <span className="font-medium">Reprocessar vínculos</span>.
                      </p>
                    </div>
                    <Badge variant="destructive">{stats.orphanActions}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {stats.withInvalidId === 0 && stats.orphanActions === 0 && stats.totalSupporters > 0 && (
            <Card className="border-emerald-500/40 bg-emerald-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <p className="text-sm">Tudo certo! Todos os perfis têm ID válido e nenhuma ação está órfã.</p>
              </CardContent>
            </Card>
          )}

          {stats.orphanActions > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Ações órfãs ({stats.orphanActions})
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Interações sem apoiador vinculado. Reprocesse para tentar casar por ID, username ou nome.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => fetchOrphans(orphansPage)} disabled={orphansLoading}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${orphansLoading ? "animate-spin" : ""}`} />
                      Atualizar lista
                    </Button>
                    <Button size="sm" onClick={handleRelinkVisible} disabled={relinkingPage || orphans.length === 0}>
                      <Link2 className={`w-4 h-4 mr-2 ${relinkingPage ? "animate-pulse" : ""}`} />
                      Reprocessar esta página
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Tipo</TableHead>
                        <TableHead>Autor</TableHead>
                        <TableHead>Conteúdo / Referência</TableHead>
                        <TableHead className="w-[160px]">Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orphansLoading && Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={`sk-${i}`}>
                          <TableCell colSpan={4}><Skeleton className="h-5 w-full" /></TableCell>
                        </TableRow>
                      ))}
                      {!orphansLoading && orphans.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                            Nenhuma ação órfã nesta página.
                          </TableCell>
                        </TableRow>
                      )}
                      {!orphansLoading && orphans.map((o) => {
                        const text = o.comment_id ? orphanTexts[o.comment_id] : null;
                        const reference = text
                          ? text
                          : o.reaction_type
                            ? `Reação: ${o.reaction_type}`
                            : o.comment_id
                              ? `Comentário ${o.comment_id}`
                              : o.post_id
                                ? `Post ${o.post_id}`
                                : "—";
                        return (
                          <TableRow key={o.id}>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge variant="outline" className="w-fit capitalize">{o.action_type}</Badge>
                                <span className="text-[10px] text-muted-foreground capitalize">{o.platform}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {o.platform_username || <span className="text-muted-foreground italic">sem nome</span>}
                                </span>
                                {o.platform_user_id && (
                                  <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                                    {o.platform_user_id}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm line-clamp-2 max-w-[420px]">{reference}</p>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDate(o.action_date)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Página {orphansPage + 1} de {totalOrphanPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm"
                      disabled={orphansPage === 0 || orphansLoading}
                      onClick={() => setOrphansPage((p) => Math.max(0, p - 1))}>
                      Anterior
                    </Button>
                    <Button variant="outline" size="sm"
                      disabled={orphansPage + 1 >= totalOrphanPages || orphansLoading}
                      onClick={() => setOrphansPage((p) => p + 1)}>
                      Próxima
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {(invalidProfiles.length > 0 || invalidLoading) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Perfis com ID inválido ({invalidProfiles.length})
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Usernames, links de share ou placeholders que não pontuam. Resolva individualmente ou em lote.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchInvalidProfiles} disabled={invalidLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${invalidLoading ? "animate-spin" : ""}`} />
                    Atualizar lista
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Apoiador</TableHead>
                        <TableHead className="w-[110px]">Plataforma</TableHead>
                        <TableHead>ID atual (inválido)</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead className="w-[140px] text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invalidLoading && Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={`isk-${i}`}>
                          <TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell>
                        </TableRow>
                      ))}
                      {!invalidLoading && invalidPageRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                            Nenhum perfil inválido.
                          </TableCell>
                        </TableRow>
                      )}
                      {!invalidLoading && invalidPageRows.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <span className="text-sm font-medium">
                              {p.supporter_name || <span className="text-muted-foreground italic">sem nome</span>}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{p.platform}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-mono text-muted-foreground break-all">
                              {p.platform_user_id || "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">
                              {p.platform_username || <span className="text-muted-foreground">—</span>}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResolveSingle(p.id)}
                              disabled={resolvingProfileId === p.id}
                            >
                              <Wand2 className={`w-3.5 h-3.5 mr-1.5 ${resolvingProfileId === p.id ? "animate-pulse" : ""}`} />
                              Resolver
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {invalidProfiles.length > INVALID_PAGE_SIZE && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Página {invalidPage + 1} de {totalInvalidPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm"
                        disabled={invalidPage === 0}
                        onClick={() => setInvalidPage((p) => Math.max(0, p - 1))}>
                        Anterior
                      </Button>
                      <Button variant="outline" size="sm"
                        disabled={invalidPage + 1 >= totalInvalidPages}
                        onClick={() => setInvalidPage((p) => p + 1)}>
                        Próxima
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
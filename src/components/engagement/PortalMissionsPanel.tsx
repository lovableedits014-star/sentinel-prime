import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Target, Plus, Pencil, Trash2, Facebook, Instagram,
  ExternalLink, ToggleLeft, ToggleRight, Loader2, Info, Check, Link, RefreshCw, X,
} from "lucide-react";
import { toast } from "sonner";
import { syncCooldownRemaining, markSyncDone, formatCooldown } from "@/lib/sync-throttle";

interface Mission {
  id: string;
  client_id: string;
  platform: "facebook" | "instagram";
  post_url: string;
  title: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

interface PostOption {
  post_id: string;
  post_message: string | null;
  post_permalink_url: string | null;
  post_full_picture: string | null;
  platform: string;
  comment_created_time?: string | null;
}

interface PortalMissionsPanelProps {
  clientId: string;
}

function parsePlatformFromUrl(url: string): "facebook" | "instagram" | null {
  if (!url) return null;
  if (url.includes("facebook.com") || url.includes("fb.com") || url.includes("fb.watch")) return "facebook";
  if (url.includes("instagram.com")) return "instagram";
  return null;
}

// ── Single-mission edit form state ──
const EMPTY_EDIT = {
  platform: "facebook" as "facebook" | "instagram",
  post_url: "",
  title: "",
  description: "",
};

export function PortalMissionsPanel({ clientId }: PortalMissionsPanelProps) {
  const qc = useQueryClient();

  // Add-multiple dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [selectedFb, setSelectedFb] = useState<PostOption | null>(null);
  const [selectedIg, setSelectedIg] = useState<PostOption | null>(null);
  const [manualUrl, setManualUrl] = useState("");

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editMission, setEditMission] = useState<Mission | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [editSelectedPostId, setEditSelectedPostId] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: missions = [], isLoading } = useQuery({
    queryKey: ["portal-missions", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("portal_missions")
        .select("*")
        .eq("client_id", clientId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as Mission[];
    },
    enabled: !!clientId,
  });

  const { data: postOptions = [], isLoading: postsLoading, refetch: refetchPosts } = useQuery({
    queryKey: ["post-options-for-missions", clientId],
    queryFn: async () => {
      const { data: stubs } = await supabase
        .from("comments")
        .select("post_id, post_message, post_permalink_url, post_full_picture, platform, comment_created_time")
        .eq("client_id", clientId)
        .like("comment_id", "post_stub_%")
        .not("post_permalink_url", "is", null)
        .order("comment_created_time", { ascending: false })
        .limit(100);

      const PAGE_SIZE = 1000;
      let allRows: any[] = [];
      let page = 0;
      let hasMore = true;
      while (hasMore && page < 5) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data } = await supabase
          .from("comments")
          .select("post_id, post_message, post_permalink_url, post_full_picture, platform, comment_created_time")
          .eq("client_id", clientId)
          .not("post_permalink_url", "is", null)
          .not("comment_id", "like", "post_stub_%")
          .not("text", "eq", "__post_stub__")
          .order("comment_created_time", { ascending: false })
          .range(from, to);
        allRows = [...allRows, ...(data || [])];
        hasMore = (data?.length || 0) === PAGE_SIZE;
        page++;
      }

      const seen = new Set<string>();
      const unique: PostOption[] = [];
      for (const row of (stubs || [])) {
        if (!row.post_id || seen.has(row.post_id)) continue;
        seen.add(row.post_id);
        unique.push(row as PostOption);
      }
      for (const row of allRows) {
        if (!row.post_id || seen.has(row.post_id)) continue;
        seen.add(row.post_id);
        unique.push(row as PostOption);
      }
      unique.sort((a: any, b: any) => {
        const at = a.comment_created_time || "";
        const bt = b.comment_created_time || "";
        return bt.localeCompare(at);
      });
      return unique;
    },
    enabled: !!clientId,
    staleTime: 0,
    gcTime: 0,
  });

  // Sync new posts from Meta (Facebook/Instagram) and then refetch the local list.
  // Necessary so that posts published just now (still without any comments) appear in the picker.
  const [isSyncing, setIsSyncing] = useState(false);
  const syncAndRefetch = async () => {
    if (!clientId || isSyncing) return;
    const remaining = syncCooldownRemaining(clientId);
    if (remaining > 0) {
      toast.info(`Aguarde ${formatCooldown(remaining)} antes de sincronizar (limite anti-custo).`);
      await refetchPosts();
      return;
    }
    setIsSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("fetch-meta-comments", {
        body: { clientId },
      });
      if (error) throw error;
      await refetchPosts();
      markSyncDone(clientId);
      toast.success("Publicações sincronizadas!");
    } catch (err: any) {
      // Even if sync fails, still refetch so user sees what's already in DB
      await refetchPosts();
      toast.error("Não foi possível sincronizar com a Meta agora. Mostrando publicações já carregadas.");
    } finally {
      setIsSyncing(false);
    }
  };

  const fbPosts = postOptions.filter(p => p.platform === "facebook");
  const igPosts = postOptions.filter(p => p.platform === "instagram");

  // ── Save multiple missions at once ──
  const [isSavingMultiple, setIsSavingMultiple] = useState(false);

  const handleAddMultiple = async () => {
    const toSave: Array<{ platform: "facebook" | "instagram"; post_url: string; title: string }> = [];

    if (selectedFb?.post_permalink_url) {
      toSave.push({
        platform: "facebook",
        post_url: selectedFb.post_permalink_url,
        title: selectedFb.post_message?.slice(0, 60).trim() || "",
      });
    }
    if (selectedIg?.post_permalink_url) {
      toSave.push({
        platform: "instagram",
        post_url: selectedIg.post_permalink_url,
        title: selectedIg.post_message?.slice(0, 60).trim() || "",
      });
    }
    if (manualUrl.trim()) {
      const detected = parsePlatformFromUrl(manualUrl.trim());
      if (!detected) {
        toast.error("URL manual: plataforma não reconhecida (cole link do Facebook ou Instagram)");
        return;
      }
      // Don't duplicate if same URL was already selected via picker
      const alreadySelected =
        (detected === "facebook" && selectedFb?.post_permalink_url === manualUrl.trim()) ||
        (detected === "instagram" && selectedIg?.post_permalink_url === manualUrl.trim());
      if (!alreadySelected) {
        toSave.push({ platform: detected, post_url: manualUrl.trim(), title: "" });
      }
    }

    if (toSave.length === 0) {
      toast.error("Selecione ao menos uma publicação ou cole um link");
      return;
    }

    setIsSavingMultiple(true);
    try {
      const baseOrder = missions.length;
      const payloads = toSave.map((item, idx) => ({
        client_id: clientId,
        platform: item.platform,
        post_url: item.post_url,
        title: item.title || null,
        description: null,
        display_order: baseOrder + idx,
        is_active: true,
      }));

      const { error } = await (supabase as any).from("portal_missions").insert(payloads);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["portal-missions", clientId] });
      toast.success(
        toSave.length > 1
          ? `${toSave.length} missões adicionadas!`
          : "Missão adicionada!"
      );
      setAddOpen(false);
      setSelectedFb(null);
      setSelectedIg(null);
      setManualUrl("");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "tente novamente"));
    } finally {
      setIsSavingMultiple(false);
    }
  };

  // ── Edit single mission ──
  const editMutation = useMutation({
    mutationFn: async (values: typeof editForm & { id: string }) => {
      const payload = {
        platform: values.platform,
        post_url: values.post_url.trim(),
        title: values.title.trim() || null,
        description: values.description.trim() || null,
      };
      const { error } = await (supabase as any)
        .from("portal_missions").update(payload).eq("id", values.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-missions", clientId] });
      setEditOpen(false);
      setEditMission(null);
      setEditForm(EMPTY_EDIT);
      setEditSelectedPostId(null);
      toast.success("Missão atualizada!");
    },
    onError: () => toast.error("Erro ao salvar missão"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from("portal_missions").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-missions", clientId] }),
    onError: () => toast.error("Erro ao atualizar missão"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("portal_missions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-missions", clientId] });
      setDeleteId(null);
      toast.success("Missão removida!");
    },
    onError: () => toast.error("Erro ao remover missão"),
  });

  const openEdit = (m: Mission) => {
    setEditMission(m);
    setEditForm({
      platform: m.platform,
      post_url: m.post_url,
      title: m.title || "",
      description: m.description || "",
    });
    setEditSelectedPostId(null);
    setEditOpen(true);
  };

  const handleEditSelectPost = (post: PostOption) => {
    const platform = (post.platform === "instagram" ? "instagram" : "facebook") as "facebook" | "instagram";
    setEditSelectedPostId(post.post_id);
    setEditForm(f => ({
      ...f,
      post_url: post.post_permalink_url || "",
      platform,
      title: f.title || (post.post_message ? post.post_message.slice(0, 60).trim() : ""),
    }));
  };

  const handleEditUrlChange = (url: string) => {
    const detected = parsePlatformFromUrl(url);
    setEditForm(f => ({
      ...f,
      post_url: url,
      ...(detected ? { platform: detected } : {}),
    }));
    setEditSelectedPostId(null);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.post_url.trim()) { toast.error("Informe a URL da publicação"); return; }
    if (!editMission) return;
    editMutation.mutate({ ...editForm, id: editMission.id });
  };

  const activeMissions = missions.filter((m) => m.is_active);
  const inactiveMissions = missions.filter((m) => !m.is_active);

  // Count selections for the add button label
  const selectionCount = (selectedFb ? 1 : 0) + (selectedIg ? 1 : 0) + (manualUrl.trim() ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Target className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Missões de Engajamento</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Escolha as publicações que seus apoiadores devem interagir. Elas aparecem em destaque no portal deles.
            </p>
          </div>
          <Button size="sm" onClick={() => { setSelectedFb(null); setSelectedIg(null); setManualUrl(""); setAddOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" />
            Adicionar
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{activeMissions.length}</p>
            <p className="text-xs text-muted-foreground">Missões ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold" style={{ color: "#1877F2" }}>
              {missions.filter((m) => m.platform === "facebook" && m.is_active).length}
            </p>
            <p className="text-xs text-muted-foreground">Facebook</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold" style={{ color: "#E1306C" }}>
              {missions.filter((m) => m.platform === "instagram" && m.is_active).length}
            </p>
            <p className="text-xs text-muted-foreground">Instagram</p>
          </CardContent>
        </Card>
      </div>

      {/* Active missions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Missões Ativas no Portal
          </CardTitle>
          <CardDescription className="text-xs">
            Estas publicações estão sendo exibidas para os apoiadores agora
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeMissions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Target className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhuma missão ativa</p>
              <p className="text-xs mt-1">Adicione publicações para exibir no portal dos apoiadores</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar missão
              </Button>
            </div>
          ) : (
            activeMissions.map((m) => (
              <MissionCard
                key={m.id}
                mission={m}
                onEdit={() => openEdit(m)}
                onDelete={() => setDeleteId(m.id)}
                onToggle={() => toggleMutation.mutate({ id: m.id, is_active: false })}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Inactive missions */}
      {inactiveMissions.length > 0 && (
        <Card className="opacity-70">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Missões Pausadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inactiveMissions.map((m) => (
              <MissionCard
                key={m.id}
                mission={m}
                onEdit={() => openEdit(m)}
                onDelete={() => setDeleteId(m.id)}
                onToggle={() => toggleMutation.mutate({ id: m.id, is_active: true })}
                inactive
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tip */}
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <strong>Dica:</strong> Selecione um post do Facebook e um do Instagram antes de salvar — as duas missões são adicionadas de uma vez só.
          </p>
        </CardContent>
      </Card>

      {/* ── ADD MULTIPLE DIALOG ── */}
      <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) { setSelectedFb(null); setSelectedIg(null); setManualUrl(""); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Missões de Engajamento</DialogTitle>
            <DialogDescription>
              Selecione posts do Facebook e/ou Instagram — clique em "Adicionar missão" para salvar todas de uma vez.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Refresh button */}
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={syncAndRefetch} disabled={postsLoading || isSyncing}>
                <RefreshCw className={`w-3 h-3 ${(postsLoading || isSyncing) ? "animate-spin" : ""}`} />
                {isSyncing ? "Sincronizando com a Meta..." : postsLoading ? "Carregando..." : `${postOptions.length} posts disponíveis · Sincronizar`}
              </Button>
            </div>

            {/* Tabs for Facebook / Instagram */}
            <Tabs defaultValue="facebook">
              <TabsList className="mb-3">
                <TabsTrigger value="facebook" className="gap-1.5 relative">
                  <Facebook className="w-3.5 h-3.5 text-blue-600" />
                  Facebook ({fbPosts.length})
                  {selectedFb && (
                    <span className="ml-1 w-2 h-2 rounded-full bg-primary inline-block" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="instagram" className="gap-1.5">
                  <Instagram className="w-3.5 h-3.5 text-pink-500" />
                  Instagram ({igPosts.length})
                  {selectedIg && (
                    <span className="ml-1 w-2 h-2 rounded-full bg-primary inline-block" />
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="facebook">
                <PostPickerList
                  posts={fbPosts}
                  selectedPostId={selectedFb?.post_id ?? null}
                  onSelect={(post) => setSelectedFb(prev => prev?.post_id === post.post_id ? null : post)}
                  platform="facebook"
                />
              </TabsContent>
              <TabsContent value="instagram">
                <PostPickerList
                  posts={igPosts}
                  selectedPostId={selectedIg?.post_id ?? null}
                  onSelect={(post) => setSelectedIg(prev => prev?.post_id === post.post_id ? null : post)}
                  platform="instagram"
                />
              </TabsContent>
            </Tabs>

            {/* Selected summary */}
            {(selectedFb || selectedIg) && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">Selecionados para adicionar</p>
                {selectedFb && (
                  <div className="flex items-center gap-2">
                    <Facebook className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <p className="text-xs flex-1 truncate">{selectedFb.post_message?.slice(0, 70) || selectedFb.post_permalink_url}</p>
                    <button type="button" onClick={() => setSelectedFb(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {selectedIg && (
                  <div className="flex items-center gap-2">
                    <Instagram className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                    <p className="text-xs flex-1 truncate">{selectedIg.post_message?.slice(0, 70) || selectedIg.post_permalink_url}</p>
                    <button type="button" onClick={() => setSelectedIg(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Manual URL */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Link className="w-3 h-3" /> ou cole um link manualmente
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-1">
              <Input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://www.facebook.com/... ou https://www.instagram.com/p/..."
              />
              {manualUrl && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {parsePlatformFromUrl(manualUrl) === "facebook" && <><Facebook className="w-3 h-3 text-blue-600" /> Facebook detectado</>}
                  {parsePlatformFromUrl(manualUrl) === "instagram" && <><Instagram className="w-3 h-3 text-pink-500" /> Instagram detectado</>}
                  {!parsePlatformFromUrl(manualUrl) && "⚠️ Plataforma não reconhecida"}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddMultiple} disabled={isSavingMultiple || selectionCount === 0}>
              {isSavingMultiple ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {selectionCount > 1
                ? `Adicionar ${selectionCount} missões`
                : "Adicionar missão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── EDIT SINGLE DIALOG ── */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setEditMission(null); setEditForm(EMPTY_EDIT); setEditSelectedPostId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Missão</DialogTitle>
            <DialogDescription>Altere a publicação ou os detalhes desta missão.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-5">
            {/* Post picker tabs for edit */}
            <Tabs defaultValue={editMission?.platform ?? "facebook"}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Trocar publicação</p>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={syncAndRefetch} disabled={postsLoading || isSyncing}>
                  <RefreshCw className={`w-3 h-3 ${(postsLoading || isSyncing) ? "animate-spin" : ""}`} />
                  {isSyncing ? "Sincronizando..." : "Sincronizar"}
                </Button>
              </div>
              <TabsList className="mb-3">
                <TabsTrigger value="facebook" className="gap-1.5">
                  <Facebook className="w-3.5 h-3.5 text-blue-600" /> Facebook ({fbPosts.length})
                </TabsTrigger>
                <TabsTrigger value="instagram" className="gap-1.5">
                  <Instagram className="w-3.5 h-3.5 text-pink-500" /> Instagram ({igPosts.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="facebook">
                <PostPickerList posts={fbPosts} selectedPostId={editSelectedPostId} onSelect={handleEditSelectPost} platform="facebook" />
              </TabsContent>
              <TabsContent value="instagram">
                <PostPickerList posts={igPosts} selectedPostId={editSelectedPostId} onSelect={handleEditSelectPost} platform="instagram" />
              </TabsContent>
            </Tabs>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Link className="w-3 h-3" /> ou cole um link</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="space-y-2">
              <Label>URL da Publicação *</Label>
              <Input value={editForm.post_url} onChange={(e) => handleEditUrlChange(e.target.value)} placeholder="https://..." required />
              {editForm.post_url && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {parsePlatformFromUrl(editForm.post_url) === "facebook" && <><Facebook className="w-3 h-3 text-blue-600" /> Facebook detectado</>}
                  {parsePlatformFromUrl(editForm.post_url) === "instagram" && <><Instagram className="w-3 h-3 text-pink-500" /> Instagram detectado</>}
                  {!parsePlatformFromUrl(editForm.post_url) && "⚠️ Plataforma não reconhecida"}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Título da Missão <span className="text-muted-foreground">(opcional)</span></Label>
              <Input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Apoie o post de hoje!" maxLength={80} />
            </div>

            <div className="space-y-2">
              <Label>Mensagem para o Apoiador <span className="text-muted-foreground">(opcional)</span></Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Curta, comente e compartilhe esta publicação!" rows={3} maxLength={200} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Salvar alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover missão?</AlertDialogTitle>
            <AlertDialogDescription>Esta missão será removida permanentemente do portal dos apoiadores.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── PostPickerList ─────────────────────────────────────────────────────────
function PostPickerList({
  posts,
  selectedPostId,
  onSelect,
  platform,
}: {
  posts: PostOption[];
  selectedPostId: string | null;
  onSelect: (post: PostOption) => void;
  platform: "facebook" | "instagram";
}) {
  if (posts.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground border rounded-lg bg-muted/20">
        <p className="text-sm">Nenhuma publicação {platform === "facebook" ? "do Facebook" : "do Instagram"} sincronizada</p>
        <p className="text-xs mt-1">Sincronize seus comentários primeiro, ou cole um link manualmente abaixo</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
      {posts.map((post) => {
        const isSelected = selectedPostId === post.post_id;
        const message = post.post_message?.trim();
        const preview = message ? (message.length > 80 ? message.slice(0, 80) + "…" : message) : "Sem legenda";

        return (
          <button
            key={post.post_id}
            type="button"
            onClick={() => onSelect(post)}
            className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
              isSelected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            {post.post_full_picture ? (
              <img
                src={post.post_full_picture}
                alt=""
                className="w-12 h-12 object-cover rounded-md shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className={`w-12 h-12 rounded-md shrink-0 flex items-center justify-center ${
                platform === "instagram" ? "bg-pink-500/10" : "bg-blue-500/10"
              }`}>
                {platform === "instagram"
                  ? <Instagram className="w-5 h-5 text-pink-500" />
                  : <Facebook className="w-5 h-5 text-blue-600" />}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground line-clamp-2">{preview}</p>
              {post.post_permalink_url && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{post.post_permalink_url}</p>
              )}
            </div>
            {isSelected && (
              <div className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-3 h-3 text-primary-foreground" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── MissionCard ─────────────────────────────────────────────────────────────
function MissionCard({
  mission,
  onEdit,
  onDelete,
  onToggle,
  inactive = false,
}: {
  mission: Mission;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  inactive?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
      inactive ? "bg-muted/30 border-muted" : "bg-card border-border hover:bg-muted/20"
    }`}>
      <div className={`p-1.5 rounded-md shrink-0 mt-0.5 ${
        mission.platform === "instagram" ? "bg-pink-500/10" : "bg-blue-500/10"
      }`}>
        {mission.platform === "instagram"
          ? <Instagram className="w-4 h-4 text-pink-500" />
          : <Facebook className="w-4 h-4 text-blue-600" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {mission.title ? (
            <p className="text-sm font-medium truncate">{mission.title}</p>
          ) : (
            <p className="text-sm text-muted-foreground truncate italic">Sem título</p>
          )}
          <Badge variant="outline" className="text-xs shrink-0 capitalize">
            {mission.platform}
          </Badge>
        </div>
        {mission.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{mission.description}</p>
        )}
        <a
          href={mission.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
        >
          <ExternalLink className="w-3 h-3" />
          Ver publicação
        </a>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle} title={inactive ? "Ativar" : "Pausar"}>
          {inactive
            ? <ToggleLeft className="w-4 h-4 text-muted-foreground" />
            : <ToggleRight className="w-4 h-4 text-primary" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

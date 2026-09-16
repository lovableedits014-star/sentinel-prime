import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Image as ImageIcon, Loader2, Trash2, Sparkles, Plus, Pencil, Copy, Link } from "lucide-react";
import { toast } from "sonner";
import FrameCompositionEditor from "@/components/campaign-frame/FrameCompositionEditor";
import { DEFAULT_COMPOSITION, FrameComposition } from "@/components/campaign-frame/types";

interface Frame {
  id: string;
  nome: string;
  image_url: string;
  is_active: boolean;
  display_order: number;
  composition: FrameComposition | null;
  parceiro_id: string | null;
  kind: string;
}

interface Partner { id: string; nome: string; public_token: string; ativo: boolean; }

interface Props { clientId: string; }

export default function CampaignFramesCard({ clientId }: Props) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFrame, setEditingFrame] = useState<Frame | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [scope, setScope] = useState("official");
  const [cloningFrame, setCloningFrame] = useState<Frame | null>(null);
  const [cloneTarget, setCloneTarget] = useState("");
  const [cloning, setCloning] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data }, { data: partnerData }] = await Promise.all([
      supabase.from("campaign_frames").select("id, nome, image_url, is_active, display_order, composition, parceiro_id, kind").eq("client_id", clientId).order("display_order", { ascending: true }),
      supabase.from("eleicao_candidatos_parceiros").select("id, nome, public_token, ativo").eq("client_id", clientId).eq("ativo", true).order("ordem"),
    ]);
    setFrames((data ?? []) as any as Frame[]);
    setPartners((partnerData ?? []) as any as Partner[]);
    setLoading(false);
  };

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const toggleActive = async (frame: Frame) => {
    const { error } = await supabase
      .from("campaign_frames")
      .update({ is_active: !frame.is_active })
      .eq("id", frame.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    load();
  };

  const remove = async (frame: Frame) => {
    if (!confirm(`Remover a moldura "${frame.nome}"?`)) return;
    const { error } = await supabase.from("campaign_frames").delete().eq("id", frame.id);
    if (error) { toast.error("Erro ao remover"); return; }
    toast.success("Moldura removida");
    load();
  };

  const openNew = () => { setEditingFrame(null); setEditorOpen(true); };
  const openEdit = (f: Frame) => { setEditingFrame(f); setEditorOpen(true); };
  const openClone = (f: Frame) => {
    setCloningFrame(f);
    setCloneTarget("");
  };
  const cloneFrame = async () => {
    if (!cloningFrame || !cloneTarget) return;
    const target = partners.find((p) => p.id === cloneTarget);
    if (!target) return;
    setCloning(true);
    try {
      const nextOrder = frames
        .filter((f) => f.parceiro_id === cloneTarget)
        .reduce((max, f) => Math.max(max, f.display_order), -1) + 1;
      const { error } = await supabase.from("campaign_frames").insert({
        client_id: clientId,
        nome: cloningFrame.nome,
        image_url: cloningFrame.image_url,
        is_active: cloningFrame.is_active,
        display_order: nextOrder,
        composition: cloningFrame.composition as any,
        parceiro_id: cloneTarget,
        kind: cloningFrame.kind,
      });
      if (error) throw error;
      toast.success(`Moldura clonada para ${target.nome}`);
      setCloningFrame(null);
      setScope(cloneTarget);
      await load();
    } catch (error: any) {
      toast.error("Erro ao clonar moldura", { description: error.message });
    } finally {
      setCloning(false);
    }
  };
  const selectedPartner = partners.find((p) => p.id === scope);
  const visibleFrames = frames.filter((f) => scope === "official" ? !f.parceiro_id : f.parceiro_id === scope);
  const publicLink = selectedPartner ? `${window.location.origin}/foto/${clientId}/dobradinha/${selectedPartner.public_token}` : `${window.location.origin}/foto/${clientId}`;
  const copyLink = async () => {
    await navigator.clipboard.writeText(publicLink);
    toast.success(`Link ${selectedPartner ? `de ${selectedPartner.nome}` : "oficial"} copiado`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Molduras de Foto de Campanha</CardTitle>
            <CardDescription className="mt-1.5">
              Monte molduras visuais com fundo, círculo posicionável para a foto e elementos sobrepostos (anel, logo, fitas, badges). Apoiadores, funcionários e contratados poderão usá-las no portal.
            </CardDescription>
          </div>
          <Button onClick={openNew} className="gap-2 shrink-0"><Plus className="w-4 h-4" /> Nova moldura</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium">Conjunto de molduras</label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="official">Campanha oficial (atual)</SelectItem>
                  {partners.map((p) => <SelectItem key={p.id} value={p.id}>Dobradinha · {p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={copyLink} className="gap-2"><Copy className="w-4 h-4" /> Copiar link exclusivo</Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <Link className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{publicLink}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedPartner ? `Somente as molduras de ${selectedPartner.nome} aparecem neste link.` : "Este é o link oficial já existente; ele continua mostrando apenas as molduras oficiais."}
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : visibleFrames.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma moldura cadastrada</p>
            <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={openNew}><Plus className="w-3.5 h-3.5" /> Criar primeira moldura</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {visibleFrames.map((f) => (
              <div key={f.id} className="border rounded-lg overflow-hidden bg-card">
                <div className="aspect-square bg-[conic-gradient(at_50%_50%,#f1f5f9_25%,#e2e8f0_25%_50%,#f1f5f9_50%_75%,#e2e8f0_75%)] bg-[length:20px_20px]">
                  {f.image_url ? (
                    <img src={f.image_url} alt={f.nome} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon className="w-8 h-8 opacity-40" /></div>
                  )}
                </div>
                <div className="p-2 space-y-1.5">
                  <p className="text-xs font-medium truncate">{f.nome}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Switch checked={f.is_active} onCheckedChange={() => toggleActive(f)} />
                      <span className="text-[10px] text-muted-foreground">{f.is_active ? "Ativa" : "Inativa"}</span>
                    </div>
                    <div className="flex">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openClone(f)} title="Clonar para outra dobradinha">
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)} title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(f)} title="Remover">
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <FrameCompositionEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          clientId={clientId}
          frameId={editingFrame?.id}
          initialName={editingFrame?.nome}
          initialComposition={editingFrame?.composition ?? DEFAULT_COMPOSITION}
          parceiroId={editingFrame?.parceiro_id ?? (scope === "official" ? null : scope)}
          onSaved={load}
        />

        <Dialog open={!!cloningFrame} onOpenChange={(open) => { if (!open && !cloning) setCloningFrame(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Clonar moldura</DialogTitle>
              <DialogDescription>
                Copie somente a moldura “{cloningFrame?.nome}” para outra dobradinha. A original permanecerá inalterada.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <label className="text-sm font-medium">Dobradinha de destino</label>
              <Select value={cloneTarget} onValueChange={setCloneTarget} disabled={cloning}>
                <SelectTrigger><SelectValue placeholder="Selecione a dobradinha" /></SelectTrigger>
                <SelectContent>
                  {partners
                    .filter((p) => p.id !== cloningFrame?.parceiro_id)
                    .map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCloningFrame(null)} disabled={cloning}>Cancelar</Button>
              <Button onClick={cloneFrame} disabled={!cloneTarget || cloning} className="gap-2">
                {cloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                Clonar moldura
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

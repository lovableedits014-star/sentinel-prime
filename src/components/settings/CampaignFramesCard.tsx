import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Image as ImageIcon, Loader2, Trash2, Sparkles, Plus, Pencil } from "lucide-react";
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
}

interface Props { clientId: string; }

export default function CampaignFramesCard({ clientId }: Props) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFrame, setEditingFrame] = useState<Frame | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("campaign_frames")
      .select("id, nome, image_url, is_active, display_order, composition")
      .eq("client_id", clientId)
      .order("display_order", { ascending: true });
    setFrames((data ?? []) as any as Frame[]);
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
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : frames.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma moldura cadastrada</p>
            <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={openNew}><Plus className="w-3.5 h-3.5" /> Criar primeira moldura</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {frames.map((f) => (
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
          onSaved={load}
        />
      </CardContent>
    </Card>
  );
}
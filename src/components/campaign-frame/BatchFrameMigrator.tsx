import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { toast } from "sonner";

interface Frame {
  id: string;
  nome: string;
}

interface Gallery {
  id: string;
  nome: string;
  frame_id: string | null;
}

export default function BatchFrameMigrator({ 
  clientId, 
  frames, 
  galleries,
  onChanged 
}: { 
  clientId: string; 
  frames: Frame[]; 
  galleries: Gallery[];
  onChanged: () => void;
}) {
  const [fromFrameId, setFromFrameId] = useState<string>("all");
  const [toFrameId, setToFrameId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ updated: number } | null>(null);

  const affectedGalleries = useMemo(() => {
    if (fromFrameId === "all") return galleries;
    return galleries.filter(g => g.frame_id === fromFrameId);
  }, [fromFrameId, galleries]);

  const handleMigrate = async () => {
    if (!toFrameId) return toast.error("Selecione a nova moldura");
    if (fromFrameId === toFrameId) return toast.error("A moldura de destino deve ser diferente da origem");
    
    const count = affectedGalleries.length;
    if (count === 0) return toast.error("Nenhuma galeria encontrada com este critério");

    if (!confirm(`Você tem certeza que deseja alterar a moldura de ${count} galerias para "${frames.find(f => f.id === toFrameId)?.nome}"?`)) return;

    setLoading(true);
    try {
      let query = supabase
        .from("campaign_photo_galleries")
        .update({ frame_id: toFrameId })
        .eq("client_id", clientId);

      if (fromFrameId !== "all") {
        query = query.eq("frame_id", fromFrameId);
      }

      const { error } = await query;
      if (error) throw error;

      setResult({ updated: count });
      toast.success(`${count} galerias atualizadas!`);
      onChanged();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Migração em Lote
        </CardTitle>
        <CardDescription>
          Mude o template de várias galerias de uma vez só. Ideal para transição de pré-campanha para campanha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Substituir moldura de:</Label>
            <Select value={fromFrameId} onValueChange={setFromFrameId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as galerias ({galleries.length})</SelectItem>
                {frames.map(f => {
                  const count = galleries.filter(g => g.frame_id === f.id).length;
                  if (count === 0) return null;
                  return (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome} ({count} galerias)
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Para a nova moldura:</Label>
            <Select value={toFrameId} onValueChange={setToFrameId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o destino" />
              </SelectTrigger>
              <SelectContent>
                {frames.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {affectedGalleries.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex gap-3 text-sm text-yellow-800">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Atenção!</p>
              <p>
                Esta ação afetará <strong>{affectedGalleries.length}</strong> galerias. 
                As novas fotos enviadas nestas galerias usarão automaticamente o novo template. 
                Fotos que já foram publicadas não serão alteradas.
              </p>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3 flex gap-3 text-sm text-green-800 animate-in fade-in zoom-in duration-300">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Sucesso!</p>
              <p>{result.updated} galerias foram migradas para o novo template.</p>
            </div>
          </div>
        )}

        <Button 
          className="w-full gap-2" 
          size="lg"
          disabled={loading || !toFrameId || affectedGalleries.length === 0}
          onClick={handleMigrate}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Migrar {affectedGalleries.length} Galerias Agora
        </Button>
      </CardContent>
    </Card>
  );
}

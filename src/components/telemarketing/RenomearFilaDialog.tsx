import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  campanhaId: string;
  nomeAtual: string;
  descricaoAtual?: string | null;
  onSaved: () => void;
}

export default function RenomearFilaDialog({
  open, onOpenChange, clientId, campanhaId, nomeAtual, descricaoAtual, onSaved,
}: Props) {
  const [nome, setNome] = useState(nomeAtual);
  const [descricao, setDescricao] = useState(descricaoAtual || "");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!nome.trim()) { toast.error("Informe o nome da fila"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("tele_fila_renomear" as any, {
      _client_id: clientId,
      _campanha_id: campanhaId,
      _nome: nome.trim(),
      _descricao: descricao.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Fila atualizada");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renomear fila</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fila-nome">Nome da fila</Label>
            <Input id="fila-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Fila Instituto 1" />
            <p className="text-xs text-muted-foreground">
              O nome aparece nos relatórios — use algo que identifique a lista (ex.: “1ª rodada — indicados”, “Instituto 1”).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fila-desc">Descrição (opcional)</Label>
            <Textarea id="fila-desc" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

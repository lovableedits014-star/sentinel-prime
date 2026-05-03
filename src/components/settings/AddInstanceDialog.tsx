import { useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  onCreated: () => void;
}

export default function AddInstanceDialog({ open, onOpenChange, clientId, onCreated }: Props) {
  const [apelido, setApelido] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const nome = apelido.trim() || "Novo Chip";
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
      body: { action: "create_instance_record", client_id: clientId, apelido: nome },
    });
    setSaving(false);
    if (error || data?.error) {
      toast.error("Erro: " + (error?.message || data?.error));
      return;
    }
    toast.success("Instância criada! Agora clique em 'Conectar' para gerar o QR Code.");
    setApelido("");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar nova instância</DialogTitle>
          <DialogDescription>
            Cada instância representa <b>um chip/número WhatsApp</b> diferente.
            Após criar, conecte gerando o QR Code com o WhatsApp daquele número.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="apelido">Apelido do chip</Label>
          <Input
            id="apelido"
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            placeholder="Ex: Chip Principal, Chip Backup 1, Chip Campanha..."
            maxLength={60}
          />
          <p className="text-xs text-muted-foreground">
            Use um nome que ajude a identificar esse número no painel.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Criar instância
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";

interface ClientRow {
  id: string;
  name: string;
  cargo: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instanceId: string;
  instanceLabel: string;
  currentClientId: string;
  onReassigned: () => void;
}

/**
 * Visível apenas para super admin. Permite escolher um cliente destino e
 * chama o action `reassign_instance` no edge function, que troca o
 * client_id da instância e re-aponta o webhook na bridge.
 */
export default function ReassignInstanceDialog({
  open, onOpenChange, instanceId, instanceLabel, currentClientId, onReassigned,
}: Props) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [filter, setFilter] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name, cargo")
        .order("name", { ascending: true });
      setClients((data || []) as ClientRow[]);
    })();
  }, [open]);

  const filtered = clients
    .filter((c) => c.id !== currentClientId)
    .filter((c) => {
      if (!filter.trim()) return true;
      const q = filter.toLowerCase();
      return c.name.toLowerCase().includes(q) || (c.cargo || "").toLowerCase().includes(q);
    });

  const submit = async () => {
    if (!pickedId) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
      body: {
        action: "reassign_instance",
        client_id: currentClientId,
        instance_id: instanceId,
        target_client_id: pickedId,
      },
    });
    setBusy(false);
    if (error || data?.error) {
      toast.error("Erro: " + (error?.message || data?.error));
      return;
    }
    toast.success("Instância movida com sucesso!");
    onOpenChange(false);
    onReassigned();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" />
            Mover instância para outro cliente
          </DialogTitle>
          <DialogDescription>
            A instância <b>{instanceLabel}</b> será transferida para o cliente escolhido.
            A sessão WhatsApp (QR Code) é preservada — não precisa re-parear o número.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="filter">Buscar cliente</Label>
          <Input
            id="filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Nome do cliente..."
          />
        </div>

        <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Nenhum cliente encontrado.
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setPickedId(c.id)}
                className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                  pickedId === c.id ? "bg-primary/10 ring-2 ring-primary/40" : ""
                }`}
              >
                <p className="text-sm font-medium">{c.name}</p>
                {c.cargo && <p className="text-xs text-muted-foreground">{c.cargo}</p>}
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || !pickedId}>
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Mover instância
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

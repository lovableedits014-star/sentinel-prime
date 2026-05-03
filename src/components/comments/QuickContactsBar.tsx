import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Phone, Plus, Pencil, Trash2 } from "lucide-react";
import { useQuickContacts, type QuickContact } from "@/hooks/useQuickContacts";

interface Props {
  clientId: string | undefined;
  onPick: (snippet: string) => void;
}

function buildSnippet(c: QuickContact): string {
  const parts: string[] = [];
  if (c.context_message?.trim()) parts.push(c.context_message.trim());
  parts.push(`Telefone: ${c.phone}`);
  return parts.join("\n");
}

export function QuickContactsBar({ clientId, onPick }: Props) {
  const { contacts, create, update, remove, isMutating } = useQuickContacts(clientId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<QuickContact | null>(null);
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [contextMessage, setContextMessage] = useState("");

  const openNew = () => {
    setEditing(null);
    setLabel("");
    setPhone("");
    setContextMessage("");
    setDialogOpen(true);
  };

  const openEdit = (c: QuickContact) => {
    setEditing(c);
    setLabel(c.label);
    setPhone(c.phone);
    setContextMessage(c.context_message ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const input = {
      label: label.trim(),
      phone: phone.trim(),
      context_message: contextMessage.trim() || null,
    };
    if (!input.label || !input.phone) return;
    if (editing) {
      await update({ id: editing.id, input });
    } else {
      await create(input);
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirm(`Remover contato "${editing.label}"?`)) return;
    await remove(editing.id);
    setDialogOpen(false);
  };

  return (
    <div className="space-y-2 border border-border rounded-md p-2 bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
          <Phone className="w-3 h-3" />
          Encaminhar para telefone (clique para acrescentar)
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={openNew}
          disabled={!clientId}
          className="h-6 text-[11px] px-2"
        >
          <Plus className="w-3 h-3 mr-1" />
          Novo
        </Button>
      </div>

      {contacts.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic px-1">
          Nenhum contato cadastrado. Use "Novo" para adicionar (ex: Indicações, Agendamentos).
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {contacts.map((c) => {
            const tooltip = `${c.context_message ? c.context_message + "\n" : ""}Telefone: ${c.phone}`;
            return (
              <div key={c.id} className="group relative inline-flex">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onPick(buildSnippet(c))}
                  title={tooltip}
                  className="h-7 text-[11px] pr-7"
                >
                  <Phone className="w-3 h-3 mr-1" />
                  {c.label}
                </Button>
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  title="Editar contato"
                  className="absolute right-1 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 p-0.5 rounded"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar contato de encaminhamento" : "Novo contato de encaminhamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="qc-label">Rótulo</Label>
              <Input
                id="qc-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex: Indicações, Agendamentos"
                maxLength={60}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="qc-phone">Telefone</Label>
              <Input
                id="qc-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex: (67) 99999-9999"
                maxLength={40}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="qc-context">
                Texto de contexto <span className="text-muted-foreground text-xs">(opcional)</span>
              </Label>
              <Textarea
                id="qc-context"
                value={contextMessage}
                onChange={(e) => setContextMessage(e.target.value)}
                placeholder="Ex: Para agendar uma visita, fale com nossa equipe:"
                maxLength={300}
                className="min-h-[70px] text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Será inserido antes do telefone na resposta.
              </p>
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between gap-2">
            <div>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isMutating}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Remover
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={!label.trim() || !phone.trim() || isMutating}
              >
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
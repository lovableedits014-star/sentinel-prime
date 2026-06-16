import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Handshake, Save, X } from "lucide-react";
import { useCandidatosParceiros, type CandidatoParceiro } from "@/hooks/useCandidatosParceiros";

const PRESET_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

interface DraftState {
  id?: string;
  nome: string;
  cargo: string;
  partido: string;
  numero_urna: string;
  foto_url: string;
  cor: string;
  ativo: boolean;
}

const EMPTY: DraftState = {
  nome: "",
  cargo: "Deputado Federal",
  partido: "",
  numero_urna: "",
  foto_url: "",
  cor: PRESET_COLORS[0],
  ativo: true,
};

export default function ParceirosManager({ clientId }: { clientId: string }) {
  const { parceiros, isLoading, save, isSaving, remove, isRemoving } = useCandidatosParceiros(clientId);
  const [editing, setEditing] = useState<DraftState | null>(null);

  function openNew() {
    setEditing({ ...EMPTY, cor: PRESET_COLORS[parceiros.length % PRESET_COLORS.length] });
  }
  function openEdit(p: CandidatoParceiro) {
    setEditing({
      id: p.id,
      nome: p.nome,
      cargo: p.cargo,
      partido: p.partido || "",
      numero_urna: p.numero_urna || "",
      foto_url: p.foto_url || "",
      cor: p.cor,
      ativo: p.ativo,
    });
  }

  async function handleSave() {
    if (!editing) return;
    await save(editing);
    setEditing(null);
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Handshake className="w-4 h-4 text-primary" />
            Dobradinhas — Candidatos parceiros (Federais)
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Cadastre os deputados federais que entram em dobradinha com o estadual. No cadastro de cada pessoa
            você poderá vincular o federal e definir o rateio dos custos.
          </p>
        </div>
        {!editing && (
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Novo parceiro
          </Button>
        )}
      </div>

      {editing && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Nome *</Label>
              <Input value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} placeholder="Ex: João Silva" />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input value={editing.cargo} onChange={(e) => setEditing({ ...editing, cargo: e.target.value })} />
            </div>
            <div>
              <Label>Partido</Label>
              <Input value={editing.partido} onChange={(e) => setEditing({ ...editing, partido: e.target.value })} placeholder="Ex: PT, PL..." />
            </div>
            <div>
              <Label>Número de urna</Label>
              <Input value={editing.numero_urna} onChange={(e) => setEditing({ ...editing, numero_urna: e.target.value })} placeholder="Ex: 1234" />
            </div>
            <div className="sm:col-span-2">
              <Label>Foto (URL opcional)</Label>
              <Input value={editing.foto_url} onChange={(e) => setEditing({ ...editing, foto_url: e.target.value })} placeholder="https://..." />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">Cor do badge</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditing({ ...editing, cor: c })}
                  className="w-8 h-8 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: editing.cor === c ? "hsl(var(--foreground))" : "transparent",
                    transform: editing.cor === c ? "scale(1.1)" : "scale(1)",
                  }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={editing.ativo} onCheckedChange={(v) => setEditing({ ...editing, ativo: v })} />
            <span>{editing.ativo ? "Ativo" : "Inativo (não aparece em novos cadastros)"}</span>
          </label>

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || !editing.nome.trim()}>
              <Save className="w-4 h-4 mr-1" /> Salvar
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
      ) : parceiros.length === 0 && !editing ? (
        <p className="text-xs text-muted-foreground italic py-4 text-center">
          Nenhum candidato parceiro cadastrado ainda. Clique em "Novo parceiro" para começar.
        </p>
      ) : (
        <div className="grid gap-2">
          {parceiros.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 p-3 rounded-md border bg-card hover:bg-muted/40 transition-colors"
            >
              <div
                className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-sm"
                style={{ backgroundColor: p.cor }}
              >
                {p.foto_url ? (
                  <img src={p.foto_url} alt={p.nome} className="w-full h-full rounded-full object-cover" />
                ) : (
                  p.nome.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{p.nome}</span>
                  {!p.ativo && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {p.cargo}
                  {p.partido && ` • ${p.partido}`}
                  {p.numero_urna && ` • Nº ${p.numero_urna}`}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                  Editar
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Remover "${p.nome}"? As pessoas vinculadas voltam ao rateio 100% estadual.`)) {
                      remove(p.id);
                    }
                  }}
                  disabled={isRemoving}
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

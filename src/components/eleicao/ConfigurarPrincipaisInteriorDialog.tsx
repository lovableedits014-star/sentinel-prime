import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MapPin, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { normalizeTag, slugify } from "@/hooks/useRegioesEleicao";

interface Candidato { id: string; nome: string; telefone: string | null }
interface CidadeRow { cidade: string; candidatos: Candidato[] }

interface Props {
  clientId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function ConfigurarPrincipaisInteriorDialog({ clientId, open, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CidadeRow[]>([]);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("eleicao_listar_cidades_interior_sem_principal", { _client_id: clientId });
    if (error) toast.error("Falha ao carregar cidades", { description: error.message });
    setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { if (open) carregar(); }, [open, clientId]);

  const definirPrincipal = async (cidade: string, coordenadorId: string) => {
    setSaving(cidade);
    try {
      const { error } = await supabase.rpc("eleicao_definir_principal_regiao", {
        _client_id: clientId,
        _coordenador_id: coordenadorId,
      });
      if (error) { toast.error("Falha ao salvar", { description: error.message }); return; }

      // Garante linha em eleicao_regioes com escopo='interior' + tag auto
      const value = slugify(cidade);
      const tag = normalizeTag(cidade).slice(0, 6);
      await supabase.from("eleicao_regioes" as any).upsert(
        { client_id: clientId, escopo: "interior", value, label: cidade, tag, ativo: true },
        { onConflict: "client_id,escopo,value", ignoreDuplicates: true },
      );

      toast.success(`${cidade}: principal definido`);
      setRows(prev => prev.filter(r => r.cidade !== cidade));
      onSaved();
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Definir coordenadores principais — Interior</DialogTitle>
          <DialogDescription>
            Para cada cidade, escolha o coordenador <strong>principal</strong>. Só o principal recebe a lista
            consolidada de contatos da cidade — os demais entram no time dele.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Recarregar
          </Button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando…</div>
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50/40 dark:bg-emerald-900/10 border-emerald-400">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
            Todas as cidades do interior com coordenadores cadastrados já têm um principal definido.
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Card key={r.cidade} className="p-3 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-[180px]">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{r.cidade}</span>
                  <span className="text-xs text-muted-foreground">({r.candidatos.length} coord.)</span>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <Select
                    value={escolhas[r.cidade] || ""}
                    onValueChange={(v) => setEscolhas(p => ({ ...p, [r.cidade]: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Escolher coordenador..." /></SelectTrigger>
                    <SelectContent>
                      {r.candidatos.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} {c.telefone ? `• ${c.telefone}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  disabled={!escolhas[r.cidade] || saving === r.cidade}
                  onClick={() => definirPrincipal(r.cidade, escolhas[r.cidade])}
                >
                  {saving === r.cidade ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Definir
                </Button>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

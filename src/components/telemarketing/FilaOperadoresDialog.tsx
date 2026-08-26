import { useEffect, useMemo, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FilaOperador {
  operador_id: string;
  nome: string;
  ativo: boolean;
  marcado: boolean;
  pendentes: number;
  ligados: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  campanhaId: string;
  campanhaNome: string;
  onChanged?: () => void;
}

export default function FilaOperadoresDialog({
  open, onOpenChange, clientId, campanhaId, campanhaNome, onChanged,
}: Props) {
  const [operadores, setOperadores] = useState<FilaOperador[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [originais, setOriginais] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState("compartilhada");
  const [acaoRemocao, setAcaoRemocao] = useState("devolver");
  const [repassarPara, setRepassarPara] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [opsRes, filaRes] = await Promise.all([
      supabase.rpc("tele_fila_operadores" as any, { _client_id: clientId, _campanha_id: campanhaId }),
      supabase.from("telemarketing_campanhas" as any).select("modo_designacao").eq("id", campanhaId).maybeSingle(),
    ]);
    setLoading(false);
    if (opsRes.error) { toast.error(opsRes.error.message); return; }
    const rows = ((opsRes.data as any[]) || []).map((row) => ({
      operador_id: row.operador_id,
      nome: row.nome,
      ativo: Boolean(row.ativo),
      marcado: Boolean(row.marcado),
      pendentes: Number(row.pendentes || 0),
      ligados: Number(row.ligados || 0),
    }));
    const marcados = new Set<string>(rows.filter((row) => row.marcado).map((row) => row.operador_id));
    setOperadores(rows);
    setSelecionados(marcados);
    setOriginais(new Set(marcados));
    setModo((filaRes.data as any)?.modo_designacao === "dividida" ? "dividida" : "compartilhada");
    setAcaoRemocao("devolver");
    setRepassarPara("");
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, campanhaId]);

  const ativos = useMemo(() => operadores.filter((operador) => operador.ativo), [operadores]);
  const removidos = useMemo(
    () => operadores.filter((operador) => originais.has(operador.operador_id) && !selecionados.has(operador.operador_id)),
    [operadores, originais, selecionados],
  );
  const removidosComContatos = removidos.some((operador) => operador.pendentes > 0 || operador.ligados > 0);

  const toggle = (id: string, checked: boolean) => {
    setSelecionados((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const save = async () => {
    if (acaoRemocao === "repassar" && !repassarPara) {
      toast.error("Escolha quem receberá os contatos");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("tele_fila_set_operadores" as any, {
      _client_id: clientId,
      _campanha_id: campanhaId,
      _operador_ids: Array.from(selecionados),
      _modo: modo,
      _acao_remocao: acaoRemocao,
      _repassar_para: acaoRemocao === "repassar" ? repassarPara : null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const afetados = Number((data as any)?.contatos_afetados || 0);
    toast.success(afetados > 0 ? `Operadores salvos · ${afetados} contato(s) ajustado(s)` : "Operadores da fila atualizados");
    onChanged?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Operadores da fila</DialogTitle>
          <DialogDescription>
            {campanhaNome}: somente os operadores marcados poderão listar, buscar e puxar contatos desta fila.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setSelecionados(new Set(ativos.map((op) => op.operador_id)))}>Marcar todos</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setSelecionados(new Set())}>Desmarcar todos</Button>
              <Badge variant={selecionados.size ? "secondary" : "destructive"}>
                {selecionados.size ? `${selecionados.size} operador(es) liberado(s)` : "Sem operador — ninguém liga"}
              </Badge>
            </div>

            <div className="divide-y rounded-md border">
              {operadores.map((operador) => (
                <label key={operador.operador_id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/40">
                  <Checkbox
                    checked={selecionados.has(operador.operador_id)}
                    disabled={!operador.ativo}
                    onCheckedChange={(checked) => toggle(operador.operador_id, checked === true)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{operador.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {operador.pendentes} pendentes · {operador.ligados} ligados
                    </span>
                  </span>
                  {!operador.ativo && <Badge variant="outline">Inativo</Badge>}
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Forma de trabalho</p>
              <Select value={modo} onValueChange={setModo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="compartilhada">Compartilhada — o próximo operador disponível puxa o contato</SelectItem>
                  <SelectItem value="dividida">Dividida — contatos distribuídos entre operadores</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {removidos.length > 0 && removidosComContatos && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Contatos de quem está saindo</p>
                <p className="text-xs text-muted-foreground">{removidos.map((op) => op.nome).join(", ")}</p>
                <Select value={acaoRemocao} onValueChange={setAcaoRemocao}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="devolver">Devolver para os operadores que continuam na fila</SelectItem>
                    <SelectItem value="repassar">Repassar para um operador específico</SelectItem>
                    <SelectItem value="manter">Manter parados com o operador removido</SelectItem>
                  </SelectContent>
                </Select>
                {acaoRemocao === "repassar" && (
                  <Select value={repassarPara} onValueChange={setRepassarPara}>
                    <SelectTrigger><SelectValue placeholder="Escolha o operador" /></SelectTrigger>
                    <SelectContent>
                      {ativos.filter((op) => selecionados.has(op.operador_id)).map((op) => (
                        <SelectItem key={op.operador_id} value={op.operador_id}>{op.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={loading || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar operadores
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
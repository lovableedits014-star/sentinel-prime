import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, UserCheck, Users, Unlock, Shuffle, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Operador { id: string; nome: string; ativo?: boolean }
interface Lista { id: string; nome: string; total_contatos: number }
interface Contato {
  id: string; nome: string; telefone: string;
  cidade: string | null; bairro: string | null;
  ligacao_status: string | null;
  assigned_operador_id: string | null;
  assigned_operador_nome: string | null;
  tentativas_count: number;
  lista_id: string | null;
}


interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  campanhaId: string;
  campanhaNome: string;
  operadores: Operador[];
  onChanged?: () => void;
}

const ALL = "__all__";
const NONE = "__none__";

export default function AtribuicoesDialog({
  open, onOpenChange, clientId, campanhaId, campanhaNome, operadores, onChanged,
}: Props) {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"pendentes" | "todos" | "livres" | "atribuidos">("pendentes");
  const [filtroOperador, setFiltroOperador] = useState<string>(ALL);
  const [filtroLista, setFiltroLista] = useState<string>(ALL);
  const [listas, setListas] = useState<Lista[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [modoDistribuicao, setModoDistribuicao] = useState(false);
  const [opsSelecionados, setOpsSelecionados] = useState<Set<string>>(new Set());


  const load = async () => {
    setLoading(true);
    const [contatosRes, listasRes] = await Promise.all([
      supabase.rpc("tele_admin_listar_avulsos" as any, { _client_id: clientId, _campanha_id: campanhaId }),
      supabase.from('telemarketing_listas').select('id, nome').eq('client_id', clientId).order('criado_em', { ascending: false }),
    ]);

    setLoading(false);
    if (contatosRes.error) { toast.error(contatosRes.error.message); return; }

    setContatos((contatosRes.data as any[]) || []);
    // As listas são só um filtro auxiliar: se falharem, os contatos ainda aparecem.
    if (listasRes.error) {
      setListas([]);
      toast.warning("Não foi possível carregar o filtro de listas.");
    } else {
      setListas((listasRes.data as any[]) || []);
    }
    setSelected(new Set());
  };

  useEffect(() => { if (open) { load(); setModoDistribuicao(false); setOpsSelecionados(new Set()); } /* eslint-disable-next-line */ }, [open, campanhaId]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contatos.filter(c => {
      const pend = !c.ligacao_status || c.ligacao_status === "pendente";
      if (filtroStatus === "pendentes" && !pend) return false;
      if (filtroStatus === "livres" && c.assigned_operador_id) return false;
      if (filtroStatus === "atribuidos" && !c.assigned_operador_id) return false;
      if (filtroOperador !== ALL) {
        if (filtroOperador === NONE) { if (c.assigned_operador_id) return false; }
        else if (c.assigned_operador_id !== filtroOperador) return false;
      }
      if (filtroLista !== ALL) {
        if (filtroLista === NONE) { if (c.lista_id) return false; }
        else if (c.lista_id !== filtroLista) return false;
      }
      if (q && !(`${c.nome} ${c.telefone} ${c.cidade || ""} ${c.bairro || ""}`.toLowerCase().includes(q))) return false;

      return true;
    });
  }, [contatos, search, filtroStatus, filtroOperador, filtroLista]);

  const counts = useMemo(() => {
    const pend = contatos.filter(c => !c.ligacao_status || c.ligacao_status === "pendente");
    return {
      total: contatos.length,
      pend: pend.length,
      livres: pend.filter(c => !c.assigned_operador_id).length,
      atribuidos: pend.filter(c => !!c.assigned_operador_id).length,
    };
  }, [contatos]);

  const toggleAll = () => {
    if (selected.size === filtrados.length) setSelected(new Set());
    else setSelected(new Set(filtrados.map(c => c.id)));
  };

  const atribuirPara = async (opId: string | null) => {
    if (!selected.size) return;
    setBusy(true);
    const { error } = await supabase.rpc("tele_assign_contatos" as any, {
      _client_id: clientId, _campanha_id: campanhaId,
      _contato_ids: Array.from(selected), _operador_id: opId,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(opId ? "Contatos atribuídos" : "Contatos liberados");
    onChanged?.();
    load();
  };

  const distribuir = async () => {
    if (!selected.size || !opsSelecionados.size) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("tele_distribute_contatos" as any, {
      _client_id: clientId, _campanha_id: campanhaId,
      _contato_ids: Array.from(selected),
      _operador_ids: Array.from(opsSelecionados),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${(data as any)?.updated ?? 0} contatos distribuídos entre ${(data as any)?.operadores ?? opsSelecionados.size} operadores`);
    setModoDistribuicao(false);
    setOpsSelecionados(new Set());
    onChanged?.();
    load();
  };

  const liberar = async () => {
    if (!selected.size) return;
    setBusy(true);
    const { error } = await supabase.rpc("tele_release_contatos" as any, {
      _client_id: clientId, _campanha_id: campanhaId, _contato_ids: Array.from(selected),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Contatos liberados para o pool");
    onChanged?.();
    load();
  };

  const removerDaFila = async () => {
    if (!selected.size) return;
    if (!confirm(`Remover ${selected.size} contato(s) desta fila? Eles continuam cadastrados, apenas saem da fila e ficam sem operador.`)) return;
    setBusy(true);
    // Agrupa por tabela de origem (quando informada pela RPC)
    const grupos: Record<string, string[]> = {};
    contatos.filter(c => selected.has(c.id)).forEach(c => {
      const tab = (c as any).origem_tabela || "telemarketing_contatos_avulsos";
      (grupos[tab] ||= []).push(c.id);
    });
    let removidos = 0;
    for (const [tabela, ids] of Object.entries(grupos)) {
      const { data, error } = await supabase.rpc("tele_remover_da_fila" as any, {
        _client_id: clientId, _campanha_id: campanhaId, _tabela: tabela, _ids: ids,
      });
      if (error) { setBusy(false); toast.error(error.message); return; }
      removidos += Number((data as any)?.removidos || 0);
    }
    setBusy(false);
    toast.success(`${removidos} contato(s) removido(s) da fila`);
    onChanged?.();
    load();
  };

  const redistribuirFila = async () => {

    const ativos = operadores.filter(o => o.ativo !== false);
    if (ativos.length < 1) { toast.error("Cadastre operadores ativos antes de redistribuir"); return; }
    const escolhidos = opsSelecionados.size > 0
      ? Array.from(opsSelecionados)
      : ativos.map(o => o.id);
    if (!confirm(`Redistribuir todos os contatos pendentes desta fila entre ${escolhidos.length} operador(es)? Contatos já ligados não são afetados.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("tele_redistribute_campanha" as any, {
      _client_id: clientId, _campanha_id: campanhaId,
      _operador_ids: escolhidos, _only_pending: true,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${(data as any)?.updated ?? 0} contatos redistribuídos entre ${(data as any)?.operadores ?? escolhidos.length} operadores`);
    onChanged?.();
    load();
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Designações · {campanhaNome}</DialogTitle>
          <DialogDescription>
            Atribua contatos a operadores específicos, distribua em lote ou libere de volta ao pool.
            Contatos "no pool livre" podem ser puxados por qualquer operador da campanha.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 flex-wrap text-xs">
          <Badge variant="outline">{counts.total} total</Badge>
          <Badge variant="secondary">{counts.pend} pendentes</Badge>
          <Badge variant="outline">{counts.livres} no pool livre</Badge>
          <Badge variant="default">{counts.atribuidos} atribuídos</Badge>
        </div>

        <div className="flex gap-2 flex-wrap items-center border-b pb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <Select value={filtroStatus} onValueChange={(v: any) => setFiltroStatus(v)}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendentes">Só pendentes</SelectItem>
              <SelectItem value="livres">Só pool livre</SelectItem>
              <SelectItem value="atribuidos">Só atribuídos</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroOperador} onValueChange={setFiltroOperador}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos operadores</SelectItem>
              <SelectItem value={NONE}>— Pool livre —</SelectItem>
              {operadores.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroLista} onValueChange={setFiltroLista}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Lista..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as listas</SelectItem>
              <SelectItem value={NONE}>— Sem lista —</SelectItem>
              {listas.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
            </SelectContent>
          </Select>

          <Button size="sm" variant="outline" onClick={redistribuirFila} disabled={busy}>
            <Shuffle className="w-3.5 h-3.5 mr-1" />Redistribuir fila
          </Button>
        </div>


        {selected.size > 0 && !modoDistribuicao && (
          <div className="flex gap-2 flex-wrap items-center bg-primary/5 border rounded-md p-2">
            <span className="text-sm font-medium">{selected.size} selecionado(s)</span>
            <div className="flex-1" />
            <Select onValueChange={(v) => atribuirPara(v)} value="">
              <SelectTrigger className="w-[220px] h-8 text-xs">
                <SelectValue placeholder="Atribuir a…" />
              </SelectTrigger>
              <SelectContent>
                {operadores.filter(o => o.ativo !== false).map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setModoDistribuicao(true)}>
              <Shuffle className="w-3.5 h-3.5 mr-1" />Distribuir
            </Button>
            <Button size="sm" variant="outline" onClick={liberar} disabled={busy}>
              <Unlock className="w-3.5 h-3.5 mr-1" />Liberar
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={removerDaFila} disabled={busy}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />Remover da fila
            </Button>

          </div>
        )}

        {modoDistribuicao && (
          <div className="border rounded-md p-3 bg-muted/30 space-y-2">
            <p className="text-sm font-medium">Distribuir {selected.size} contato(s) entre:</p>
            <div className="flex gap-2 flex-wrap">
              {operadores.filter(o => o.ativo !== false).map(o => {
                const checked = opsSelecionados.has(o.id);
                return (
                  <label key={o.id} className={`flex items-center gap-1.5 border rounded-md px-2 py-1 cursor-pointer text-xs ${checked ? "bg-primary/10 border-primary" : ""}`}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = new Set(opsSelecionados);
                        if (v) next.add(o.id); else next.delete(o.id);
                        setOpsSelecionados(next);
                      }}
                    />
                    {o.nome}
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setModoDistribuicao(false); setOpsSelecionados(new Set()); }}>Cancelar</Button>
              <Button size="sm" onClick={distribuir} disabled={busy || !opsSelecionados.size}>
                Distribuir igualmente
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">Nenhum contato encontrado</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs sticky top-0">
                <tr>
                  <th className="p-2 text-left w-8">
                    <Checkbox
                      checked={selected.size === filtrados.length && filtrados.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="p-2 text-left">Nome</th>
                  <th className="p-2 text-left">Telefone</th>
                  <th className="p-2 text-left">Cidade/Bairro</th>
                  <th className="p-2 text-left">Operador</th>
                  <th className="p-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => (
                  <tr key={c.id} className="border-t hover:bg-muted/30">
                    <td className="p-2">
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          if (v) next.add(c.id); else next.delete(c.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="p-2 truncate max-w-[180px]">{c.nome}</td>
                    <td className="p-2 font-mono text-xs">{c.telefone}</td>
                    <td className="p-2 text-xs text-muted-foreground truncate max-w-[160px]">
                      {[c.cidade, c.bairro].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="p-2 text-xs">
                      {c.assigned_operador_nome
                        ? <Badge variant="default" className="text-[10px]"><UserCheck className="w-3 h-3 mr-1" />{c.assigned_operador_nome}</Badge>
                        : <Badge variant="outline" className="text-[10px]"><Users className="w-3 h-3 mr-1" />Livre</Badge>}
                    </td>
                    <td className="p-2 text-xs">
                      {!c.ligacao_status || c.ligacao_status === "pendente"
                        ? <Badge variant="secondary" className="text-[10px]">Pendente</Badge>
                        : <Badge variant="outline" className="text-[10px]">{c.ligacao_status}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

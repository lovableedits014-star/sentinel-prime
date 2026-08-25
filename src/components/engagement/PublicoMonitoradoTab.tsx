import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Ban, Plus, RefreshCw, Search, Trash2, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import PendenciasDadosPanel from "@/components/engagement/PendenciasDadosPanel";
import {
  criarGrupo, definirPublico, excluirGrupo, fetchCandidatos, fetchGrupos,
  type CandidatoRow, type PublicoGrupo,
} from "@/lib/engagement-monitor";

const cap = (s?: string | null) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtPhone = (s?: string | null) => {
  const d = (s || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "—";
};

export default function PublicoMonitoradoTab({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState<PublicoGrupo[]>([]);
  const [grupoId, setGrupoId] = useState<string>("geral");
  const [rows, setRows] = useState<CandidatoRow[]>([]);
  const [busca, setBusca] = useState("");
  const [cargoFilter, setCargoFilter] = useState("todos");
  const [regiaoFilter, setRegiaoFilter] = useState("todas");
  const [somenteMarcados, setSomenteMarcados] = useState(false);
  const [novoGrupo, setNovoGrupo] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const grupoParam = grupoId === "geral" ? null : grupoId;

  const load = async () => {
    setLoading(true);
    try {
      const [g, c] = await Promise.all([fetchGrupos(clientId), fetchCandidatos(clientId, grupoParam)]);
      setGrupos(g);
      setRows(c);
    } catch (e) {
      toast.error("Erro ao carregar público: " + (e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, grupoId]);

  const cargos = useMemo(
    () => Array.from(new Set(rows.map((r) => r.cargo).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const regioes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.regiao || r.cidade).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !(r.nome || "").toLowerCase().includes(term) && !(r.telefone || "").includes(term)) return false;
      if (cargoFilter !== "todos" && r.cargo !== cargoFilter) return false;
      if (regiaoFilter !== "todas" && (r.regiao || r.cidade) !== regiaoFilter) return false;
      if (somenteMarcados && !r.no_publico) return false;
      return true;
    });
  }, [rows, busca, cargoFilter, regiaoFilter, somenteMarcados]);

  const totalMarcados = rows.filter((r) => r.no_publico).length;
  const totalDispensados = rows.filter((r) => r.dispensado).length;

  const alterar = async (r: CandidatoRow, incluido: boolean, dispensado = false) => {
    const key = `${r.origem}:${r.ref_id}`;
    setSaving(key);
    try {
      await definirPublico(clientId, r.origem, r.ref_id, incluido, grupoParam, dispensado);
      setRows((prev) =>
        prev.map((x) => (x.origem === r.origem && x.ref_id === r.ref_id
          ? { ...x, no_publico: incluido && !dispensado, dispensado }
          : x)),
      );
    } catch (e) {
      toast.error("Erro ao salvar: " + (e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const marcarVisiveis = async (incluido: boolean) => {
    try {
      for (const r of filtered) {
        if (r.no_publico === incluido) continue;
        await definirPublico(clientId, r.origem, r.ref_id, incluido, grupoParam, false);
      }
      toast.success(incluido ? "Pessoas filtradas adicionadas ao público" : "Pessoas filtradas removidas do público");
      await load();
    } catch (e) {
      toast.error("Erro na ação em lote: " + (e as Error).message);
    }
  };

  if (loading) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Quem é obrigado a interagir
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            As pessoas vêm dos cadastros que você já tem (Eleição, Contratados, Funcionários, Pessoas e contas do
            portal) — aqui você <strong>marca quem entra no monitoramento</strong>. Use a <strong>Lista geral</strong>
            {" "}para inclusões e dispensas que valem junto com as regras automáticas, ou crie um <strong>grupo</strong>
            {" "}e aponte a regra para ele no modo “lista manual”.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-3 sm:px-6">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Lista</Label>
              <Select value={grupoId} onValueChange={setGrupoId}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Lista geral (inclusões/dispensas)</SelectItem>
                  {grupos.map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="gap-2" onClick={() => setNovoGrupo("")}>
              <Plus className="h-4 w-4" /> Novo grupo
            </Button>
            {grupoParam && (
              <Button variant="ghost" className="gap-2 text-destructive" onClick={async () => {
                try { await excluirGrupo(grupoParam); setGrupoId("geral"); toast.success("Grupo excluído"); await load(); }
                catch (e) { toast.error((e as Error).message); }
              }}><Trash2 className="h-4 w-4" /> Excluir grupo</Button>
            )}
            <Button variant="outline" className="gap-2 ml-auto" onClick={load}>
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              {totalMarcados} no público
            </Badge>
            {totalDispensados > 0 && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                {totalDispensados} dispensados
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Select value={cargoFilter} onValueChange={setCargoFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Cargo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os cargos</SelectItem>
                {cargos.map((c) => <SelectItem key={c} value={c}>{cap(c)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={regiaoFilter} onValueChange={setRegiaoFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Região" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as regiões</SelectItem>
                {regioes.map((r) => <SelectItem key={r} value={r}>{cap(r)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSomenteMarcados((v) => !v)}>
              <UserCheck className="h-4 w-4" /> {somenteMarcados ? "Ver todos" : "Ver só marcados"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => marcarVisiveis(true)}>Marcar filtrados</Button>
            <Button variant="ghost" size="sm" onClick={() => marcarVisiveis(false)}>Desmarcar filtrados</Button>
          </div>

          <div className="rounded-md border overflow-x-auto max-h-[520px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Região</TableHead>
                  <TableHead>Redes</TableHead>
                  <TableHead className="text-right">Dispensar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma pessoa encontrada com estes filtros.
                  </TableCell></TableRow>
                )}
                {filtered.map((r) => {
                  const key = `${r.origem}:${r.ref_id}`;
                  return (
                    <TableRow key={key} className={r.dispensado ? "opacity-60" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={r.no_publico}
                          disabled={saving === key || r.dispensado}
                          onCheckedChange={(v) => alterar(r, !!v, false)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{r.nome}</div>
                        <div className="text-[11px] text-muted-foreground">{fmtPhone(r.telefone)}</div>
                      </TableCell>
                      <TableCell className="text-xs">{cap(r.cargo)}</TableCell>
                      <TableCell className="text-xs">{cap(r.regiao || r.cidade) || "—"}</TableCell>
                      <TableCell className="text-xs space-x-1">
                        {r.instagram_handle
                          ? <Badge variant="outline" className="bg-pink-500/10 text-pink-600 border-pink-500/30">IG</Badge>
                          : <Badge variant="outline" className="text-muted-foreground">sem IG</Badge>}
                        {r.facebook_key
                          ? <Badge variant="outline" className="bg-sky-500/10 text-sky-600 border-sky-500/30">FB</Badge>
                          : <Badge variant="outline" className="text-muted-foreground">sem FB</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant={r.dispensado ? "secondary" : "ghost"} className="gap-1.5 text-xs"
                          onClick={() => alterar(r, false, !r.dispensado)}>
                          <Ban className="h-3.5 w-3.5" /> {r.dispensado ? "Reativar" : "Dispensar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PendenciasDadosPanel clientId={clientId} />

      <Dialog open={novoGrupo !== null} onOpenChange={(o) => !o && setNovoGrupo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo grupo de obrigados</DialogTitle>
            <DialogDescription className="text-xs">
              Um grupo é uma lista fechada de pessoas. Depois, na regra, escolha o modo “lista manual” e aponte para
              este grupo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">Nome do grupo</Label>
            <Input value={novoGrupo ?? ""} onChange={(e) => setNovoGrupo(e.target.value)} placeholder="Ex.: Coordenadores da Capital" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoGrupo(null)}>Cancelar</Button>
            <Button onClick={async () => {
              if (!novoGrupo?.trim()) return toast.error("Informe o nome");
              try {
                const g = await criarGrupo(clientId, novoGrupo);
                setNovoGrupo(null);
                setGrupoId(g.id);
                toast.success("Grupo criado");
              } catch (e) { toast.error((e as Error).message); }
            }}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

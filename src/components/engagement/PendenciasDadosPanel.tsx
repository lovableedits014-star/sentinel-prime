import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Check, FileDown, RefreshCw, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import VincularAutorDialog, { type AlvoVinculo } from "@/components/engagement/VincularAutorDialog";
import { upsertSocial, type Origem } from "@/lib/engagement-team";
import {
  fetchGrupos, fetchPendencias, salvarTelefonePessoa,
  type PendenciaRow, type PublicoGrupo,
} from "@/lib/engagement-monitor";

const cap = (s?: string | null) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function PendenciasDadosPanel({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PendenciaRow[]>([]);
  const [grupos, setGrupos] = useState<PublicoGrupo[]>([]);
  const [grupoId, setGrupoId] = useState<string>("auto");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("pendentes");
  const [edits, setEdits] = useState<Record<string, { ig?: string; fb?: string; tel?: string }>>({});
  const [vinculo, setVinculo] = useState<{ alvo: AlvoVinculo; platform: "facebook" | "instagram" } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [g, p] = await Promise.all([
        fetchGrupos(clientId),
        fetchPendencias(clientId, grupoId === "auto" ? null : grupoId),
      ]);
      setGrupos(g);
      setRows(p);
      setEdits({});
    } catch (e) {
      toast.error("Erro ao carregar pendências: " + (e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, grupoId]);

  const totals = useMemo(() => ({
    total: rows.length,
    prontas: rows.filter((r) => r.pronta_para_cobranca).length,
    semIg: rows.filter((r) => r.sem_instagram).length,
    semFb: rows.filter((r) => r.sem_facebook).length,
    semTel: rows.filter((r) => r.sem_telefone).length,
    semProva: rows.filter((r) => r.sem_prova).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !(r.nome || "").toLowerCase().includes(term) && !(r.telefone || "").includes(term)) return false;
      if (filtro === "pendentes" && !(r.sem_instagram || r.sem_facebook || r.sem_telefone)) return false;
      if (filtro === "bloqueadas" && r.pronta_para_cobranca) return false;
      if (filtro === "sem_prova" && !r.sem_prova) return false;
      if (filtro === "sem_telefone" && !r.sem_telefone) return false;
      if (filtro === "sem_rede" && !(r.sem_instagram && r.sem_facebook)) return false;
      return true;
    });
  }, [rows, busca, filtro]);


  const key = (r: PendenciaRow) => `${r.origem}:${r.ref_id}`;
  const setEdit = (r: PendenciaRow, patch: { ig?: string; fb?: string; tel?: string }) =>
    setEdits((prev) => ({ ...prev, [key(r)]: { ...prev[key(r)], ...patch } }));

  const salvarLinha = async (r: PendenciaRow) => {
    const e = edits[key(r)] || {};
    try {
      if (e.ig?.trim()) await upsertSocial(r.origem as Origem, r.ref_id, "instagram", e.ig.trim());
      if (e.fb?.trim()) await upsertSocial(r.origem as Origem, r.ref_id, "facebook", e.fb.trim());
      if (e.tel?.trim()) await salvarTelefonePessoa(clientId, r.origem, r.ref_id, e.tel.trim());
      if (!e.ig?.trim() && !e.fb?.trim() && !e.tel?.trim()) return toast.info("Nada para salvar nesta linha");
      toast.success(`Dados de ${r.nome} atualizados`);
      await load();
    } catch (err) {
      toast.error("Erro ao salvar: " + (err as Error).message);
    }
  };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const data = filtered.map((r) => ({
      Nome: r.nome,
      Cargo: cap(r.cargo),
      Telefone: r.telefone || "",
      Região: cap(r.regiao || r.cidade),
      "Instagram": r.instagram_handle || "FALTA",
      "Facebook": r.facebook_key ? "OK" : "FALTA",
      "Telefone cadastrado": r.sem_telefone ? "FALTA" : "OK",
      "Sem meio de comprovação": r.sem_prova ? "SIM" : "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Pendências");
    XLSX.writeFile(wb, `pendencias-cadastro-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Faltam dados
        </CardTitle>
        <CardDescription className="text-xs">
          Sem <strong>@ do Instagram</strong> ou <strong>perfil do Facebook</strong> não é possível comprovar comentário
          (evidência E1). Sem <strong>telefone</strong> não há como comprovar clique no link rastreado nem conclusão no
          portal (E1/E2). Preencha aqui mesmo — ou use <strong>Sugestões</strong> para vincular a pessoa a um autor que
          já comentou nas suas publicações.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 text-center">
          {[
            ["No público", totals.total],
            ["Prontos p/ cobrar", totals.prontas],
            ["Sem Instagram", totals.semIg],
            ["Sem Facebook", totals.semFb],
            ["Sem telefone", totals.semTel],
            ["Sem comprovação", totals.semProva],
          ].map(([l, v]) => (
            <div key={String(l)} className="rounded-md border p-2">
              <p className="text-[11px] text-muted-foreground">{l}</p>
              <p className="text-lg font-semibold">{v as number}</p>
            </div>
          ))}
        </div>


        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Select value={grupoId} onValueChange={setGrupoId}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Lista geral de obrigados</SelectItem>
              {grupos.map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendentes">Com alguma pendência</SelectItem>
              <SelectItem value="sem_prova">Sem meio de comprovação</SelectItem>
              <SelectItem value="sem_telefone">Sem telefone</SelectItem>
              <SelectItem value="sem_rede">Sem nenhuma rede</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={load}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
          <Button variant="outline" className="gap-2" onClick={exportar}><FileDown className="h-4 w-4" /> Excel</Button>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Pessoa</TableHead>
                <TableHead className="min-w-[150px]">@ Instagram</TableHead>
                <TableHead className="min-w-[170px]">Facebook</TableHead>
                <TableHead className="min-w-[140px]">Telefone</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma pendência nesta lista.
                </TableCell></TableRow>
              )}
              {filtered.map((r) => {
                const e = edits[key(r)] || {};
                return (
                  <TableRow key={key(r)}>
                    <TableCell>
                      <div className="font-medium text-sm">{r.nome}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {cap(r.cargo)} · {cap(r.regiao || r.cidade) || "sem região"}
                        {r.sem_prova && (
                          <Badge variant="outline" className="ml-2 bg-destructive/15 text-destructive border-destructive/30">
                            sem comprovação
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.instagram_handle ? (
                        <span className="text-xs text-emerald-600">@{r.instagram_handle}</span>
                      ) : (
                        <div className="flex gap-1">
                          <Input className="h-8 text-xs" placeholder="@usuario" value={e.ig ?? ""} onChange={(ev) => setEdit(r, { ig: ev.target.value })} />
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Sugestões de quem já comentou"
                            onClick={() => setVinculo({ alvo: { origem: r.origem as Origem, refId: r.ref_id, nome: r.nome }, platform: "instagram" })}>
                            <Sparkles className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.facebook_key ? (
                        <span className="text-xs text-emerald-600">vinculado</span>
                      ) : (
                        <div className="flex gap-1">
                          <Input className="h-8 text-xs" placeholder="URL ou usuário" value={e.fb ?? ""} onChange={(ev) => setEdit(r, { fb: ev.target.value })} />
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Sugestões de quem já comentou"
                            onClick={() => setVinculo({ alvo: { origem: r.origem as Origem, refId: r.ref_id, nome: r.nome }, platform: "facebook" })}>
                            <Sparkles className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {!r.sem_telefone ? (
                        <span className="text-xs text-emerald-600">{r.telefone}</span>
                      ) : (
                        <Input className="h-8 text-xs" placeholder="(67) 99999-9999" value={e.tel ?? ""} onChange={(ev) => setEdit(r, { tel: ev.target.value })} />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => salvarLinha(r)}>
                        <Check className="h-3.5 w-3.5" /> Salvar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <VincularAutorDialog
        open={!!vinculo}
        onOpenChange={(o) => !o && setVinculo(null)}
        clientId={clientId}
        alvo={vinculo?.alvo ?? null}
        platform={vinculo?.platform ?? "facebook"}
        onLinked={() => { setVinculo(null); load(); }}
      />
    </Card>
  );
}

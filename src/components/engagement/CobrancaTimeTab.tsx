import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, Printer, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { cargoLabel, fetchCobranca, type CobrancaRow } from "@/lib/engagement-team";
import { exportCobrancaPdf } from "@/lib/engagement-export-pdf";

const SITUACAO: Record<CobrancaRow["situacao"], { label: string; className: string }> = {
  em_dia: { label: "Em dia", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  abaixo: { label: "Abaixo da meta", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  zerado: { label: "Sem interação", className: "bg-destructive/15 text-destructive border-destructive/30" },
  sem_cadastro: { label: "Sem @", className: "bg-muted text-muted-foreground" },
};

export default function CobrancaTimeTab({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CobrancaRow[]>([]);
  const [days, setDays] = useState(30);
  const [busca, setBusca] = useState("");
  const [cargoFilter, setCargoFilter] = useState("todos");
  const [situacaoFilter, setSituacaoFilter] = useState("todos");

  const fetchData = async () => {
    setLoading(true);
    try {
      setRows(await fetchCobranca(clientId, days));
    } catch (e) {
      toast.error("Erro ao carregar cobrança: " + (e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, days]);

  const cargos = useMemo(
    () => Array.from(new Set(rows.map((r) => r.cargo))).sort((a, b) => cargoLabel(a).localeCompare(cargoLabel(b))),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !(r.nome || "").toLowerCase().includes(term)) return false;
      if (cargoFilter !== "todos" && r.cargo !== cargoFilter) return false;
      if (situacaoFilter !== "todos" && r.situacao !== situacaoFilter) return false;
      return true;
    });
  }, [rows, busca, cargoFilter, situacaoFilter]);

  const periodoLabel = `Período: últimos ${days} dias`;
  const filtros = [
    { label: "Cargo", value: cargoFilter === "todos" ? "Todos" : cargoLabel(cargoFilter) },
    { label: "Situação", value: situacaoFilter === "todos" ? "Todas" : SITUACAO[situacaoFilter as CobrancaRow["situacao"]].label },
  ];

  const exportar = (mode: "save" | "print") => {
    if (filtered.length === 0) {
      toast.error("Nenhuma pessoa nos filtros atuais.");
      return;
    }
    exportCobrancaPdf({ clientName, periodoLabel, filtros, rows: filtered, mode });
  };

  const contagem = useMemo(() => {
    const c = { em_dia: 0, abaixo: 0, zerado: 0, sem_cadastro: 0 } as Record<CobrancaRow["situacao"], number>;
    for (const r of rows) c[r.situacao]++;
    return c;
  }, [rows]);

  return (
    <Card>
      <CardHeader className="px-3 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg">Cobrança do time</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Quem está cumprindo as obrigações básicas: curtir/comentar nas publicações e compartilhar as
              missões do portal. Ordenado por região e nome no relatório em PDF.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="h-9 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportar("save")}>
              <FileDown className="mr-1 h-4 w-4" />
              Baixar PDF
            </Button>
            <Button size="sm" onClick={() => exportar("print")}>
              <Printer className="mr-1 h-4 w-4" />
              Imprimir
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pessoa…"
              className="pl-8"
            />
          </div>
          <Select value={cargoFilter} onValueChange={setCargoFilter}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os cargos</SelectItem>
              {cargos.map((c) => (
                <SelectItem key={c} value={c}>
                  {cargoLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={situacaoFilter} onValueChange={setSituacaoFilter}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as situações</SelectItem>
              <SelectItem value="em_dia">Em dia ({contagem.em_dia})</SelectItem>
              <SelectItem value="abaixo">Abaixo da meta ({contagem.abaixo})</SelectItem>
              <SelectItem value="zerado">Sem interação ({contagem.zerado})</SelectItem>
              <SelectItem value="sem_cadastro">Sem @ ({contagem.sem_cadastro})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="text-center">Interações</TableHead>
                  <TableHead className="text-center">Missões</TableHead>
                  <TableHead className="text-center">Sem interagir</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhuma pessoa encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={`${r.origem}:${r.ref_id}`}>
                      <TableCell className="max-w-[240px]">
                        <p className="truncate text-sm font-medium">{r.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.regiao || r.cidade || "—"}
                          {r.instagram_handle ? ` · @${r.instagram_handle}` : ""}
                          {r.facebook_key ? " · FB" : ""}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {cargoLabel(r.cargo)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-semibold">{r.interacoes}</span>
                        <span className="ml-1 text-[10px] text-muted-foreground">/ {r.min_interacoes}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-semibold">{r.missoes_concluidas}</span>
                        <span className="ml-1 text-[10px] text-muted-foreground">/ {r.min_missoes}</span>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {r.dias_sem_interagir == null ? "—" : `${r.dias_sem_interagir}d`}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${SITUACAO[r.situacao].className}`}>
                          {SITUACAO[r.situacao].label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

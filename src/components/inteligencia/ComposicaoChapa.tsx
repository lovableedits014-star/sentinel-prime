import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Filter, Search, Users, ArrowUpDown, ArrowDown, ArrowUp, RefreshCw, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import * as XLSX from "xlsx";
import { toast } from "sonner";

const SUPER_ADMIN_EMAIL = "lovableedits014@gmail.com";
const CARGOS_DISPONIVEIS = [
  "Prefeito", "Vereador", "Presidente", "Governador",
  "Senador", "Deputado Federal", "Deputado Estadual", "Deputado Distrital",
];

type ChapaRow = {
  nome_completo: string;
  nome_urna: string | null;
  partido: string | null;
  cargos: string;
  ufs: string;
  municipios: string;
  votos_2022: number;
  votos_2024: number;
  total: number;
};

type SortKey = "total" | "votos_2024" | "votos_2022" | "nome_completo" | "partido";
type SortDir = "asc" | "desc";

export default function ComposicaoChapa() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsSuperAdmin((user?.email || "").toLowerCase() === SUPER_ADMIN_EMAIL);
    });
  }, []);

  // Filtros
  const [minVotos, setMinVotos] = useState<string>("0");
  const [anoMode, setAnoMode] = useState<"ambos" | "2022" | "2024">("ambos");
  const [cargo, setCargo] = useState<string>("__all__");
  const [partido, setPartido] = useState<string>("__all__");
  const [uf, setUf] = useState<string>("MS");
  const [municipio, setMunicipio] = useState<string>("__all__");
  const [search, setSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [importing, setImporting] = useState(false);

  // Modal de detalhamento por município
  const [selecionado, setSelecionado] = useState<ChapaRow | null>(null);
  const [anoDetalhe, setAnoDetalhe] = useState<"ambos" | "2022" | "2024">("ambos");

  // Trigger de refetch após importação
  const [refreshTick, setRefreshTick] = useState(0);

  // Lista de UFs e municípios disponíveis
  const { data: locais = [] } = useQuery({
    queryKey: ["chapa-locais", refreshTick],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_municipios" as any);
      if (error) throw error;
      const ufSet = new Set<string>();
      (data || []).forEach((r: any) => {
        if (r.uf) ufSet.add(r.uf);
      });
      return {
        ufs: Array.from(ufSet).sort(),
        municipios: (data || [])
          .map((r: any) => ({ uf: r.uf, municipio: r.municipio }))
          .sort((a: any, b: any) => a.municipio.localeCompare(b.municipio)),
      };
    },
  });

  const ufs = (locais as any).ufs || [];
  const municipiosDaUf = ((locais as any).municipios || []).filter((m: any) => uf === "__all__" || m.uf === uf);

  // Lista de partidos disponíveis (filtrada pelos dados visíveis)
  const { data: partidos = [] } = useQuery({
    queryKey: ["chapa-partidos", refreshTick],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_partidos" as any);
      if (error) throw error;
      return (data || []).map((r: any) => r.partido);
    },
  });

  // Resultado principal
  const anos = anoMode === "ambos" ? [2022, 2024] : anoMode === "2022" ? [2022] : [2024];

  const { data: candidatos = [], isLoading, refetch } = useQuery({
    queryKey: ["chapa-candidatos", uf, municipio, anoMode, cargo, partido, minVotos, search, refreshTick],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_chapa_candidates" as any, {
        p_uf: uf === "__all__" ? null : uf,
        p_municipio: municipio === "__all__" ? null : municipio,
        p_anos: anos,
        p_cargos: cargo === "__all__" ? null : [cargo],
        p_partido: partido === "__all__" ? null : partido,
        p_min_votos: Number(minVotos) || 0,
        p_search: search.trim() || null,
      });
      if (error) throw error;
      return (data || []) as ChapaRow[];
    },
  });

  // Reset município ao trocar UF
  useEffect(() => { setMunicipio("__all__"); }, [uf]);

  // Ordenação client-side (dados já vêm filtrados/agregados)
  const ordenados = useMemo(() => {
    const arr = [...candidatos];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "total": cmp = (a.total || 0) - (b.total || 0); break;
        case "votos_2024": cmp = (a.votos_2024 || 0) - (b.votos_2024 || 0); break;
        case "votos_2022": cmp = (a.votos_2022 || 0) - (b.votos_2022 || 0); break;
        case "nome_completo": cmp = (a.nome_completo || "").localeCompare(b.nome_completo || ""); break;
        case "partido": cmp = (a.partido || "").localeCompare(b.partido || ""); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [candidatos, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const sortIcon = (k: SortKey) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3.5 h-3.5 inline ml-1 opacity-40" />;
    return sortDir === "desc"
      ? <ArrowDown className="w-3.5 h-3.5 inline ml-1" />
      : <ArrowUp className="w-3.5 h-3.5 inline ml-1" />;
  };

  const fmt = (n: number) => (n || 0).toLocaleString("pt-BR");

  const exportar = () => {
    if (ordenados.length === 0) return;
    const sheet = ordenados.map((r) => ({
      Nome: r.nome_completo,
      "Nome de urna": r.nome_urna || "",
      Partido: r.partido || "",
      Cargos: r.cargos || "",
      UFs: r.ufs || "",
      Municípios: r.municipios || "",
      "Votos 2022": r.votos_2022 || 0,
      "Votos 2024": r.votos_2024 || 0,
      "Total": r.total || 0,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheet);
    XLSX.utils.book_append_sheet(wb, ws, "Composição de Chapa");
    XLSX.writeFile(wb, `composicao_chapa_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const importarTSE2022 = async () => {
    if (!confirm("Importar todos os candidatos do TSE 2022 do MS? O processo pode levar até 1 minuto.")) return;
    setImporting(true);
    toast.info("Iniciando importação dos dados do TSE 2022 (MS)...");
    try {
      const { data, error } = await supabase.functions.invoke("import-tse-results", {
        body: { ano: 2022, uf: "MS" },
      });
      if (error) throw error;
      const d: any = data;
      if (d?.error) throw new Error(d.error);
      toast.success(`Importação concluída: ${d?.inserted || 0} registros (${d?.failed || 0} falhas)`);
      setRefreshTick((x) => x + 1);
      refetch();
    } catch (e: any) {
      console.error(e);
      toast.error(`Falha na importação: ${e?.message || e}`);
    } finally {
      setImporting(false);
    }
  };

  const totalGeral = ordenados.reduce((s, r) => s + (r.total || 0), 0);

  // Agrega força por partido com base nos resultados filtrados
  const partidosRanking = useMemo(() => {
    const map = new Map<string, { partido: string; total: number; v2022: number; v2024: number; candidatos: number }>();
    for (const r of ordenados) {
      const key = r.partido || "SEM PARTIDO";
      const cur = map.get(key) || { partido: key, total: 0, v2022: 0, v2024: 0, candidatos: 0 };
      cur.total += r.total || 0;
      cur.v2022 += r.votos_2022 || 0;
      cur.v2024 += r.votos_2024 || 0;
      cur.candidatos += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [ordenados]);

  return (
    <div className="space-y-4">
      {/* Cabeçalho contextual */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-primary" /> Composição de Chapa
          </CardTitle>
          <CardDescription>
            Cruze candidatos das eleições de <strong>2022</strong> e <strong>2024</strong> para identificar lideranças com base eleitoral comprovada. Ideal para montar chapas, escolher vices e mapear potenciais aliados ou adversários.
          </CardDescription>
        </CardHeader>
        {isSuperAdmin && (
          <CardContent className="pt-0">
            <Button onClick={importarTSE2022} disabled={importing} variant="outline" size="sm">
              <RefreshCw className={`w-4 h-4 mr-2 ${importing ? "animate-spin" : ""}`} />
              {importing ? "Importando..." : "Importar dados TSE 2022 (MS)"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">Disponível apenas para Super-Admin. Já existindo dados, eles serão atualizados (upsert).</p>
          </CardContent>
        )}
      </Card>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="w-4 h-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div>
            <Label className="text-xs">Mín. de votos</Label>
            <Input
              type="number"
              min={0}
              value={minVotos}
              onChange={(e) => setMinVotos(e.target.value)}
              placeholder="Ex: 1000"
            />
          </div>
          <div>
            <Label className="text-xs">Período</Label>
            <Select value={anoMode} onValueChange={(v: any) => setAnoMode(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ambos">2022 + 2024</SelectItem>
                <SelectItem value="2022">Somente 2022</SelectItem>
                <SelectItem value="2024">Somente 2024</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Cargo</Label>
            <Select value={cargo} onValueChange={setCargo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {CARGOS_DISPONIVEIS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Partido</Label>
            <Select value={partido} onValueChange={setPartido}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__all__">Todos</SelectItem>
                {(partidos as string[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">UF</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {(ufs as string[]).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Município</Label>
            <Select value={municipio} onValueChange={setMunicipio}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__all__">Todos</SelectItem>
                {municipiosDaUf.map((m: any) => <SelectItem key={`${m.uf}-${m.municipio}`} value={m.municipio}>{m.municipio}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Buscar nome</Label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-7" placeholder="Nome do candidato" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo + ações */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          {isLoading ? "Carregando..." : (
            <>
              <strong>{ordenados.length}</strong> candidato(s) encontrado(s) — Total agregado: <strong>{fmt(totalGeral)}</strong> votos
            </>
          )}
        </div>
        <Button onClick={exportar} disabled={ordenados.length === 0} variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" /> Exportar Excel
        </Button>
      </div>

      {/* Força por Partido */}
      {!isLoading && partidosRanking.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Força por Partido
            </CardTitle>
            <CardDescription className="text-xs">
              Soma dos votos dos candidatos listados acima, agrupada por partido. Útil para medir o tamanho da base eleitoral de cada legenda no recorte atual.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Partido</TableHead>
                  <TableHead className="text-right">Candidatos</TableHead>
                  <TableHead className="text-right">Votos 2022</TableHead>
                  <TableHead className="text-right">Votos 2024</TableHead>
                  <TableHead className="text-right font-semibold">Total</TableHead>
                  <TableHead className="text-right">% do total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partidosRanking.map((p, i) => {
                  const pct = totalGeral > 0 ? (p.total / totalGeral) * 100 : 0;
                  return (
                    <TableRow key={p.partido}>
                      <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                      <TableCell><Badge variant="outline">{p.partido}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{p.candidatos}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.v2022 ? fmt(p.v2022) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.v2024 ? fmt(p.v2024) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmt(p.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{pct.toFixed(1)}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tabela */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("nome_completo")}>
                  Nome {sortIcon("nome_completo")}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("partido")}>
                  Partido {sortIcon("partido")}
                </TableHead>
                <TableHead>Cargos</TableHead>
                <TableHead>Município(s)</TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("votos_2022")}>
                  Votos 2022 {sortIcon("votos_2022")}
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("votos_2024")}>
                  Votos 2024 {sortIcon("votos_2024")}
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none font-semibold" onClick={() => toggleSort("total")}>
                  Total {sortIcon("total")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando candidatos...</TableCell></TableRow>
              ) : ordenados.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum candidato encontrado com os filtros atuais. {anoMode !== "2024" && "Lembre-se: dados de 2022 precisam ser importados pelo Super-Admin."}
                </TableCell></TableRow>
              ) : (
                ordenados.slice(0, 1000).map((r, idx) => (
                  <TableRow key={`${r.nome_completo}-${r.partido}-${idx}`}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => { setSelecionado(r); setAnoDetalhe(anoMode); }}
                        className="font-medium text-left hover:text-primary hover:underline inline-flex items-center gap-1"
                        title="Ver força por município"
                      >
                        <MapPin className="w-3.5 h-3.5 opacity-60" />
                        {r.nome_completo}
                      </button>
                      {r.nome_urna && r.nome_urna !== r.nome_completo && (
                        <div className="text-xs text-muted-foreground">{r.nome_urna}</div>
                      )}
                    </TableCell>
                    <TableCell>{r.partido ? <Badge variant="outline">{r.partido}</Badge> : "—"}</TableCell>
                    <TableCell className="text-xs">{r.cargos}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={r.municipios}>{r.municipios}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.votos_2022 ? fmt(r.votos_2022) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.votos_2024 ? fmt(r.votos_2024) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(r.total)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {ordenados.length > 1000 && (
            <div className="text-xs text-muted-foreground p-3 border-t">
              Exibindo os 1.000 primeiros de {ordenados.length} resultados. Use os filtros para refinar.
            </div>
          )}
        </CardContent>
      </Card>

      <CandidateBreakdownDialog
        candidato={selecionado}
        anoMode={anoDetalhe}
        onAnoModeChange={setAnoDetalhe}
        onClose={() => setSelecionado(null)}
      />
    </div>
  );
}

// ============== Modal: Força por Município ==============
type BreakdownRow = {
  uf: string;
  municipio: string;
  cargo: string;
  ano: number;
  partido: string | null;
  nome_urna: string | null;
  votos: number;
};

function CandidateBreakdownDialog({
  candidato,
  anoMode,
  onAnoModeChange,
  onClose,
}: {
  candidato: ChapaRow | null;
  anoMode: "ambos" | "2022" | "2024";
  onAnoModeChange: (v: "ambos" | "2022" | "2024") => void;
  onClose: () => void;
}) {
  const open = !!candidato;
  const anos = anoMode === "ambos" ? [2022, 2024] : anoMode === "2022" ? [2022] : [2024];

  const { data: rows = [], isLoading } = useQuery({
    enabled: open,
    queryKey: ["candidate-breakdown", candidato?.nome_completo, candidato?.partido, anoMode],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_candidate_breakdown" as any, {
        p_nome: candidato!.nome_completo,
        p_partido: candidato!.partido || null,
        p_anos: anos,
        p_uf: null,
        p_cargo: null,
      });
      if (error) throw error;
      return (data || []) as BreakdownRow[];
    },
  });

  const fmt = (n: number) => (n || 0).toLocaleString("pt-BR");

  // Agrega por município (somando cargos/anos selecionados)
  const porMunicipio = useMemo(() => {
    const map = new Map<string, { uf: string; municipio: string; v2022: number; v2024: number; total: number; cargos: Set<string> }>();
    for (const r of rows) {
      const key = `${r.uf}|${r.municipio}`;
      const cur = map.get(key) || { uf: r.uf, municipio: r.municipio, v2022: 0, v2024: 0, total: 0, cargos: new Set<string>() };
      if (r.ano === 2022) cur.v2022 += r.votos;
      if (r.ano === 2024) cur.v2024 += r.votos;
      cur.total += r.votos;
      if (r.cargo) cur.cargos.add(r.cargo);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const totalVotos = porMunicipio.reduce((s, r) => s + r.total, 0);
  const maior = porMunicipio[0]?.total || 0;

  const exportar = () => {
    if (porMunicipio.length === 0) return;
    const sheet = porMunicipio.map((r) => ({
      UF: r.uf,
      Município: r.municipio,
      Cargos: Array.from(r.cargos).join(", "),
      "Votos 2022": r.v2022,
      "Votos 2024": r.v2024,
      Total: r.total,
      "% do total": totalVotos > 0 ? ((r.total / totalVotos) * 100).toFixed(2) + "%" : "0%",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheet);
    const nomeSafe = (candidato?.nome_completo || "candidato").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    XLSX.utils.book_append_sheet(wb, ws, "Por Município");
    XLSX.writeFile(wb, `forca_${nomeSafe}.xlsx`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            {candidato?.nome_completo}
            {candidato?.partido && <Badge variant="outline" className="ml-1">{candidato.partido}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Distribuição dos votos por município. Use para identificar redutos e regiões de fraqueza.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Período:</Label>
            <Select value={anoMode} onValueChange={(v: any) => onAnoModeChange(v)}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ambos">2022 + 2024</SelectItem>
                <SelectItem value="2022">Somente 2022</SelectItem>
                <SelectItem value="2024">Somente 2024</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            <strong>{porMunicipio.length}</strong> município(s) — Total: <strong>{fmt(totalVotos)}</strong> votos
          </div>
          <Button onClick={exportar} disabled={porMunicipio.length === 0} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" /> Excel
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Carregando detalhamento...</div>
          ) : porMunicipio.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Nenhum dado encontrado para este candidato no período.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Município</TableHead>
                  <TableHead className="w-16">UF</TableHead>
                  <TableHead className="text-right">Votos 2022</TableHead>
                  <TableHead className="text-right">Votos 2024</TableHead>
                  <TableHead className="text-right font-semibold">Total</TableHead>
                  <TableHead className="w-[180px]">Força</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {porMunicipio.map((r, i) => {
                  const pct = maior > 0 ? (r.total / maior) * 100 : 0;
                  const pctTotal = totalVotos > 0 ? (r.total / totalVotos) * 100 : 0;
                  return (
                    <TableRow key={`${r.uf}-${r.municipio}`}>
                      <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{r.municipio}</TableCell>
                      <TableCell className="text-xs">{r.uf}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.v2022 ? fmt(r.v2022) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.v2024 ? fmt(r.v2024) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmt(r.total)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{pctTotal.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
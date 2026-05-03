import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Flame, Download, MapPin, Vote } from "lucide-react";
import * as XLSX from "xlsx";

const CARGOS = [
  "Prefeito", "Vereador", "Presidente", "Governador",
  "Senador", "Deputado Federal", "Deputado Estadual", "Deputado Distrital",
];

type MunRow = {
  uf: string;
  municipio: string;
  votos_2022: number;
  votos_2024: number;
  total: number;
  candidatos: number;
  partidos: number;
};

type Periodo = "ambos" | "2022" | "2024";

export default function MapaCalorMunicipios() {
  const [uf, setUf] = useState<string>("MS");
  const [cargo, setCargo] = useState<string>("__all__");
  const [partido, setPartido] = useState<string>("__all__");
  const [periodo, setPeriodo] = useState<Periodo>("ambos");
  const [search, setSearch] = useState("");

  const { data: ufs = [] } = useQuery({
    queryKey: ["mc-ufs"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_municipios" as any);
      if (error) throw error;
      const set = new Set<string>();
      (data || []).forEach((r: any) => r.uf && set.add(r.uf));
      return Array.from(set).sort();
    },
  });

  const { data: partidos = [] } = useQuery({
    queryKey: ["mc-partidos"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_partidos" as any);
      if (error) throw error;
      return ((data || []) as any[]).map((r) => r.partido).filter(Boolean);
    },
  });

  const anos = periodo === "ambos" ? [2022, 2024] : [Number(periodo)];

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["mc-municipios", uf, cargo, partido, periodo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_votos_por_municipio" as any, {
        p_anos: anos,
        p_partido: partido === "__all__" ? null : partido,
        p_uf: uf === "__all__" ? null : uf,
        p_cargo: cargo === "__all__" ? null : cargo,
      });
      if (error) throw error;
      return (data || []) as MunRow[];
    },
  });

  const filtrados = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return rows;
    return rows.filter((r) => r.municipio.toLowerCase().includes(s) || r.uf.toLowerCase().includes(s));
  }, [rows, search]);

  const totalGeral = useMemo(() => filtrados.reduce((a, r) => a + Number(r.total || 0), 0), [filtrados]);
  const maxVotos = useMemo(() => filtrados.reduce((m, r) => Math.max(m, Number(r.total || 0)), 0), [filtrados]);

  const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");

  // Escala de cor (heatmap) — usa intensidade de hsl(var(--primary))
  const heatStyle = (votos: number): React.CSSProperties => {
    if (maxVotos <= 0) return {};
    const ratio = Math.min(1, Math.max(0, votos / maxVotos));
    // Mais votos = mais opaco
    const alpha = 0.08 + ratio * 0.55;
    return { backgroundColor: `hsl(var(--primary) / ${alpha.toFixed(3)})` };
  };

  const exportar = () => {
    const data = filtrados.map((r, i) => ({
      Posição: i + 1,
      UF: r.uf,
      Município: r.municipio,
      "Votos 2022": Number(r.votos_2022 || 0),
      "Votos 2024": Number(r.votos_2024 || 0),
      "Total votos": Number(r.total || 0),
      "% do total filtrado": totalGeral > 0 ? Number(((r.total / totalGeral) * 100).toFixed(2)) : 0,
      Candidatos: Number(r.candidatos || 0),
      Partidos: Number(r.partidos || 0),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Mapa de calor");
    const tag = [
      uf === "__all__" ? "BR" : uf,
      cargo === "__all__" ? "todos-cargos" : cargo,
      partido === "__all__" ? "todos-partidos" : partido,
      periodo,
    ].join("_");
    XLSX.writeFile(wb, `mapa-calor-${tag}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" />
            Mapa de calor por município
          </CardTitle>
          <CardDescription>
            Ranking de votos totais TSE por município. Filtre por partido, ano, UF e cargo para
            visualizar onde estão os maiores potenciais eleitorais. Quanto mais escura a célula, maior
            o volume de votos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <Label>UF</Label>
              <Select value={uf} onValueChange={setUf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {ufs.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cargo</Label>
              <Select value={cargo} onValueChange={setCargo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {CARGOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Partido</Label>
              <Select value={partido} onValueChange={setPartido}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__all__">Todos</SelectItem>
                  {partidos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Período</Label>
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ambos">2022 + 2024</SelectItem>
                  <SelectItem value="2022">Somente 2022</SelectItem>
                  <SelectItem value="2024">Somente 2024</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Buscar município</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: Campo Grande" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Municípios
                </div>
                <div className="text-2xl font-bold">{fmt(filtrados.length)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Vote className="h-3 w-3" /> Votos totais
                </div>
                <div className="text-2xl font-bold">{fmt(totalGeral)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Maior município</div>
                <div className="text-lg font-bold truncate">
                  {filtrados[0] ? `${filtrados[0].municipio}/${filtrados[0].uf}` : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {filtrados[0] ? `${fmt(filtrados[0].total)} votos` : ""}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Exportar</div>
                  <div className="text-sm">Planilha Excel</div>
                </div>
                <Button size="sm" variant="outline" onClick={exportar} disabled={!filtrados.length}>
                  <Download className="h-4 w-4 mr-1" /> XLSX
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ranking de municípios</CardTitle>
          <CardDescription>
            {isLoading ? "Carregando…" : `${fmt(filtrados.length)} municípios — intensidade da cor proporcional aos votos.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-[640px] overflow-y-auto border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Município</TableHead>
                  <TableHead className="w-16">UF</TableHead>
                  <TableHead className="text-right">Votos 2022</TableHead>
                  <TableHead className="text-right">Votos 2024</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">% filtro</TableHead>
                  <TableHead className="text-right">Candidatos</TableHead>
                  <TableHead className="text-right">Partidos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Nenhum município encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                )}
                {filtrados.map((r, i) => {
                  const pct = totalGeral > 0 ? (r.total / totalGeral) * 100 : 0;
                  return (
                    <TableRow key={`${r.uf}-${r.municipio}`} style={heatStyle(Number(r.total || 0))}>
                      <TableCell className="font-mono text-xs">{i + 1}</TableCell>
                      <TableCell className="font-medium">{r.municipio}</TableCell>
                      <TableCell><Badge variant="outline">{r.uf}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.votos_2022)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.votos_2024)}</TableCell>
                      <TableCell className="text-right tabular-nums font-bold">{fmt(r.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                        {pct.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.candidatos)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.partidos)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
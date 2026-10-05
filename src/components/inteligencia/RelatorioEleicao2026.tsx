/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Loader2, MapPin, Trophy, Users, Vote } from "lucide-react";
import * as XLSX from "xlsx";

type RankingRow = {
  numero: number;
  nome_urna: string | null;
  nome_completo: string | null;
  partido: string | null;
  situacao: string | null;
  votos: number;
  municipios: number;
  zonas: number;
};

type GeographyRow = {
  numero: number;
  nome_urna: string | null;
  partido: string | null;
  cod_municipio: number;
  municipio: string;
  zona: number;
  votos: number;
};

const CARGOS = ["Deputado Federal", "Deputado Estadual", "Governador", "Senador", "Presidente"];
const COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626"];
const CAMPO_GRANDE_TSE = 90514;
const fmt = (value: number) => Number(value || 0).toLocaleString("pt-BR");
const candidateKey = (numero: number) => `cand_${numero}`;

export default function RelatorioEleicao2026() {
  const [cargo, setCargo] = useState("Deputado Federal");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);

  const {
    data: ranking = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["tse-2026-ranking", cargo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_candidate_ranking" as any, {
        p_ano: 2026,
        p_uf: "MS",
        p_cargo: cargo,
        p_municipio: null,
      });
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({
        ...row,
        numero: Number(row.numero),
        votos: Number(row.votos || 0),
        municipios: Number(row.municipios || 0),
        zonas: Number(row.zonas || 0),
      })) as RankingRow[];
    },
  });

  useEffect(() => {
    setSelected([]);
  }, [cargo]);

  useEffect(() => {
    if (ranking.length > 0 && selected.length === 0) {
      setSelected(ranking.slice(0, 2).map((row) => row.numero));
    }
  }, [ranking, selected.length]);

  const { data: geography = [], isLoading: loadingGeography } = useQuery({
    queryKey: ["tse-2026-geography", cargo, selected],
    enabled: selected.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_candidate_geography" as any, {
        p_ano: 2026,
        p_uf: "MS",
        p_cargo: cargo,
        p_numeros: selected,
        p_municipio: null,
      });
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({
        ...row,
        numero: Number(row.numero),
        cod_municipio: Number(row.cod_municipio),
        zona: Number(row.zona),
        votos: Number(row.votos || 0),
      })) as GeographyRow[];
    },
  });

  const filteredRanking = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return ranking;
    return ranking.filter((row) =>
      `${row.nome_urna || ""} ${row.nome_completo || ""} ${row.partido || ""} ${row.numero}`
        .toLocaleLowerCase("pt-BR")
        .includes(query),
    );
  }, [ranking, search]);

  const selectedRanking = useMemo(
    () =>
      selected
        .map((number) => ranking.find((row) => row.numero === number))
        .filter(Boolean) as RankingRow[],
    [ranking, selected],
  );

  const municipalityRows = useMemo(() => {
    const map = new Map<string, Record<string, string | number>>();
    for (const row of geography) {
      const current = map.get(row.municipio) || { municipio: row.municipio, total: 0 };
      const key = candidateKey(row.numero);
      current[key] = Number(current[key] || 0) + row.votos;
      current.total = Number(current.total || 0) + row.votos;
      map.set(row.municipio, current);
    }
    return Array.from(map.values()).sort((a, b) => Number(b.total) - Number(a.total));
  }, [geography]);

  const zoneRows = useMemo(() => {
    const map = new Map<number, Record<string, number>>();
    for (const row of geography.filter((item) => item.cod_municipio === CAMPO_GRANDE_TSE)) {
      const current = map.get(row.zona) || { zona: row.zona, total: 0 };
      const key = candidateKey(row.numero);
      current[key] = Number(current[key] || 0) + row.votos;
      current.total += row.votos;
      map.set(row.zona, current);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [geography]);

  const summaries = useMemo(
    () =>
      selectedRanking.map((candidate) => {
        const rows = geography.filter((row) => row.numero === candidate.numero);
        const capital = rows
          .filter((row) => row.cod_municipio === CAMPO_GRANDE_TSE)
          .reduce((sum, row) => sum + row.votos, 0);
        const total = rows.reduce((sum, row) => sum + row.votos, 0);
        const top = municipalityRows
          .map((row) => ({
            municipio: String(row.municipio),
            votos: Number(row[candidateKey(candidate.numero)] || 0),
          }))
          .sort((a, b) => b.votos - a.votos)[0];
        return { candidate, total, capital, interior: total - capital, top };
      }),
    [selectedRanking, geography, municipalityRows],
  );

  const toggleCandidate = (numero: number) => {
    setSelected((current) => {
      if (current.includes(numero)) return current.filter((item) => item !== numero);
      if (current.length >= 4) return current;
      return [...current, numero];
    });
  };

  const exportReport = () => {
    const workbook = XLSX.utils.book_new();
    const summaryData = summaries.map(({ candidate, total, capital, interior, top }) => ({
      Cargo: cargo,
      Numero: candidate.numero,
      Candidato: candidate.nome_urna,
      Partido: candidate.partido,
      "Votos MS": total,
      "Votos Campo Grande": capital,
      "% Campo Grande": total ? Number(((capital / total) * 100).toFixed(2)) : 0,
      "Votos Interior": interior,
      "Cidade mais forte": top?.municipio || "",
      "Votos na cidade mais forte": top?.votos || 0,
    }));
    const municipalityData = municipalityRows.map((row) => {
      const output: Record<string, string | number> = { Municipio: row.municipio };
      selectedRanking.forEach((candidate) => {
        output[`#${candidate.numero} ${candidate.nome_urna}`] = Number(
          row[candidateKey(candidate.numero)] || 0,
        );
      });
      output.Total = Number(row.total || 0);
      return output;
    });
    const zoneData = zoneRows.map((row) => {
      const output: Record<string, string | number> = { Zona: row.zona };
      selectedRanking.forEach((candidate) => {
        output[`#${candidate.numero} ${candidate.nome_urna}`] = Number(
          row[candidateKey(candidate.numero)] || 0,
        );
      });
      output.Total = Number(row.total || 0);
      return output;
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryData), "Resumo");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(municipalityData),
      "Municipios",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(zoneData),
      "Zonas Campo Grande",
    );
    XLSX.writeFile(workbook, `relatorio-tse-2026-${cargo.toLowerCase().replace(/\s+/g, "-")}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Vote className="w-5 h-5 text-primary" /> Relatório oficial TSE 2026 — Mato Grosso
                do Sul
              </CardTitle>
              <CardDescription className="mt-1">
                Compare candidatos, identifique as cidades mais fortes e analise Campo Grande por
                zona eleitoral.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={exportReport} disabled={geography.length === 0}>
              <Download className="w-4 h-4 mr-2" /> Exportar relatório XLSX
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-[240px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <Select value={cargo} onValueChange={setCargo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARGOS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Buscar candidato, número ou partido</Label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ex.: 1234, nome ou partido"
              />
            </div>
          </div>

          {isLoading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando resultados oficiais...
            </div>
          )}
          {error && (
            <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Não foi possível carregar o relatório: {(error as Error).message}
            </div>
          )}
          {!isLoading && !error && ranking.length === 0 && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Ainda não há dados de 2026 no banco. No Super Admin, execute “Sincronizar API oficial
              TSE 2026”.
            </div>
          )}

          {ranking.length > 0 && (
            <div className="grid lg:grid-cols-[390px_1fr] gap-4">
              <div className="rounded-lg border overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-xs text-muted-foreground">
                  Selecione até 4 candidatos · {selected.length}/4 selecionados
                </div>
                <div className="max-h-[430px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>Candidato</TableHead>
                        <TableHead className="text-right">Votos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRanking.map((row, index) => {
                        const active = selected.includes(row.numero);
                        return (
                          <TableRow
                            key={row.numero}
                            className={active ? "bg-primary/10" : "cursor-pointer"}
                            onClick={() => toggleCandidate(row.numero)}
                          >
                            <TableCell>
                              <div className="font-medium">
                                {index + 1}º · {row.nome_urna || row.nome_completo}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                #{row.numero} · {row.partido || "—"} · {row.municipios} municípios
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {fmt(row.votos)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="space-y-3">
                {loadingGeography ? (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Calculando distribuição
                    territorial...
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {summaries.map(({ candidate, total, capital, interior, top }, index) => (
                      <Card key={candidate.numero} style={{ borderColor: COLORS[index] }}>
                        <CardHeader className="pb-2">
                          <CardDescription>
                            #{candidate.numero} · {candidate.partido}
                          </CardDescription>
                          <CardTitle className="text-lg">{candidate.nome_urna}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">MS</span>
                            <div className="font-bold text-lg">{fmt(total)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Campo Grande</span>
                            <div className="font-semibold">
                              {fmt(capital)}{" "}
                              <span className="text-xs">
                                ({total ? ((capital / total) * 100).toFixed(1) : "0"}%)
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Interior</span>
                            <div className="font-semibold">{fmt(interior)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cidade mais forte</span>
                            <div className="font-semibold truncate" title={top?.municipio}>
                              {top?.municipio || "—"}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {municipalityRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Comparativo por município
            </CardTitle>
            <CardDescription>
              As 15 cidades com maior votação combinada entre os candidatos selecionados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={municipalityRows.slice(0, 15)} margin={{ bottom: 90 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="municipio"
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                    height={100}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis />
                  <Tooltip formatter={(value) => fmt(Number(value))} />
                  <Legend />
                  {selectedRanking.map((candidate, index) => (
                    <Bar
                      key={candidate.numero}
                      dataKey={candidateKey(candidate.numero)}
                      name={`#${candidate.numero} ${candidate.nome_urna}`}
                      fill={COLORS[index]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="max-h-[420px] overflow-auto rounded border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Pos.</TableHead>
                    <TableHead>Município</TableHead>
                    {selectedRanking.map((candidate) => (
                      <TableHead key={candidate.numero} className="text-right">
                        #{candidate.numero}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {municipalityRows.map((row, index) => (
                    <TableRow key={String(row.municipio)}>
                      <TableCell>{index + 1}º</TableCell>
                      <TableCell className="font-medium">{row.municipio}</TableCell>
                      {selectedRanking.map((candidate) => (
                        <TableCell key={candidate.numero} className="text-right tabular-nums">
                          {fmt(Number(row[candidateKey(candidate.numero)] || 0))}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmt(Number(row.total))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {zoneRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Campo Grande por zona eleitoral
            </CardTitle>
            <CardDescription>
              Força territorial dentro da capital. O detalhamento por escola/bairro será enriquecido
              com o arquivo do TRE.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zona</TableHead>
                    {selectedRanking.map((candidate) => (
                      <TableHead key={candidate.numero} className="text-right">
                        {candidate.nome_urna}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zoneRows.map((row) => (
                    <TableRow key={row.zona}>
                      <TableCell>
                        <Badge variant="outline">Zona {row.zona}</Badge>
                      </TableCell>
                      {selectedRanking.map((candidate) => (
                        <TableCell key={candidate.numero} className="text-right tabular-nums">
                          {fmt(Number(row[candidateKey(candidate.numero)] || 0))}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmt(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {ranking.length > 0 && selected.length === 0 && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Trophy className="w-4 h-4" /> Selecione candidatos no ranking para montar o comparativo.
        </div>
      )}
    </div>
  );
}

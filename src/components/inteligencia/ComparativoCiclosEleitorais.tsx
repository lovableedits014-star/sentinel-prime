/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Cargo = "Deputado Federal" | "Deputado Estadual";
type RankingRow = {
  numero: number;
  nome_urna: string | null;
  nome_completo: string | null;
  partido: string | null;
  votos: number;
  municipios: number;
  zonas: number;
};
type GeographyRow = {
  cod_municipio: number;
  municipio: string;
  zona: number;
  votos: number;
};
type CityComparison = {
  cod_municipio: number;
  municipio: string;
  votos2022: number;
  votos2026: number;
  diferenca: number;
  variacao: number | null;
};

const PAGE_SIZE = 1000;
const CARGOS: Cargo[] = ["Deputado Federal", "Deputado Estadual"];
const fmt = (value: number) => Number(value || 0).toLocaleString("pt-BR");
const percent = (value: number | null) =>
  value === null
    ? "—"
    : `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const candidateName = (candidate: RankingRow | null) =>
  candidate?.nome_urna || candidate?.nome_completo || "Candidato não selecionado";
const normalize = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

async function loadRanking(year: 2022 | 2026, cargo: Cargo) {
  const { data, error } = await supabase.rpc("get_tse_candidate_ranking" as any, {
    p_ano: year,
    p_uf: "MS",
    p_cargo: cargo,
    p_municipio: null,
  });
  if (error) throw error;
  return ((data || []) as any[]).map((row) => ({
    numero: Number(row.numero),
    nome_urna: row.nome_urna,
    nome_completo: row.nome_completo,
    partido: row.partido,
    votos: Number(row.votos || 0),
    municipios: Number(row.municipios || 0),
    zonas: Number(row.zonas || 0),
  })) as RankingRow[];
}

async function loadGeography(year: 2022 | 2026, cargo: Cargo, numero: number) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc("get_tse_candidate_geography" as any, {
        p_ano: year,
        p_uf: "MS",
        p_cargo: cargo,
        p_numeros: [numero],
        p_municipio: null,
      })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data || []) as any[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.map((row) => ({
    cod_municipio: Number(row.cod_municipio),
    municipio: String(row.municipio),
    zona: Number(row.zona),
    votos: Number(row.votos || 0),
  })) as GeographyRow[];
}

function CandidatePicker({
  year,
  rows,
  selected,
  onSelect,
  loading,
}: {
  year: 2022 | 2026;
  rows: RankingRow[];
  selected: number | null;
  onSelect: (numero: number) => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const term = normalize(search);
    return rows
      .filter((row) =>
        !term
          ? true
          : normalize(
              `${row.numero} ${row.nome_urna} ${row.nome_completo} ${row.partido}`,
            ).includes(term),
      )
      .slice(0, 40);
  }, [rows, search]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Candidato em {year}</CardTitle>
          <Badge variant={year === 2026 ? "default" : "secondary"}>{year}</Badge>
        </div>
        <CardDescription>Pesquise por nome, número ou partido.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ex.: 15111 ou nome"
          />
        </div>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando candidatos...
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
            Não há dados para este cargo em {year}.
          </p>
        ) : (
          <div className="max-h-64 overflow-auto rounded-md border">
            {filtered.map((row) => (
              <button
                key={row.numero}
                type="button"
                onClick={() => onSelect(row.numero)}
                className={`flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/60 ${selected === row.numero ? "bg-primary/10" : ""}`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-medium">
                    {selected === row.numero && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    )}
                    <span className="truncate">{candidateName(row)}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    #{row.numero} · {row.partido || "sem partido"}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{fmt(row.votos)}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">Nenhum candidato encontrado.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </CardHeader>
    </Card>
  );
}

export default function ComparativoCiclosEleitorais() {
  const [cargo, setCargo] = useState<Cargo>("Deputado Estadual");
  const [selected2022, setSelected2022] = useState<number | null>(null);
  const [selected2026, setSelected2026] = useState<number | null>(null);

  useEffect(() => {
    setSelected2022(null);
    setSelected2026(null);
  }, [cargo]);

  const ranking2022 = useQuery({
    queryKey: ["tse-cycle-ranking", 2022, cargo],
    queryFn: () => loadRanking(2022, cargo),
  });
  const ranking2026 = useQuery({
    queryKey: ["tse-cycle-ranking", 2026, cargo],
    queryFn: () => loadRanking(2026, cargo),
  });
  const geography2022 = useQuery({
    queryKey: ["tse-cycle-geography", 2022, cargo, selected2022],
    enabled: selected2022 !== null,
    queryFn: () => loadGeography(2022, cargo, selected2022!),
  });
  const geography2026 = useQuery({
    queryKey: ["tse-cycle-geography", 2026, cargo, selected2026],
    enabled: selected2026 !== null,
    queryFn: () => loadGeography(2026, cargo, selected2026!),
  });

  const candidate2022 = ranking2022.data?.find((row) => row.numero === selected2022) || null;
  const candidate2026 = ranking2026.data?.find((row) => row.numero === selected2026) || null;
  const possibleMatch = useMemo(() => {
    if (!candidate2026 || candidate2022) return null;
    const currentName = normalize(candidate2026.nome_completo || candidate2026.nome_urna);
    return (
      ranking2022.data?.find(
        (row) => normalize(row.nome_completo || row.nome_urna) === currentName,
      ) || null
    );
  }, [candidate2022, candidate2026, ranking2022.data]);

  const cities = useMemo(() => {
    const map = new Map<number, CityComparison>();
    const add = (row: GeographyRow, year: 2022 | 2026) => {
      const current = map.get(row.cod_municipio) || {
        cod_municipio: row.cod_municipio,
        municipio: row.municipio,
        votos2022: 0,
        votos2026: 0,
        diferenca: 0,
        variacao: null,
      };
      if (year === 2022) current.votos2022 += row.votos;
      else current.votos2026 += row.votos;
      map.set(row.cod_municipio, current);
    };
    (geography2022.data || []).forEach((row) => add(row, 2022));
    (geography2026.data || []).forEach((row) => add(row, 2026));
    return Array.from(map.values())
      .map((row) => ({
        ...row,
        diferenca: row.votos2026 - row.votos2022,
        variacao:
          row.votos2022 > 0 ? ((row.votos2026 - row.votos2022) / row.votos2022) * 100 : null,
      }))
      .sort((a, b) => Math.max(b.votos2022, b.votos2026) - Math.max(a.votos2022, a.votos2026));
  }, [geography2022.data, geography2026.data]);

  const variation =
    candidate2022 && candidate2026 && candidate2022.votos > 0
      ? ((candidate2026.votos - candidate2022.votos) / candidate2022.votos) * 100
      : null;
  const error =
    ranking2022.error || ranking2026.error || geography2022.error || geography2026.error;
  const loadingGeography = geography2022.isFetching || geography2026.isFetching;

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          Cargo: cargo,
          "Candidato 2022": candidateName(candidate2022),
          "Número 2022": candidate2022?.numero || "",
          "Votos 2022": candidate2022?.votos || 0,
          "Candidato 2026": candidateName(candidate2026),
          "Número 2026": candidate2026?.numero || "",
          "Votos 2026": candidate2026?.votos || 0,
          "Variação %": variation,
        },
      ]),
      "Resumo",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        cities.map((row) => ({
          Município: row.municipio,
          "Votos 2022": row.votos2022,
          "Votos 2026": row.votos2026,
          Diferença: row.diferenca,
          "Variação %": row.variacao,
        })),
      ),
      "Municípios",
    );
    XLSX.writeFile(
      workbook,
      `comparativo-ms-2022-2026-${cargo.toLocaleLowerCase().replaceAll(" ", "-")}.xlsx`,
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cargo comparado</CardTitle>
          <CardDescription>Somente ciclos equivalentes entram na comparação.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {CARGOS.map((item) => (
            <Button
              key={item}
              variant={cargo === item ? "default" : "outline"}
              onClick={() => setCargo(item)}
            >
              {item}
            </Button>
          ))}
        </CardContent>
      </Card>

      {error && (
        <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Falha técnica ao consultar o TSE: {(error as Error).message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <CandidatePicker
          year={2022}
          rows={ranking2022.data || []}
          selected={selected2022}
          onSelect={setSelected2022}
          loading={ranking2022.isLoading}
        />
        <CandidatePicker
          year={2026}
          rows={ranking2026.data || []}
          selected={selected2026}
          onSelect={setSelected2026}
          loading={ranking2026.isLoading}
        />
      </div>

      {possibleMatch && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
          <span>
            Encontramos possível correspondência em 2022:{" "}
            <strong>
              {candidateName(possibleMatch)} #{possibleMatch.numero}
            </strong>
            .
          </span>
          <Button size="sm" variant="outline" onClick={() => setSelected2022(possibleMatch.numero)}>
            Usar correspondência
          </Button>
        </div>
      )}

      {(candidate2022 || candidate2026) && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Votos em 2022"
              value={candidate2022 ? fmt(candidate2022.votos) : "Não selecionado"}
              detail={candidateName(candidate2022)}
            />
            <Metric
              label="Votos em 2026"
              value={candidate2026 ? fmt(candidate2026.votos) : "Não selecionado"}
              detail={candidateName(candidate2026)}
            />
            <Metric
              label="Diferença de votos"
              value={
                candidate2022 && candidate2026
                  ? fmt(candidate2026.votos - candidate2022.votos)
                  : "—"
              }
            />
            <Metric
              label="Variação 2022 → 2026"
              value={percent(variation)}
              detail="Calculada somente quando os dois candidatos estão selecionados."
            />
          </div>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Comparação por município</CardTitle>
                <CardDescription>
                  Votos do candidato escolhido em cada ciclo, sem misturar a eleição municipal de
                  2024.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={exportExcel}
                disabled={cities.length === 0 || loadingGeography}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar Excel
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loadingGeography ? (
                <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Consolidando municípios...
                </p>
              ) : cities.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">
                  Selecione pelo menos um candidato para visualizar os municípios.
                </p>
              ) : (
                <div className="max-h-[560px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead>Município</TableHead>
                        <TableHead className="text-right">2022</TableHead>
                        <TableHead className="text-right">2026</TableHead>
                        <TableHead className="text-right">Diferença</TableHead>
                        <TableHead className="text-right">Variação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cities.map((row) => (
                        <TableRow key={row.cod_municipio}>
                          <TableCell className="font-medium">{row.municipio}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt(row.votos2022)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt(row.votos2026)}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${row.diferenca > 0 ? "text-emerald-600" : row.diferenca < 0 ? "text-destructive" : ""}`}
                          >
                            {row.diferenca > 0 ? "+" : ""}
                            {fmt(row.diferenca)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {percent(row.variacao)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

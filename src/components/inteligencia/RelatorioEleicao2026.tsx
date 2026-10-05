/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  MapPin,
  Search,
  Vote,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

type Municipality = { cod_municipio: number; municipio: string };
type RankingRow = {
  numero: number;
  nome_urna: string | null;
  nome_completo: string | null;
  partido: string | null;
  situacao: string | null;
  votos: number;
};
type SectionRow = {
  zona: number;
  secao: number;
  secoes_agregadas: number[];
  nr_local: number;
  nome_local: string | null;
  endereco: string | null;
  bairro: string | null;
  votos: number;
  percentual: number;
};
type SyncStatus = {
  status: "pending" | "running" | "partial" | "success" | "error";
  total_secoes: number;
  secoes_principais: number;
  secoes_processadas: number;
  erro: string | null;
};
type RegionRow = { nome: string; votos: number; secoes: number; percentual: number };
type ReportScope = "city" | "state";
type GeographyRow = {
  numero: number;
  cod_municipio: number;
  municipio: string;
  zona: number;
  votos: number;
};
type CityRow = {
  cod_municipio: number;
  municipio: string;
  votos: number;
  zonas: number;
  percentual: number;
};

const CARGOS = ["Deputado Federal", "Deputado Estadual"] as const;
const SECTION_PAGE_SIZE = 1000;
const fmt = (value: number) => Number(value || 0).toLocaleString("pt-BR");
const pct = (value: number) =>
  `${Number(value || 0)
    .toFixed(1)
    .replace(".", ",")}%`;
const safeFileName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

export default function RelatorioEleicao2026() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<ReportScope>("city");
  const [cargo, setCargo] = useState<(typeof CARGOS)[number]>("Deputado Federal");
  const [municipalityCode, setMunicipalityCode] = useState(90514);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [sectionSearch, setSectionSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ processed: 0, total: 0 });
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncGuard = useRef(false);

  const { data: municipalities = [] } = useQuery({
    queryKey: ["tse-2026-municipalities-ms"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_municipality_options" as any, {
        p_ano: 2026,
        p_uf: "MS",
      });
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({
        cod_municipio: Number(row.cod_municipio),
        municipio: String(row.municipio),
      })) as Municipality[];
    },
  });
  const municipality = municipalities.find((item) => item.cod_municipio === municipalityCode) || {
    cod_municipio: municipalityCode,
    municipio: municipalityCode === 90514 ? "CAMPO GRANDE" : "",
  };

  const {
    data: ranking = [],
    isLoading: loadingRanking,
    error: rankingError,
  } = useQuery({
    queryKey: ["tse-2026-ranking", scope, cargo, municipality.municipio],
    enabled: scope === "state" || Boolean(municipality.municipio),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_candidate_ranking" as any, {
        p_ano: 2026,
        p_uf: "MS",
        p_cargo: cargo,
        p_municipio: scope === "city" ? municipality.municipio : null,
      });
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({
        ...row,
        numero: Number(row.numero),
        votos: Number(row.votos || 0),
      })) as RankingRow[];
    },
  });

  const { data: syncStatus = null, refetch: refetchStatus } = useQuery({
    queryKey: ["tse-section-sync-status", municipalityCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tse_secao_sync_status" as any)
        .select("status,total_secoes,secoes_principais,secoes_processadas,erro")
        .eq("ano", 2026)
        .eq("turno", 1)
        .eq("uf", "MS")
        .eq("cod_municipio", municipalityCode)
        .maybeSingle();
      if (error) throw error;
      return data
        ? ({
            ...data,
            total_secoes: Number((data as any).total_secoes || 0),
            secoes_principais: Number((data as any).secoes_principais || 0),
            secoes_processadas: Number((data as any).secoes_processadas || 0),
          } as SyncStatus)
        : null;
    },
  });

  const {
    data: sections = [],
    isLoading: loadingSections,
    refetch: refetchSections,
  } = useQuery({
    queryKey: ["tse-candidate-sections", municipalityCode, cargo, selected],
    enabled: scope === "city" && selected !== null && syncStatus?.status === "success",
    queryFn: async () => {
      const allRows: any[] = [];
      for (let from = 0; ; from += SECTION_PAGE_SIZE) {
        const { data, error } = await supabase
          .rpc("get_tse_candidate_sections" as any, {
            p_ano: 2026,
            p_uf: "MS",
            p_cod_municipio: municipalityCode,
            p_cargo: cargo,
            p_numero: selected,
          })
          .range(from, from + SECTION_PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data || []) as any[];
        allRows.push(...page);
        if (page.length < SECTION_PAGE_SIZE) break;
      }
      return allRows.map((row) => ({
        ...row,
        zona: Number(row.zona),
        secao: Number(row.secao),
        nr_local: Number(row.nr_local),
        votos: Number(row.votos || 0),
        percentual: Number(row.percentual || 0),
        secoes_agregadas: Array.isArray(row.secoes_agregadas)
          ? row.secoes_agregadas.map(Number)
          : [],
      })) as SectionRow[];
    },
  });

  const {
    data: geography = [],
    isLoading: loadingGeography,
    error: geographyError,
  } = useQuery({
    queryKey: ["tse-candidate-geography-state", cargo, selected],
    enabled: scope === "state" && selected !== null,
    queryFn: async () => {
      const allRows: any[] = [];
      for (let from = 0; ; from += SECTION_PAGE_SIZE) {
        const { data, error } = await supabase
          .rpc("get_tse_candidate_geography" as any, {
            p_ano: 2026,
            p_uf: "MS",
            p_cargo: cargo,
            p_numeros: [selected],
            p_municipio: null,
          })
          .range(from, from + SECTION_PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data || []) as any[];
        allRows.push(...page);
        if (page.length < SECTION_PAGE_SIZE) break;
      }
      return allRows.map((row) => ({
        numero: Number(row.numero),
        cod_municipio: Number(row.cod_municipio),
        municipio: String(row.municipio),
        zona: Number(row.zona),
        votos: Number(row.votos || 0),
      })) as GeographyRow[];
    },
  });

  useEffect(() => {
    setSelected(null);
    setCandidateSearch("");
    setSectionSearch("");
    setSyncError(null);
  }, [scope, cargo, municipalityCode]);

  const candidate = ranking.find((row) => row.numero === selected) || null;
  const filteredRanking = useMemo(() => {
    const term = candidateSearch.trim().toLocaleLowerCase("pt-BR");
    return ranking
      .filter(
        (row) =>
          !term ||
          `${row.nome_urna || ""} ${row.nome_completo || ""} ${row.partido || ""} ${row.numero}`
            .toLocaleLowerCase("pt-BR")
            .includes(term),
      )
      .slice(0, term ? 100 : 30);
  }, [candidateSearch, ranking]);
  const filteredSections = useMemo(() => {
    const term = sectionSearch.trim().toLocaleLowerCase("pt-BR");
    return sections.filter(
      (row) =>
        !term ||
        `${row.zona} ${row.secao} ${row.nr_local} ${row.nome_local || ""} ${row.bairro || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(term),
    );
  }, [sectionSearch, sections]);
  const totalSectionVotes = sections.reduce((sum, row) => sum + row.votos, 0);
  const totalsMatch = Boolean(
    candidate && syncStatus?.status === "success" && totalSectionVotes === candidate.votos,
  );
  const regions = useMemo<RegionRow[]>(() => {
    const grouped = new Map<string, { votos: number; secoes: number }>();
    sections.forEach((row) => {
      const name = row.bairro?.trim() || `Zona ${row.zona} · bairro não identificado`;
      const current = grouped.get(name) || { votos: 0, secoes: 0 };
      current.votos += row.votos;
      current.secoes += 1;
      grouped.set(name, current);
    });
    return Array.from(grouped, ([nome, value]) => ({
      nome,
      ...value,
      percentual: totalSectionVotes ? (value.votos / totalSectionVotes) * 100 : 0,
    })).sort((a, b) => b.votos - a.votos);
  }, [sections, totalSectionVotes]);
  const cityRows = useMemo<CityRow[]>(() => {
    const grouped = new Map<
      number,
      { cod_municipio: number; municipio: string; votos: number; zonas: Set<number> }
    >();
    geography.forEach((row) => {
      const current = grouped.get(row.cod_municipio) || {
        cod_municipio: row.cod_municipio,
        municipio: row.municipio,
        votos: 0,
        zonas: new Set<number>(),
      };
      current.votos += row.votos;
      current.zonas.add(row.zona);
      grouped.set(row.cod_municipio, current);
    });
    return Array.from(grouped.values())
      .map((row) => ({
        cod_municipio: row.cod_municipio,
        municipio: row.municipio,
        votos: row.votos,
        zonas: row.zonas.size,
        percentual: candidate?.votos ? (row.votos / candidate.votos) * 100 : 0,
      }))
      .sort((a, b) => b.votos - a.votos);
  }, [candidate?.votos, geography]);
  const totalCityVotes = cityRows.reduce((sum, row) => sum + row.votos, 0);
  const stateTotalsMatch = Boolean(candidate && totalCityVotes === candidate.votos);
  const canExport = scope === "city" ? totalsMatch : stateTotalsMatch;

  const syncSections = async () => {
    if (syncGuard.current) return;
    syncGuard.current = true;
    setSyncing(true);
    setSyncError(null);
    try {
      for (let batch = 0; batch < 100; batch++) {
        const { data, error } = await supabase.functions.invoke("sync-tse-sections", {
          body: { uf: "MS", cod_municipio: municipalityCode, batch_size: 80 },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setSyncProgress({ processed: Number(data.processed || 0), total: Number(data.total || 0) });
        if (data.complete) break;
      }
      await refetchStatus();
      await queryClient.invalidateQueries({
        queryKey: ["tse-candidate-sections", municipalityCode],
      });
      await refetchSections();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
      await refetchStatus();
    } finally {
      syncGuard.current = false;
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (
      scope === "city" &&
      selected !== null &&
      syncStatus?.status !== "success" &&
      !syncing &&
      !syncError
    ) {
      void syncSections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, selected, syncStatus?.status]);

  const exportXlsx = () => {
    if (!candidate || !canExport) return;
    const workbook = XLSX.utils.book_new();
    if (scope === "state") {
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet([
          {
            Ano: 2026,
            UF: "MS",
            Cargo: cargo,
            Número: candidate.numero,
            Candidato: candidate.nome_urna || candidate.nome_completo,
            Partido: candidate.partido,
            "Votos oficiais em MS": candidate.votos,
            "Votos somados nos municípios": totalCityVotes,
            Municípios: cityRows.length,
            Conferência: "TOTAL CONFERIDO",
          },
        ]),
        "Resumo",
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          cityRows.map((row, index) => ({
            Posição: index + 1,
            "Código do município": row.cod_municipio,
            Município: row.municipio,
            Zonas: row.zonas,
            Votos: row.votos,
            "% do candidato em MS": Number(row.percentual.toFixed(2)),
          })),
        ),
        "Votos por cidade",
      );
      XLSX.writeFile(
        workbook,
        `ms-2026-${safeFileName(cargo)}-${candidate.numero}-por-cidade.xlsx`,
      );
      return;
    }
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          Ano: 2026,
          Município: `${municipality.municipio}/MS`,
          Cargo: cargo,
          Número: candidate.numero,
          Candidato: candidate.nome_urna || candidate.nome_completo,
          Partido: candidate.partido,
          "Votos oficiais": candidate.votos,
          "Votos somados nas seções": totalSectionVotes,
          Conferência: "TOTAL CONFERIDO",
        },
      ]),
      "Resumo",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        sections.map((row) => ({
          Zona: row.zona,
          Seção: row.secao,
          "Seções agregadas pelo TSE": row.secoes_agregadas.join(", "),
          "Local nº": row.nr_local,
          Local: row.nome_local,
          Endereço: row.endereco,
          "Bairro/região": row.bairro,
          Votos: row.votos,
          "% do candidato": row.percentual,
        })),
      ),
      "Votos por seção",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        regions.map((row, index) => ({
          Posição: index + 1,
          "Bairro/região": row.nome,
          Seções: row.secoes,
          Votos: row.votos,
          "% do candidato": Number(row.percentual.toFixed(2)),
        })),
      ),
      "Resumo por região",
    );
    XLSX.writeFile(
      workbook,
      `${safeFileName(municipality.municipio)}-2026-${safeFileName(cargo)}-${candidate.numero}-por-secao.xlsx`,
    );
  };

  const exportPdf = () => {
    if (!candidate || !canExport) return;
    const doc = new jsPDF();
    const name = candidate.nome_urna || candidate.nome_completo || `#${candidate.numero}`;
    if (scope === "state") {
      doc.setFontSize(17);
      doc.text("Votação por cidade — Mato Grosso do Sul", 14, 18);
      doc.setFontSize(11);
      doc.text(`Eleições 2026 · ${cargo} · ${name} · #${candidate.numero}`, 14, 27);
      doc.text(`Total oficial conferido: ${fmt(totalCityVotes)} votos`, 14, 35);
      autoTable(doc, {
        startY: 44,
        head: [["Pos.", "Cidade", "Zonas", "Votos", "%"]],
        body: cityRows.map((row, index) => [
          `${index + 1}º`,
          row.municipio,
          fmt(row.zonas),
          fmt(row.votos),
          pct(row.percentual),
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235] },
      });
      doc.save(`ms-2026-${safeFileName(cargo)}-${candidate.numero}-por-cidade.pdf`);
      return;
    }
    doc.setFontSize(17);
    doc.text(`Votação por seção — ${municipality.municipio}/MS`, 14, 18);
    doc.setFontSize(11);
    doc.text(`Eleições 2026 · ${cargo} · ${name} · #${candidate.numero}`, 14, 27);
    doc.text(`Total oficial conferido: ${fmt(totalSectionVotes)} votos`, 14, 35);
    autoTable(doc, {
      startY: 44,
      head: [["Pos.", "Bairro/região", "Seções", "Votos", "%"]],
      body: regions.map((row, index) => [
        `${index + 1}º`,
        row.nome,
        fmt(row.secoes),
        fmt(row.votos),
        pct(row.percentual),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    const finalY = (doc as any).lastAutoTable?.finalY || 70;
    autoTable(doc, {
      startY: finalY + 8,
      head: [["Zona", "Seção", "Local", "Bairro/região", "Votos"]],
      body: sections.map((row) => [
        row.zona,
        row.secoes_agregadas.length
          ? `${row.secao} + ${row.secoes_agregadas.join(", ")}`
          : row.secao,
        row.nome_local || `Local ${row.nr_local}`,
        row.bairro || "Não identificado",
        fmt(row.votos),
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [15, 118, 110] },
    });
    doc.save(
      `${safeFileName(municipality.municipio)}-2026-${safeFileName(cargo)}-${candidate.numero}-por-secao.pdf`,
    );
  };

  return (
    <div className="space-y-5">
      <Card className="border-primary/40 shadow-sm overflow-hidden">
        <div className="h-1 bg-primary" />
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <Badge className="mb-2">
                {scope === "city" ? "Relatório oficial por seção" : "Comparativo estadual"}
              </Badge>
              <CardTitle className="text-xl flex items-center gap-2">
                <Vote className="w-5 h-5" /> Onde meu candidato recebeu votos?
              </CardTitle>
              <CardDescription className="mt-1">
                {scope === "city"
                  ? "Escolha uma cidade, o cargo e o candidato para ver seção, local e bairro."
                  : "Escolha o cargo e o candidato para comparar a votação entre todas as cidades de MS."}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportXlsx} disabled={!canExport}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar Excel
              </Button>
              <Button onClick={exportPdf} disabled={!canExport}>
                <Download className="w-4 h-4 mr-2" /> PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <Button
              type="button"
              variant={scope === "city" ? "default" : "ghost"}
              onClick={() => setScope("city")}
            >
              Uma cidade · por seção
            </Button>
            <Button
              type="button"
              variant={scope === "state" ? "default" : "ghost"}
              onClick={() => setScope("state")}
            >
              Todas as cidades · comparativo
            </Button>
          </div>
          <div className={`grid gap-3 ${scope === "city" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            {scope === "city" && (
              <label className="space-y-1 text-sm font-medium">
                1. Cidade
                <select
                  className="w-full h-10 rounded-md border bg-background px-3"
                  value={municipalityCode}
                  onChange={(event) => setMunicipalityCode(Number(event.target.value))}
                >
                  {municipalities.map((item) => (
                    <option key={item.cod_municipio} value={item.cod_municipio}>
                      {item.municipio}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="space-y-1 text-sm font-medium">
              {scope === "city" ? "2. Cargo" : "1. Cargo"}
              <div className="grid grid-cols-2 gap-2">
                {CARGOS.map((item) => (
                  <Button
                    key={item}
                    size="sm"
                    variant={cargo === item ? "default" : "outline"}
                    className="h-10"
                    onClick={() => setCargo(item)}
                  >
                    {item.replace("Deputado ", "")}
                  </Button>
                ))}
              </div>
            </div>
            <label className="space-y-1 text-sm font-medium">
              {scope === "city" ? "3. Candidato" : "2. Candidato"}
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={candidateSearch}
                  onChange={(event) => setCandidateSearch(event.target.value)}
                  placeholder="Nome, número ou partido"
                />
              </div>
            </label>
          </div>
          {loadingRanking && (
            <p className="text-sm text-muted-foreground flex gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando candidatos...
            </p>
          )}
          {rankingError && (
            <p className="text-sm text-destructive">
              Falha ao carregar candidatos: {(rankingError as Error).message}
            </p>
          )}
          {!loadingRanking && ranking.length > 0 && (
            <div className="border rounded-lg max-h-64 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Candidato</TableHead>
                    <TableHead className="text-right">
                      {scope === "city" ? "Votos na cidade" : "Votos em MS"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRanking.map((row) => (
                    <TableRow
                      key={row.numero}
                      className={selected === row.numero ? "bg-primary/10" : "cursor-pointer"}
                      onClick={() => setSelected(row.numero)}
                    >
                      <TableCell>
                        <div className="flex gap-2 items-center">
                          {selected === row.numero && (
                            <CheckCircle2 className="w-4 h-4 text-primary" />
                          )}
                          <div>
                            <div className="font-medium">{row.nome_urna || row.nome_completo}</div>
                            <div className="text-xs text-muted-foreground">
                              #{row.numero} · {row.partido || "—"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{fmt(row.votos)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {scope === "state" && candidate && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <Metric label="Votos oficiais em MS" value={fmt(candidate.votos)} />
            <Metric
              label="Cidades com votos"
              value={loadingGeography ? "Carregando..." : fmt(cityRows.length)}
            />
            <Metric
              label="Conferência dos totais"
              value={
                stateTotalsMatch
                  ? "Total conferido"
                  : loadingGeography
                    ? "Conferindo..."
                    : "Divergência"
              }
              ok={stateTotalsMatch}
            />
          </div>
          {!loadingGeography && !stateTotalsMatch && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {geographyError
                ? `Falha ao carregar o comparativo: ${(geographyError as Error).message}`
                : `A soma das cidades (${fmt(totalCityVotes)}) ainda não fecha com o total oficial (${fmt(candidate.votos)}). A exportação fica bloqueada até a conferência.`}
            </div>
          )}
          <div className="grid xl:grid-cols-[0.9fr_1.1fr] gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cidades com mais votos</CardTitle>
                <CardDescription>Comparativo das cidades de Mato Grosso do Sul.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[460px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={cityRows.slice(0, 15)}
                      layout="vertical"
                      margin={{ left: 20, right: 30 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis
                        type="category"
                        dataKey="municipio"
                        width={130}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip formatter={(value) => [fmt(Number(value)), "Votos"]} />
                      <Bar dataKey="votos" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Votos por cidade</CardTitle>
                <CardDescription>
                  O detalhamento por seção fica disponível no modo “Uma cidade”.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[560px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>Pos.</TableHead>
                        <TableHead>Cidade</TableHead>
                        <TableHead className="text-right">Zonas</TableHead>
                        <TableHead className="text-right">Votos</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cityRows.map((row, index) => (
                        <TableRow key={row.cod_municipio}>
                          <TableCell>{index + 1}º</TableCell>
                          <TableCell className="font-medium">{row.municipio}</TableCell>
                          <TableCell className="text-right">{fmt(row.zonas)}</TableCell>
                          <TableCell className="text-right font-bold">{fmt(row.votos)}</TableCell>
                          <TableCell className="text-right">{pct(row.percentual)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {scope === "city" && candidate && (syncing || syncStatus?.status !== "success") && (
        <Card className="border-blue-500/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> Preparando votos
              por seção
            </CardTitle>
            <CardDescription>
              Esta carga acontece uma única vez por cidade e usa cada Boletim de Urna oficial do
              TSE.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress
              value={
                syncProgress.total || syncStatus?.secoes_principais
                  ? (100 * (syncProgress.processed || syncStatus?.secoes_processadas || 0)) /
                    (syncProgress.total || syncStatus?.secoes_principais || 1)
                  : 0
              }
            />
            <div className="text-sm text-muted-foreground">
              {fmt(syncProgress.processed || syncStatus?.secoes_processadas || 0)} de{" "}
              {fmt(syncProgress.total || syncStatus?.secoes_principais || 0)} boletins processados
            </div>
            {(syncError || syncStatus?.erro) && (
              <div className="text-sm text-destructive">{syncError || syncStatus?.erro}</div>
            )}
            {!syncing && <Button onClick={syncSections}>Continuar sincronização</Button>}
          </CardContent>
        </Card>
      )}

      {scope === "city" && candidate && syncStatus?.status === "success" && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <Metric label="Votos oficiais na cidade" value={fmt(candidate.votos)} />
            <Metric label="Seções/localizações" value={fmt(sections.length)} />
            <Metric
              label="Conferência dos totais"
              value={
                totalsMatch ? "Total conferido" : loadingSections ? "Conferindo..." : "Divergência"
              }
              ok={totalsMatch}
            />
          </div>
          {!loadingSections && !totalsMatch && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> A soma das seções (
              {fmt(totalSectionVotes)}) ainda não fecha com o total oficial ({fmt(candidate.votos)}
              ). A exportação fica bloqueada até a conferência.
            </div>
          )}
          <Tabs defaultValue="sections">
            <TabsList>
              <TabsTrigger value="sections">Por seção</TabsTrigger>
              <TabsTrigger value="regions">Por bairro/região</TabsTrigger>
            </TabsList>
            <TabsContent value="sections">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Votos em cada seção eleitoral</CardTitle>
                  <CardDescription>
                    Inclui zona, escola/local e bairro de referência. Seções agregadas pelo TSE
                    aparecem juntas.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative max-w-md">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      value={sectionSearch}
                      onChange={(event) => setSectionSearch(event.target.value)}
                      placeholder="Buscar seção, zona, escola ou bairro"
                    />
                  </div>
                  <div className="max-h-[560px] overflow-auto border rounded-lg">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>Zona / seção</TableHead>
                          <TableHead>Local de votação</TableHead>
                          <TableHead>Bairro/região</TableHead>
                          <TableHead className="text-right">Votos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSections.map((row) => (
                          <TableRow key={`${row.zona}-${row.secao}`}>
                            <TableCell className="whitespace-nowrap">
                              <div className="font-medium">
                                Zona {row.zona} · Seção {row.secao}
                              </div>
                              {row.secoes_agregadas.length > 0 && (
                                <div className="text-xs text-amber-600">
                                  Agrupa também: {row.secoes_agregadas.join(", ")}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div>{row.nome_local || `Local nº ${row.nr_local}`}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.endereco || "Endereço não cadastrado"}
                              </div>
                            </TableCell>
                            <TableCell>{row.bairro || "Não identificado"}</TableCell>
                            <TableCell className="text-right font-bold">{fmt(row.votos)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="regions">
              <div className="grid xl:grid-cols-[0.9fr_1.1fr] gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Regiões com mais votos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={regions.slice(0, 15)}
                          layout="vertical"
                          margin={{ left: 20, right: 30 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" />
                          <YAxis
                            type="category"
                            dataKey="nome"
                            width={130}
                            tick={{ fontSize: 10 }}
                          />
                          <Tooltip formatter={(value) => [fmt(Number(value)), "Votos"]} />
                          <Bar dataKey="votos" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Resumo por bairro/região</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[480px] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background">
                          <TableRow>
                            <TableHead>Bairro/região</TableHead>
                            <TableHead className="text-right">Seções</TableHead>
                            <TableHead className="text-right">Votos</TableHead>
                            <TableHead className="text-right">%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {regions.map((row) => (
                            <TableRow key={row.nome}>
                              <TableCell className="font-medium">
                                <MapPin className="inline w-3.5 h-3.5 mr-1" />
                                {row.nome}
                              </TableCell>
                              <TableCell className="text-right">{row.secoes}</TableCell>
                              <TableCell className="text-right font-bold">
                                {fmt(row.votos)}
                              </TableCell>
                              <TableCell className="text-right">{pct(row.percentual)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <strong>Seções agregadas:</strong> em alguns locais o próprio TSE totaliza duas ou mais
            seções no mesmo BU. Nesses casos, a tela mostra o conjunto e não inventa uma divisão de
            votos entre elas. O bairro vem do cadastro de locais de votação disponível na base.
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, ok = false }: { label: string; value: string; ok?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold mt-1 ${ok ? "text-emerald-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

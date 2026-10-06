/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, FileSpreadsheet, Flame, Loader2, Search, Vote, X } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";
import {
  classificarBairroCampoGrande,
  normalizarLocalidade,
  REGIAO_CAMPO_GRANDE_LABEL,
} from "@/lib/campo-grande-regioes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VencedoresTerritorio from "@/components/inteligencia/VencedoresTerritorio";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Cargo = "Presidente" | "Governador" | "Senador" | "Deputado Federal" | "Deputado Estadual";
type Scope = "city" | "state";
type Dimension = "region" | "neighborhood" | "zone" | "section" | "place";
type Candidate = {
  numero: number;
  nome_urna: string | null;
  nome_completo: string | null;
  partido: string | null;
  votos: number;
};
type SectionRow = {
  numero: number;
  zona: number;
  secao: number;
  secoes_agregadas: number[];
  nr_local: number;
  nome_local: string | null;
  endereco: string | null;
  bairro: string | null;
  regiao: string | null;
  votos: number;
};
type GeographyRow = {
  numero: number;
  cod_municipio: number;
  municipio: string;
  zona: number;
  votos: number;
};
type MatrixRow = { key: string; label: string; votes: Record<number, number>; total: number };

const CARGOS: Cargo[] = [
  "Presidente",
  "Governador",
  "Senador",
  "Deputado Federal",
  "Deputado Estadual",
];
const PAGE_SIZE = 1000;
const CAMPO_GRANDE = 90514;
const REGION_KEYS = new Set(Object.keys(REGIAO_CAMPO_GRANDE_LABEL));
const COLORS = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#4f46e5",
  "#be123c",
];
const fmt = (value: number) => Number(value || 0).toLocaleString("pt-BR");
const safe = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
const candidateName = (candidate: Candidate) =>
  candidate.nome_urna || candidate.nome_completo || `#${candidate.numero}`;

async function readAllRpc(name: string, args: Record<string, unknown>) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await (supabase.rpc as any)(name, args).range(
      from,
      from + PAGE_SIZE - 1,
    );
    if (error) throw error;
    const page = (data || []) as any[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function makeMatrix(rows: SectionRow[], dimension: Dimension): MatrixRow[] {
  const grouped = new Map<string, MatrixRow>();
  rows.forEach((row) => {
    const key =
      dimension === "region"
        ? row.regiao || "nao-classificado"
        : dimension === "neighborhood"
          ? normalizarLocalidade(row.bairro) || "NAO INFORMADO"
          : dimension === "zone"
            ? String(row.zona)
            : dimension === "section"
              ? `${row.zona}-${row.secao}`
              : `${row.zona}-${row.nr_local}`;
    const label =
      dimension === "region"
        ? (REGIAO_CAMPO_GRANDE_LABEL as Record<string, string>)[row.regiao || ""] ||
          "Não classificado"
        : dimension === "neighborhood"
          ? row.bairro?.trim() || "Não informado"
          : dimension === "zone"
            ? `Zona ${row.zona}`
            : dimension === "section"
              ? `Zona ${row.zona} · Seção ${row.secao}`
              : row.nome_local || `Zona ${row.zona} · Local ${row.nr_local}`;
    const current = grouped.get(key) || { key, label, votes: {}, total: 0 };
    current.votes[row.numero] = (current.votes[row.numero] || 0) + row.votos;
    current.total += row.votos;
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
}

export default function PainelComparativoEleitoral2026() {
  const queryClient = useQueryClient();
  const { data: clientId = null } = useCurrentClientId();
  const [scope, setScope] = useState<Scope>("city");
  const [cargo, setCargo] = useState<Cargo>("Deputado Estadual");
  const [municipalityCode, setMunicipalityCode] = useState(CAMPO_GRANDE);
  const [selected, setSelected] = useState<number[]>([]);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [dimension, setDimension] = useState<Dimension>("region");
  const [regionFilter, setRegionFilter] = useState("all");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("");
  const [heatCandidate, setHeatCandidate] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState({ processed: 0, total: 0 });
  const syncGuard = useRef(false);

  const { data: municipalities = [] } = useQuery({
    queryKey: ["tse-2026-municipalities-ms"],
    queryFn: async () =>
      (await readAllRpc("get_tse_municipality_options", { p_ano: 2026, p_uf: "MS" })).map(
        (row) => ({ cod_municipio: Number(row.cod_municipio), municipio: String(row.municipio) }),
      ),
  });
  const municipality = municipalities.find((item) => item.cod_municipio === municipalityCode) || {
    cod_municipio: municipalityCode,
    municipio: municipalityCode === CAMPO_GRANDE ? "CAMPO GRANDE" : "",
  };
  const {
    data: ranking = [],
    isLoading: loadingRanking,
    error: rankingError,
  } = useQuery({
    queryKey: ["tse-2026-ranking-multi", scope, cargo, municipality.municipio],
    enabled: scope === "state" || Boolean(municipality.municipio),
    queryFn: async () =>
      (
        await readAllRpc("get_tse_candidate_ranking", {
          p_ano: 2026,
          p_uf: "MS",
          p_cargo: cargo,
          p_municipio: scope === "city" ? municipality.municipio : null,
        })
      ).map((row) => ({
        ...row,
        numero: Number(row.numero),
        votos: Number(row.votos || 0),
      })) as Candidate[],
  });
  const { data: overrides = [] } = useQuery({
    queryKey: ["election-neighborhood-region-overrides", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eleicao_bairro_regiao" as any)
        .select("bairro_normalizado,regiao_value")
        .eq("client_id", clientId!)
        .eq("municipio", "CAMPO GRANDE");
      if (error) throw error;
      return (data || []) as { bairro_normalizado: string; regiao_value: string }[];
    },
  });
  const overrideMap = useMemo(
    () => new Map(overrides.map((row) => [row.bairro_normalizado, row.regiao_value])),
    [overrides],
  );
  const { data: syncStatus = null, refetch: refetchStatus } = useQuery({
    queryKey: ["tse-section-sync-status", municipalityCode],
    enabled: scope === "city",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tse_secao_sync_status" as any)
        .select("status,secoes_principais,secoes_processadas,erro")
        .eq("ano", 2026)
        .eq("turno", 1)
        .eq("uf", "MS")
        .eq("cod_municipio", municipalityCode)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const { data: sections = [], isLoading: loadingSections } = useQuery({
    queryKey: ["tse-sections-multi", municipalityCode, cargo, selected, overrides],
    enabled: scope === "city" && selected.length > 0 && syncStatus?.status === "success",
    queryFn: async () =>
      (
        await Promise.all(
          selected.map(async (numero) =>
            (
              await readAllRpc("get_tse_candidate_sections", {
                p_ano: 2026,
                p_uf: "MS",
                p_cod_municipio: municipalityCode,
                p_cargo: cargo,
                p_numero: numero,
              })
            ).map(
              (row) =>
                ({
                  numero,
                  zona: Number(row.zona),
                  secao: Number(row.secao),
                  nr_local: Number(row.nr_local),
                  secoes_agregadas: Array.isArray(row.secoes_agregadas)
                    ? row.secoes_agregadas.map(Number)
                    : [],
                  nome_local: row.nome_local,
                  endereco: row.endereco,
                  bairro: row.bairro,
                  regiao:
                    municipalityCode === CAMPO_GRANDE
                      ? classificarBairroCampoGrande(row.bairro, overrideMap, REGION_KEYS).regiao
                      : null,
                  votos: Number(row.votos || 0),
                }) as SectionRow[],
            ),
          ),
        )
      ).flat(),
  });
  const { data: geography = [], isLoading: loadingGeography } = useQuery({
    queryKey: ["tse-geography-multi", cargo, selected],
    enabled: scope === "state" && selected.length > 0,
    queryFn: async () =>
      (
        await readAllRpc("get_tse_candidate_geography", {
          p_ano: 2026,
          p_uf: "MS",
          p_cargo: cargo,
          p_numeros: selected,
          p_municipio: null,
        })
      ).map((row) => ({
        numero: Number(row.numero),
        cod_municipio: Number(row.cod_municipio),
        municipio: String(row.municipio),
        zona: Number(row.zona),
        votos: Number(row.votos || 0),
      })) as GeographyRow[],
  });

  useEffect(() => {
    setSelected([]);
    setCandidateSearch("");
    setHeatCandidate(null);
    setSyncError(null);
    setRegionFilter("all");
    setNeighborhoodFilter("all");
    setZoneFilter("all");
    setSectionFilter("");
  }, [scope, cargo, municipalityCode]);
  useEffect(() => {
    if (!selected.includes(heatCandidate || -1)) setHeatCandidate(selected[0] || null);
  }, [selected, heatCandidate]);
  const selectedCandidates = selected
    .map((number) => ranking.find((row) => row.numero === number))
    .filter(Boolean) as Candidate[];
  const filteredRanking = useMemo(() => {
    const term = candidateSearch.trim().toLocaleLowerCase("pt-BR");
    return ranking
      .filter(
        (row) =>
          !term ||
          `${row.numero} ${row.nome_urna || ""} ${row.nome_completo || ""} ${row.partido || ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(term),
      )
      .slice(0, term ? 150 : 40);
  }, [candidateSearch, ranking]);
  const neighborhoods = useMemo(
    () =>
      Array.from(
        new Set(sections.map((row) => row.bairro?.trim()).filter(Boolean) as string[]),
      ).sort(),
    [sections],
  );
  const zones = useMemo(
    () => Array.from(new Set(sections.map((row) => row.zona))).sort((a, b) => a - b),
    [sections],
  );
  const filteredSections = useMemo(
    () =>
      sections.filter(
        (row) =>
          (regionFilter === "all" || row.regiao === regionFilter) &&
          (neighborhoodFilter === "all" || row.bairro?.trim() === neighborhoodFilter) &&
          (zoneFilter === "all" || row.zona === Number(zoneFilter)) &&
          (!sectionFilter.trim() || String(row.secao).includes(sectionFilter.trim())),
      ),
    [sections, regionFilter, neighborhoodFilter, zoneFilter, sectionFilter],
  );
  const matrix = useMemo(
    () => makeMatrix(filteredSections, dimension),
    [filteredSections, dimension],
  );
  const cityMatrix = useMemo<MatrixRow[]>(() => {
    const grouped = new Map<string, MatrixRow>();
    geography.forEach((row) => {
      const current = grouped.get(row.municipio) || {
        key: String(row.cod_municipio),
        label: row.municipio,
        votes: {},
        total: 0,
      };
      current.votes[row.numero] = (current.votes[row.numero] || 0) + row.votos;
      current.total += row.votos;
      grouped.set(row.municipio, current);
    });
    return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
  }, [geography]);
  const heatRows = useMemo(
    () =>
      makeMatrix(
        filteredSections.filter((row) => row.numero === heatCandidate),
        "region",
      ),
    [filteredSections, heatCandidate],
  );
  const heatMax = Math.max(1, ...heatRows.map((row) => row.total));
  const heatByKey = new Map(heatRows.map((row) => [row.key, row]));
  const comparisonRows = scope === "state" ? cityMatrix : matrix;
  const busy = loadingSections || loadingGeography;

  const syncSections = async (restart = false) => {
    if (syncGuard.current) return;
    syncGuard.current = true;
    setSyncing(true);
    setSyncError(null);
    try {
      for (let batch = 0; batch < 100; batch += 1) {
        const { data, error } = await supabase.functions.invoke("sync-tse-sections", {
          body: {
            uf: "MS",
            cod_municipio: municipalityCode,
            batch_size: 80,
            restart: restart && batch === 0,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setSyncProgress({ processed: Number(data.processed || 0), total: Number(data.total || 0) });
        if (data.complete) break;
      }
      await refetchStatus();
      await queryClient.invalidateQueries({ queryKey: ["tse-sections-multi", municipalityCode] });
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
      selected.length &&
      syncStatus?.status !== "success" &&
      !syncing &&
      !syncError
    )
      void syncSections(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [scope, selected.length, syncStatus?.status]);

  const exportXlsx = () => {
    if (!selectedCandidates.length || !comparisonRows.length) return;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        selectedCandidates.map((candidate) => ({
          Ano: 2026,
          Escopo: scope === "state" ? "Mato Grosso do Sul" : `${municipality.municipio}/MS`,
          Cargo: cargo,
          Número: candidate.numero,
          Candidato: candidateName(candidate),
          Partido: candidate.partido,
          "Votos oficiais": candidate.votos,
        })),
      ),
      "Candidatos",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        comparisonRows.map((row, index) => ({
          Posição: index + 1,
          Localidade: row.label,
          ...Object.fromEntries(
            selectedCandidates.map((candidate) => [
              `${candidateName(candidate)} #${candidate.numero}`,
              row.votes[candidate.numero] || 0,
            ]),
          ),
          Total: row.total,
        })),
      ),
      scope === "state" ? "Votos por cidade" : `Comparativo ${dimension}`,
    );
    if (scope === "city")
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          filteredSections.map((row) => {
            const candidate = selectedCandidates.find((item) => item.numero === row.numero)!;
            return {
              Candidato: candidateName(candidate),
              Número: row.numero,
              Região: row.regiao
                ? (REGIAO_CAMPO_GRANDE_LABEL as Record<string, string>)[row.regiao]
                : "Não classificado",
              Bairro: row.bairro,
              Zona: row.zona,
              Seção: row.secao,
              "Seções agregadas": row.secoes_agregadas.join(", "),
              "Local nº": row.nr_local,
              Local: row.nome_local,
              Endereço: row.endereco,
              Votos: row.votos,
            };
          }),
        ),
        "Seções e locais",
      );
    XLSX.writeFile(workbook, `eleicao-2026-${safe(cargo)}-${selected.join("-")}.xlsx`);
  };
  const exportPdf = () => {
    if (!selectedCandidates.length || !comparisonRows.length) return;
    const doc = new jsPDF({
      orientation: selectedCandidates.length > 3 ? "landscape" : "portrait",
    });
    doc.setFontSize(16);
    doc.text(
      scope === "state"
        ? "Comparativo eleitoral por cidade"
        : `Comparativo eleitoral — ${municipality.municipio}/MS`,
      14,
      16,
    );
    doc.setFontSize(9);
    doc.text(
      `Eleições 2026 · ${cargo} · ${selectedCandidates.map((item) => `${candidateName(item)} #${item.numero}`).join(" · ")}`,
      14,
      23,
      { maxWidth: doc.internal.pageSize.getWidth() - 28 },
    );
    autoTable(doc, {
      startY: 32,
      head: [
        [
          scope === "state" ? "Cidade" : "Localidade",
          ...selectedCandidates.map((item) => `${candidateName(item)} #${item.numero}`),
          "Total",
        ],
      ],
      body: comparisonRows.map((row) => [
        row.label,
        ...selectedCandidates.map((item) => fmt(row.votes[item.numero] || 0)),
        fmt(row.total),
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save(`eleicao-2026-${safe(cargo)}-${selected.join("-")}.pdf`);
  };
  const toggleCandidate = (numero: number) =>
    setSelected((current) =>
      current.includes(numero) ? current.filter((item) => item !== numero) : [...current, numero],
    );

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/40 shadow-sm">
        <div className="h-1 bg-primary" />
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge className="mb-2">Análise oficial 2026</Badge>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Vote className="h-5 w-5" /> Resultado e comparação de candidatos
              </CardTitle>
              <CardDescription className="mt-1">
                Marque quantos candidatos precisar. A tela e os arquivos comparam todos lado a lado.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportXlsx} disabled={!comparisonRows.length}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
                {selectedCandidates.length > 0 && ` (${selectedCandidates.length})`}
              </Button>
              <Button onClick={exportPdf} disabled={!comparisonRows.length}>
                <Download className="mr-2 h-4 w-4" /> PDF
                {selectedCandidates.length > 0 && ` (${selectedCandidates.length})`}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm md:grid-cols-3">
            <div>
              <strong>1.</strong> Escolha cidade e cargo
            </div>
            <div>
              <strong>2.</strong> Marque dois ou mais candidatos
            </div>
            <div>
              <strong>3.</strong> Compare e exporte todos juntos
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <Button
              variant={scope === "city" ? "default" : "ghost"}
              onClick={() => setScope("city")}
            >
              Uma cidade · seção e região
            </Button>
            <Button
              variant={scope === "state" ? "default" : "ghost"}
              onClick={() => setScope("state")}
            >
              Todas as cidades
            </Button>
          </div>
          <div
            className={`grid gap-3 ${scope === "city" ? "lg:grid-cols-[1fr_2fr]" : "grid-cols-1"}`}
          >
            {scope === "city" && (
              <label className="space-y-1 text-sm font-medium">
                Cidade
                <select
                  className="h-10 w-full rounded-md border bg-background px-3"
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
              Cargo
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {CARGOS.map((item) => (
                  <Button
                    key={item}
                    size="sm"
                    className="h-10"
                    variant={cargo === item ? "default" : "outline"}
                    onClick={() => setCargo(item)}
                  >
                    {item.replace("Deputado ", "Dep. ")}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={candidateSearch}
              onChange={(event) => setCandidateSearch(event.target.value)}
              placeholder="Buscar candidato por nome, número ou partido"
            />
          </div>
          {selectedCandidates.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <strong>{selectedCandidates.length} candidato(s) no comparativo</strong>
                <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                  Limpar seleção
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedCandidates.map((candidate, index) => (
                  <Badge
                    key={candidate.numero}
                    variant="secondary"
                    className="gap-2 py-1.5"
                    style={{ borderLeft: `4px solid ${COLORS[index % COLORS.length]}` }}
                  >
                    {candidateName(candidate)} #{candidate.numero}
                    <button
                      type="button"
                      aria-label="Remover candidato"
                      onClick={() => toggleCandidate(candidate.numero)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {loadingRanking ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando candidatos...
            </p>
          ) : rankingError ? (
            <p className="text-sm text-destructive">
              Não foi possível carregar os candidatos: {(rankingError as Error).message}
            </p>
          ) : (
            <div className="max-h-64 overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-12">Sel.</TableHead>
                    <TableHead>Candidato</TableHead>
                    <TableHead className="text-right">Votos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRanking.map((row) => {
                    const checked = selected.includes(row.numero);
                    return (
                      <TableRow
                        key={row.numero}
                        className="cursor-pointer"
                        onClick={() => toggleCandidate(row.numero)}
                      >
                        <TableCell>
                          <span
                            className={`grid h-5 w-5 place-items-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : ""}`}
                          >
                            {checked && <Check className="h-3.5 w-3.5" />}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{candidateName(row)}</div>
                          <div className="text-xs text-muted-foreground">
                            #{row.numero} · {row.partido || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{fmt(row.votos)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {scope === "city" && selected.length > 0 && syncStatus?.status !== "success" && (
        <Card className="border-blue-500/40">
          <CardHeader>
            <CardTitle className="text-base">Preparando detalhamento por seção</CardTitle>
            <CardDescription>
              A sincronização oficial inclui agora os cinco cargos e percorre todas as seções da
              cidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {syncing && (
              <>
                <Progress
                  value={
                    syncProgress.total ? (100 * syncProgress.processed) / syncProgress.total : 0
                  }
                />
                <p className="text-sm text-muted-foreground">
                  {fmt(syncProgress.processed)} de {fmt(syncProgress.total)} boletins
                </p>
              </>
            )}
            {syncError && <p className="text-sm text-destructive">{syncError}</p>}
            <Button onClick={() => void syncSections(false)} disabled={syncing}>
              {syncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Tentar sincronização
            </Button>
          </CardContent>
        </Card>
      )}
      {scope === "city" && municipalityCode === CAMPO_GRANDE && sections.length > 0 && (
        <HeatMap
          candidates={selectedCandidates}
          heatCandidate={heatCandidate}
          setHeatCandidate={setHeatCandidate}
          regionFilter={regionFilter}
          setRegionFilter={setRegionFilter}
          neighborhoodFilter={neighborhoodFilter}
          setNeighborhoodFilter={setNeighborhoodFilter}
          zoneFilter={zoneFilter}
          setZoneFilter={setZoneFilter}
          sectionFilter={sectionFilter}
          setSectionFilter={setSectionFilter}
          neighborhoods={neighborhoods}
          zones={zones}
          heatByKey={heatByKey}
          heatMax={heatMax}
        />
      )}
      {scope === "city" && municipalityCode === CAMPO_GRANDE && (
        <VencedoresTerritorio
          cargo={cargo}
          municipalityCode={municipalityCode}
          municipalityName={municipality.municipio}
          enabled={syncStatus?.status === "success"}
          syncing={syncing}
          onSync={() => void syncSections(true)}
        />
      )}
      {selected.length > 0 && (scope === "state" || syncStatus?.status === "success") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Comparativo lado a lado</CardTitle>
            <CardDescription>
              {scope === "state"
                ? "Votos de cada candidato por cidade."
                : "Alterne a dimensão sem perder os filtros do mapa."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {scope === "city" ? (
              <Tabs value={dimension} onValueChange={(value) => setDimension(value as Dimension)}>
                <div className="px-6">
                  <TabsList className="h-auto flex-wrap">
                    <TabsTrigger value="region">Região</TabsTrigger>
                    <TabsTrigger value="neighborhood">Bairro</TabsTrigger>
                    <TabsTrigger value="zone">Zona</TabsTrigger>
                    <TabsTrigger value="section">Seção</TabsTrigger>
                    <TabsTrigger value="place">Local de votação</TabsTrigger>
                  </TabsList>
                </div>
                {(["region", "neighborhood", "zone", "section", "place"] as Dimension[]).map(
                  (item) => (
                    <TabsContent key={item} value={item} className="mt-4">
                      <ComparisonTable rows={comparisonRows} candidates={selectedCandidates} />
                    </TabsContent>
                  ),
                )}
              </Tabs>
            ) : (
              <ComparisonTable rows={comparisonRows} candidates={selectedCandidates} />
            )}
            {busy && (
              <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cruzando todos os candidatos e
                territórios...
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {scope === "city" &&
        selected.length > 0 &&
        !busy &&
        !comparisonRows.length &&
        syncStatus?.status === "success" && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="py-4 text-sm">
              Os candidatos foram selecionados, mas ainda não existem votos por seção para este
              cargo. Use <strong>Reprocessar dados territoriais</strong> acima; depois o comparativo
              e as exportações serão liberados automaticamente.
            </CardContent>
          </Card>
        )}
    </div>
  );
}

type HeatProps = {
  candidates: Candidate[];
  heatCandidate: number | null;
  setHeatCandidate: (value: number) => void;
  regionFilter: string;
  setRegionFilter: (value: string) => void;
  neighborhoodFilter: string;
  setNeighborhoodFilter: (value: string) => void;
  zoneFilter: string;
  setZoneFilter: (value: string) => void;
  sectionFilter: string;
  setSectionFilter: (value: string) => void;
  neighborhoods: string[];
  zones: number[];
  heatByKey: Map<string, MatrixRow>;
  heatMax: number;
};
function HeatMap(props: HeatProps) {
  const blocks = [
    { key: "segredo", area: "1 / 1 / 2 / 2" },
    { key: "prosa", area: "1 / 2 / 2 / 4" },
    { key: "imbirussu", area: "2 / 1 / 3 / 2" },
    { key: "centro", area: "2 / 2 / 3 / 3" },
    { key: "bandeira", area: "2 / 3 / 3 / 4" },
    { key: "lagoa", area: "3 / 1 / 4 / 2" },
    { key: "anhanduizinho", area: "3 / 2 / 4 / 3" },
    { key: "moreninha", area: "3 / 3 / 4 / 4" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Flame className="h-5 w-5 text-orange-600" /> Mapa de calor de Campo Grande
        </CardTitle>
        <CardDescription>
          Quanto mais escura a região, maior a concentração de votos do candidato escolhido. Refine
          por região, bairro, zona ou seção.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-5">
          <select
            className="h-10 rounded-md border bg-background px-2 text-sm"
            value={props.heatCandidate || ""}
            onChange={(event) => props.setHeatCandidate(Number(event.target.value))}
          >
            {props.candidates.map((item) => (
              <option key={item.numero} value={item.numero}>
                {candidateName(item)} #{item.numero}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-2 text-sm"
            value={props.regionFilter}
            onChange={(event) => props.setRegionFilter(event.target.value)}
          >
            <option value="all">Todas as regiões</option>
            {Object.entries(REGIAO_CAMPO_GRANDE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-2 text-sm"
            value={props.neighborhoodFilter}
            onChange={(event) => props.setNeighborhoodFilter(event.target.value)}
          >
            <option value="all">Todos os bairros</option>
            {props.neighborhoods.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-2 text-sm"
            value={props.zoneFilter}
            onChange={(event) => props.setZoneFilter(event.target.value)}
          >
            <option value="all">Todas as zonas</option>
            {props.zones.map((item) => (
              <option key={item} value={item}>
                Zona {item}
              </option>
            ))}
          </select>
          <Input
            inputMode="numeric"
            value={props.sectionFilter}
            onChange={(event) => props.setSectionFilter(event.target.value.replace(/\D/g, ""))}
            placeholder="Seção eleitoral"
          />
        </div>
        <div className="grid min-h-[360px] grid-cols-3 grid-rows-3 gap-2 rounded-2xl border bg-slate-100 p-3 dark:bg-slate-950 md:p-6">
          {blocks.map(({ key, area }) => {
            const value = props.heatByKey.get(key)?.total || 0;
            const intensity = value / props.heatMax;
            return (
              <button
                key={key}
                type="button"
                onClick={() => props.setRegionFilter(props.regionFilter === key ? "all" : key)}
                className={`rounded-xl border p-3 text-left transition hover:scale-[1.01] ${props.regionFilter === key ? "ring-2 ring-primary" : ""}`}
                style={{
                  gridArea: area,
                  backgroundColor: `rgba(220, 38, 38, ${0.08 + intensity * 0.82})`,
                  color: intensity > 0.55 ? "white" : "inherit",
                }}
              >
                <div className="text-xs font-medium uppercase tracking-wide opacity-80">
                  {(REGIAO_CAMPO_GRANDE_LABEL as Record<string, string>)[key]}
                </div>
                <div className="mt-1 text-xl font-bold">{fmt(value)}</div>
                <div className="text-xs opacity-80">votos no filtro</div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Mapa operacional por regiões urbanas; bairros sem correspondência segura continuam
          visíveis no comparativo.
        </p>
      </CardContent>
    </Card>
  );
}

function ComparisonTable({ rows, candidates }: { rows: MatrixRow[]; candidates: Candidate[] }) {
  return (
    <div className="max-h-[620px] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="min-w-52">Território</TableHead>
            {candidates.map((candidate, index) => (
              <TableHead
                key={candidate.numero}
                className="min-w-32 text-right"
                style={{ borderTop: `3px solid ${COLORS[index % COLORS.length]}` }}
              >
                {candidateName(candidate)}
                <div className="text-[10px] font-normal text-muted-foreground">
                  #{candidate.numero}
                </div>
              </TableHead>
            ))}
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="font-medium">{row.label}</TableCell>
              {candidates.map((candidate) => (
                <TableCell key={candidate.numero} className="text-right font-semibold">
                  {fmt(row.votes[candidate.numero] || 0)}
                </TableCell>
              ))}
              <TableCell className="text-right text-muted-foreground">{fmt(row.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!rows.length && (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Nenhum dado corresponde aos filtros.
        </p>
      )}
    </div>
  );
}

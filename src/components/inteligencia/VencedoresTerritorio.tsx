/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Medal, RefreshCw, Trophy } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";
import { classificarLocalCampoGrande, REGIAO_CAMPO_GRANDE_LABEL } from "@/lib/campo-grande-regioes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TerritoryOption = {
  zona: number;
  secao: number;
  nr_local: number;
  nome_local: string | null;
  bairro: string | null;
  regiao: string | null;
};
type RankingRow = {
  numero: number;
  nome_urna: string | null;
  nome_completo: string | null;
  partido: string | null;
  votos: number;
  percentual: number;
};
type Props = {
  cargo: string;
  municipalityCode: number;
  municipalityName: string;
  enabled: boolean;
  syncing: boolean;
  onSync: () => void;
};

const REGION_KEYS = new Set(Object.keys(REGIAO_CAMPO_GRANDE_LABEL));
const fmt = (value: number) => Number(value || 0).toLocaleString("pt-BR");
const pct = (value: number) => `${value.toFixed(1).replace(".", ",")}%`;
const name = (row: RankingRow) => row.nome_urna || row.nome_completo || `#${row.numero}`;

async function readAllTerritoryOptions(args: Record<string, unknown>) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await (supabase.rpc as any)("get_tse_territory_options", args).range(
      from,
      from + 999,
    );
    if (error) throw error;
    const page = (data || []) as any[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

export default function VencedoresTerritorio({
  cargo,
  municipalityCode,
  municipalityName,
  enabled,
  syncing,
  onSync,
}: Props) {
  const { data: clientId = null } = useCurrentClientId();
  const [mode, setMode] = useState<"region" | "neighborhood">("region");
  const [region, setRegion] = useState("all");
  const [neighborhood, setNeighborhood] = useState("all");
  const [zone, setZone] = useState("all");
  const [section, setSection] = useState("all");
  const [place, setPlace] = useState("all");
  const resetDetails = () => {
    setZone("all");
    setSection("all");
    setPlace("all");
  };

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

  const { data: options = [], isLoading: loadingOptions } = useQuery({
    queryKey: ["tse-territory-options", municipalityCode, cargo, overrides],
    enabled,
    queryFn: async () => {
      const data = await readAllTerritoryOptions({
        p_ano: 2026,
        p_uf: "MS",
        p_cod_municipio: municipalityCode,
        p_cargo: cargo,
      });
      return data.map((row) => ({
        zona: Number(row.zona),
        secao: Number(row.secao),
        nr_local: Number(row.nr_local),
        nome_local: row.nome_local,
        bairro: row.bairro,
        regiao: classificarLocalCampoGrande(
          {
            nomeLocal: row.nome_local,
            bairro: row.bairro,
            zona: Number(row.zona),
            nrLocal: Number(row.nr_local),
          },
          overrideMap,
          REGION_KEYS,
        ).regiao,
      })) as TerritoryOption[];
    },
  });

  useEffect(() => {
    setRegion("all");
    setNeighborhood("all");
    setZone("all");
    setSection("all");
    setPlace("all");
  }, [cargo]);

  const neighborhoods = useMemo(
    () =>
      Array.from(
        new Set(
          options
            .filter((item) => mode !== "region" || region === "all" || item.regiao === region)
            .map((item) => item.bairro?.trim())
            .filter(Boolean) as string[],
        ),
      ).sort(),
    [mode, options, region],
  );
  const territoryOptions = useMemo(
    () =>
      options.filter(
        (item) =>
          (mode !== "region" || region === "all" || item.regiao === region) &&
          (mode !== "neighborhood" || neighborhood === "all" || item.bairro === neighborhood),
      ),
    [mode, neighborhood, options, region],
  );
  const zones = useMemo(
    () => Array.from(new Set(territoryOptions.map((item) => item.zona))).sort((a, b) => a - b),
    [territoryOptions],
  );
  const sections = useMemo(
    () =>
      zone === "all"
        ? []
        : Array.from(
            new Set(
              territoryOptions
                .filter((item) => item.zona === Number(zone))
                .map((item) => item.secao),
            ),
          ).sort((a, b) => a - b),
    [territoryOptions, zone],
  );
  const places = useMemo(() => {
    if (zone === "all") return [];
    const unique = new Map<number, string>();
    territoryOptions
      .filter((item) => item.zona === Number(zone))
      .forEach((item) => unique.set(item.nr_local, item.nome_local || `Local ${item.nr_local}`));
    return Array.from(unique, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR"),
    );
  }, [territoryOptions, zone]);
  const selectedNeighborhoods = useMemo(() => {
    if (mode === "neighborhood") return neighborhood === "all" ? null : [neighborhood];
    return null;
  }, [mode, neighborhood]);
  const selectedLocations = useMemo(() => {
    if (mode !== "region" || region === "all") return null;
    return Array.from(
      new Set(
        options
          .filter((item) => item.regiao === region)
          .map((item) => `${item.zona}:${item.nr_local}`),
      ),
    );
  }, [mode, options, region]);

  const {
    data: ranking = [],
    isLoading: loadingRanking,
    error,
  } = useQuery({
    queryKey: [
      "tse-ranking-by-territory",
      municipalityCode,
      cargo,
      selectedNeighborhoods,
      selectedLocations,
      zone,
      section,
      place,
    ],
    enabled:
      enabled &&
      options.length > 0 &&
      selectedNeighborhoods?.length !== 0 &&
      selectedLocations?.length !== 0,
    queryFn: async () => {
      const { data, error: rpcError } = await supabase.rpc(
        "get_tse_candidate_ranking_by_locations" as any,
        {
          p_ano: 2026,
          p_uf: "MS",
          p_cod_municipio: municipalityCode,
          p_cargo: cargo,
          p_bairros: selectedNeighborhoods,
          p_locais: selectedLocations,
          p_zona: zone === "all" ? null : Number(zone),
          p_secao: section === "all" ? null : Number(section),
          p_nr_local: place === "all" ? null : Number(place),
        },
      );
      if (rpcError) throw rpcError;
      return ((data || []) as any[]).map((row) => ({
        ...row,
        numero: Number(row.numero),
        votos: Number(row.votos || 0),
        percentual: Number(row.percentual || 0),
      })) as RankingRow[];
    },
  });

  const leader = ranking[0];
  const runnerUp = ranking[1];
  const totalVotes = ranking.reduce((sum, row) => sum + row.votos, 0);
  const territoryLabel =
    mode === "region"
      ? region === "all"
        ? "Campo Grande inteira"
        : `Região ${REGIAO_CAMPO_GRANDE_LABEL[region as keyof typeof REGIAO_CAMPO_GRANDE_LABEL]}`
      : neighborhood === "all"
        ? "Todos os bairros"
        : `Bairro ${neighborhood}`;

  const exportRanking = () => {
    if (!ranking.length) return;
    const sheet = XLSX.utils.json_to_sheet(
      ranking.map((row, index) => ({
        Posição: index + 1,
        Território: territoryLabel,
        Cargo: cargo,
        Candidato: name(row),
        Número: row.numero,
        Partido: row.partido,
        Votos: row.votos,
        "Participação (%)": Number(row.percentual.toFixed(2)),
        "Diferença para o líder": leader.votos - row.votos,
      })),
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Ranking territorial");
    XLSX.writeFile(
      workbook,
      `ranking-${cargo.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.xlsx`,
    );
  };

  if (!enabled || (!loadingOptions && !options.length)) {
    return (
      <Card className="border-amber-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-amber-600" /> Quem ganhou em cada território?
          </CardTitle>
          <CardDescription>
            Para montar o ranking por região e bairro, é necessário reprocessar os votos por seção
            deste cargo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Reprocessar dados territoriais
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-amber-500/40">
      <div className="h-1 bg-amber-500" />
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge className="mb-2 bg-amber-600">Raio-X do território</Badge>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5" /> Quem foi mais votado aqui?
            </CardTitle>
            <CardDescription>
              Descubra o vencedor, a vantagem sobre o segundo colocado e o ranking completo em uma
              região, bairro, zona, seção ou local de votação.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={exportRanking} disabled={!ranking.length}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar ranking
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <Button
            variant={mode === "region" ? "default" : "ghost"}
            onClick={() => {
              setMode("region");
              resetDetails();
            }}
          >
            Por região
          </Button>
          <Button
            variant={mode === "neighborhood" ? "default" : "ghost"}
            onClick={() => {
              setMode("neighborhood");
              resetDetails();
            }}
          >
            Por bairro
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {mode === "region" ? (
            <Select
              value={region}
              onChange={(value) => {
                setRegion(value);
                setNeighborhood("all");
                resetDetails();
              }}
            >
              <option value="all">Campo Grande inteira</option>
              {Object.entries(REGIAO_CAMPO_GRANDE_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          ) : (
            <Select
              value={neighborhood}
              onChange={(value) => {
                setNeighborhood(value);
                resetDetails();
              }}
            >
              <option value="all">Todos os bairros</option>
              {neighborhoods.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          )}
          <Select
            value={zone}
            onChange={(value) => {
              setZone(value);
              setSection("all");
              setPlace("all");
            }}
          >
            <option value="all">Todas as zonas</option>
            {zones.map((item) => (
              <option key={item} value={item}>
                Zona {item}
              </option>
            ))}
          </Select>
          <Select value={section} onChange={setSection}>
            <option value="all">Todas as seções</option>
            {sections.map((item) => (
              <option key={item} value={item}>
                Seção {item}
              </option>
            ))}
          </Select>
          <Select value={place} onChange={setPlace}>
            <option value="all">Todos os locais</option>
            {places.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <div className="text-xs text-muted-foreground">Analisando</div>
            <div className="truncate font-medium">{territoryLabel}</div>
          </div>
        </div>

        {loadingRanking ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Apurando todos os candidatos...
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">
            Não foi possível montar o ranking: {(error as Error).message}
          </p>
        ) : leader ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {ranking.slice(0, 3).map((row, index) => (
                <Card
                  key={row.numero}
                  className={index === 0 ? "border-amber-500 bg-amber-500/5" : ""}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Medal className={`h-4 w-4 ${index === 0 ? "text-amber-600" : ""}`} />{" "}
                      {index + 1}º colocado
                    </div>
                    <div className="mt-2 text-lg font-bold">{name(row)}</div>
                    <div className="text-xs text-muted-foreground">
                      #{row.numero} · {row.partido || "—"}
                    </div>
                    <div className="mt-3 text-2xl font-bold">{fmt(row.votos)}</div>
                    <div className="text-sm text-muted-foreground">
                      {pct(row.percentual)} dos votos nominais
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <strong>{name(leader)}</strong> lidera em {territoryLabel} com{" "}
              <strong>{fmt(leader.votos)} votos</strong>
              {runnerUp
                ? `, vantagem de ${fmt(leader.votos - runnerUp.votos)} votos sobre ${name(runnerUp)}.`
                : "."}{" "}
              Total nominal analisado: {fmt(totalVotes)} votos.
            </div>
            <div className="max-h-[520px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Pos.</TableHead>
                    <TableHead>Candidato</TableHead>
                    <TableHead className="text-right">Votos</TableHead>
                    <TableHead className="text-right">Participação</TableHead>
                    <TableHead className="text-right">Dif. líder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((row, index) => (
                    <TableRow key={row.numero}>
                      <TableCell className="font-bold">{index + 1}º</TableCell>
                      <TableCell>
                        <div className="font-medium">{name(row)}</div>
                        <div className="text-xs text-muted-foreground">
                          #{row.numero} · {row.partido || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold">{fmt(row.votos)}</TableCell>
                      <TableCell className="text-right">{pct(row.percentual)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {index === 0 ? "Líder" : `-${fmt(leader.votos - row.votos)}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <p className="rounded-lg border p-5 text-center text-sm text-muted-foreground">
            Nenhum voto nominal encontrado para esse recorte.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Fonte: boletins oficiais do TSE por seção · {municipalityName}/MS · {cargo} · 2026.
        </p>
      </CardContent>
    </Card>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      className="h-10 min-w-0 rounded-md border bg-background px-2 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Loader2,
  MapPin,
  RefreshCw,
  Vote,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CoverageRow = {
  ano: number;
  ufs: number;
  municipios: number;
  candidatos: number;
  votos: number;
};
type LocalCoverageRow = {
  ano: number;
  locais: number;
  com_bairro: number;
  municipios: number;
};
type SyncRow = {
  municipio: string;
  status: "pending" | "running" | "partial" | "success" | "error";
  total_secoes: number;
  secoes_principais: number;
  secoes_processadas: number;
  erro: string | null;
  updated_at: string;
};

const fmt = (value: number) => Number(value || 0).toLocaleString("pt-BR");
const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "Sem sincronização";

const STATUS_LABEL: Record<SyncRow["status"], string> = {
  pending: "Pendente",
  running: "Sincronizando",
  partial: "Parcial",
  success: "Concluído",
  error: "Erro",
};

function StatusBadge({ status }: { status: SyncRow["status"] }) {
  const variant =
    status === "success" ? "default" : status === "error" ? "destructive" : "secondary";
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>;
}

export default function CoberturaDadosEleitorais() {
  const coverage = useQuery({
    queryKey: ["tse-data-health-coverage", "MS"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_coverage" as any, {
        p_anos: null,
        p_uf: "MS",
        p_municipio: null,
        p_cargo: null,
      });
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({
        ano: Number(row.ano),
        ufs: Number(row.ufs || 0),
        municipios: Number(row.municipios || 0),
        candidatos: Number(row.candidatos || 0),
        votos: Number(row.votos || 0),
      })) as CoverageRow[];
    },
    staleTime: 60_000,
  });

  const localCoverage = useQuery({
    queryKey: ["tse-data-health-local-coverage", "MS"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_local_coverage" as any);
      if (error) throw error;
      return ((data || []) as any[])
        .filter((row) => row.uf === "MS")
        .map((row) => ({
          ano: Number(row.ano),
          locais: Number(row.locais || 0),
          com_bairro: Number(row.com_bairro || 0),
          municipios: Number(row.municipios || 0),
        })) as LocalCoverageRow[];
    },
    staleTime: 60_000,
  });

  const sectionSync = useQuery({
    queryKey: ["tse-data-health-section-sync", 2026, "MS"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tse_secao_sync_status" as any)
        .select(
          "municipio,status,total_secoes,secoes_principais,secoes_processadas,erro,updated_at",
        )
        .eq("ano", 2026)
        .eq("turno", 1)
        .eq("uf", "MS")
        .order("municipio");
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({
        municipio: String(row.municipio),
        status: row.status,
        total_secoes: Number(row.total_secoes || 0),
        secoes_principais: Number(row.secoes_principais || 0),
        secoes_processadas: Number(row.secoes_processadas || 0),
        erro: row.erro,
        updated_at: row.updated_at,
      })) as SyncRow[];
    },
    staleTime: 30_000,
  });

  const summary = useMemo(() => {
    const rows = sectionSync.data || [];
    return {
      total: rows.length,
      success: rows.filter((row) => row.status === "success").length,
      partial: rows.filter((row) => row.status === "partial" || row.status === "running").length,
      error: rows.filter((row) => row.status === "error").length,
      processed: rows.reduce((sum, row) => sum + row.secoes_processadas, 0),
      expected: rows.reduce((sum, row) => sum + row.secoes_principais, 0),
      updatedAt: rows.reduce<string | null>(
        (latest, row) => (!latest || row.updated_at > latest ? row.updated_at : latest),
        null,
      ),
    };
  }, [sectionSync.data]);

  const errors = [coverage.error, localCoverage.error, sectionSync.error].filter(
    Boolean,
  ) as Error[];
  const loading = coverage.isFetching || localCoverage.isFetching || sectionSync.isFetching;
  const refresh = () =>
    Promise.all([coverage.refetch(), localCoverage.refetch(), sectionSync.refetch()]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={refresh} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar diagnóstico
        </Button>
      </div>

      {errors.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Falha técnica ao consultar a cobertura.</strong>
            <div>{errors.map((error) => error.message).join(" · ")}</div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1.5">
              <Database className="h-4 w-4" /> Anos com dados
            </CardDescription>
            <CardTitle>{coverage.data?.map((row) => row.ano).join(" · ") || "Sem dados"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> Municípios com seção 2026
            </CardDescription>
            <CardTitle>{fmt(summary.total)}</CardTitle>
            <p className="text-xs text-muted-foreground">{fmt(summary.success)} concluídos</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1.5">
              <Vote className="h-4 w-4" /> Boletins processados
            </CardDescription>
            <CardTitle>{fmt(summary.processed)}</CardTitle>
            <p className="text-xs text-muted-foreground">
              de {fmt(summary.expected)} identificados
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" /> Última atualização
            </CardDescription>
            <CardTitle className="text-base">{dateTime(summary.updatedAt)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cobertura de resultados por ano — MS</CardTitle>
          <CardDescription>
            Dados agregados por zona. Zero significa ausência real nessa consulta; falhas aparecem
            no alerta acima.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ano</TableHead>
                <TableHead className="text-right">Municípios</TableHead>
                <TableHead className="text-right">Candidatos</TableHead>
                <TableHead className="text-right">Votos</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(coverage.data || []).map((row) => (
                <TableRow key={row.ano}>
                  <TableCell className="font-semibold">{row.ano}</TableCell>
                  <TableCell className="text-right">{fmt(row.municipios)}</TableCell>
                  <TableCell className="text-right">{fmt(row.candidatos)}</TableCell>
                  <TableCell className="text-right">{fmt(row.votos)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1 text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Disponível
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!coverage.isLoading && (coverage.data || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhum resultado encontrado para MS.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Locais com escola e bairro</CardTitle>
            <CardDescription>
              Essa base contextualiza as seções com endereço e bairro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(localCoverage.data || []).map((row) => {
              const value = row.locais > 0 ? (100 * row.com_bairro) / row.locais : 0;
              return (
                <div key={row.ano} className="space-y-1.5 rounded-lg border p-3">
                  <div className="flex justify-between text-sm">
                    <strong>{row.ano}</strong>
                    <span>
                      {fmt(row.com_bairro)} de {fmt(row.locais)} com bairro
                    </span>
                  </div>
                  <Progress value={value} />
                  <p className="text-xs text-muted-foreground">
                    {fmt(row.municipios)} município(s)
                  </p>
                </div>
              );
            })}
            {!localCoverage.isLoading && (localCoverage.data || []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma base de locais disponível.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sincronização por seção — 2026</CardTitle>
            <CardDescription>Municípios carregados, parciais ou com erro.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-emerald-500/10 p-2">
                <div className="text-lg font-bold text-emerald-700">{summary.success}</div>
                <div className="text-xs">Concluídos</div>
              </div>
              <div className="rounded-md bg-amber-500/10 p-2">
                <div className="text-lg font-bold text-amber-700">{summary.partial}</div>
                <div className="text-xs">Parciais</div>
              </div>
              <div className="rounded-md bg-destructive/10 p-2">
                <div className="text-lg font-bold text-destructive">{summary.error}</div>
                <div className="text-xs">Com erro</div>
              </div>
            </div>
            <div className="max-h-80 overflow-auto rounded-md border">
              {(sectionSync.data || []).map((row) => (
                <div
                  key={row.municipio}
                  className="flex items-center justify-between gap-3 border-b p-3 text-sm last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.municipio}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmt(row.secoes_processadas)} de {fmt(row.secoes_principais)} boletins
                      {row.erro ? ` · ${row.erro}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
              ))}
              {!sectionSync.isLoading && (sectionSync.data || []).length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">
                  Nenhuma cidade teve a carga por seção iniciada.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

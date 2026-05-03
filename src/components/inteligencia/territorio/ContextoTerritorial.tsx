import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  RefreshCw, Info, MapPin, Search, ChevronDown, AlertTriangle, Heart, GraduationCap,
  DollarSign, Users, Building2, Droplets, TrendingUp, TrendingDown, Minus, Trophy,
} from "lucide-react";

const fmt = (n: number | null | undefined, casas = 2) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: casas });

const AREA_ICON: Record<string, any> = {
  saude: Heart,
  educacao: GraduationCap,
  economia: DollarSign,
  social: Users,
  infra: Droplets,
  demografia: Building2,
};
const AREA_LABEL: Record<string, string> = {
  saude: "Saúde",
  educacao: "Educação",
  economia: "Economia",
  social: "Social",
  infra: "Infraestrutura",
  demografia: "Demografia",
};

export default function ContextoTerritorial() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [ufFiltro, setUfFiltro] = useState("");

  const { data: municipios, isLoading } = useQuery({
    queryKey: ["municipios-indicadores", ufFiltro, busca],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("municipios_indicadores" as any)
        .select("*")
        .order("populacao", { ascending: false, nullsFirst: false })
        .limit(100);
      if (ufFiltro) q = q.eq("uf", ufFiltro.toUpperCase());
      if (busca) q = q.ilike("nome", `%${busca}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // Ranking estadual: agrupa estatísticas por código IBGE → indicador
  const { data: rankingMap } = useQuery({
    queryKey: ["municipios-ranking", ufFiltro],
    staleTime: 60_000,
    enabled: !!ufFiltro && (municipios?.length ?? 0) > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("municipios_ranking_uf" as any, {
        p_uf: ufFiltro.toUpperCase(),
      });
      if (error) throw error;
      const map: Record<string, Record<string, any>> = {};
      for (const row of (data as any[]) || []) {
        const k = String(row.codigo_ibge);
        if (!map[k]) map[k] = {};
        map[k][row.indicador_id] = row;
      }
      return map;
    },
  });

  const { data: ultimoLog } = useQuery({
    queryKey: ["municipios-sync-log-last"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase
        .from("municipios_sync_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  const syncUf = useMutation({
    mutationFn: async (uf: string) => {
      const { data, error } = await supabase.functions.invoke("municipios-indicadores-sync", {
        body: { uf },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(
        `${data.processados} municípios sincronizados (${data.indicadores_coletados} indicadores)`,
      );
      qc.invalidateQueries({ queryKey: ["municipios-indicadores"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>30+ indicadores oficiais por município</strong> — Atlas Brasil (IDH, renda,
          longevidade, pobreza), INEP (IDEB, matrículas, docentes), DATASUS (mortalidade infantil,
          CNES) e SNIS (esgoto, água canalizada). Filtre por UF para ver{" "}
          <strong>posição no ranking estadual</strong> e{" "}
          <strong>comparativo com a média do estado</strong> em cada indicador. Dados &gt;3 anos
          ficam marcados e não entram na narrativa de IA.
        </AlertDescription>
      </Alert>

      {/* Coleta */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coletar dados completos de uma UF</CardTitle>
          <CardDescription className="text-xs">
            Puxa todos os municípios da UF do Painel IBGE Cidades — população, PIB, IDH, IDEB,
            mortalidade, esgoto, etc. Pode levar até 1 minuto para estados grandes (rode novamente
            se aparecer "timeout").
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="UF (ex: MS, SP, RJ)"
              maxLength={2}
              className="max-w-[140px]"
              id="uf-coleta"
            />
            <Button
              onClick={() => {
                const el = document.getElementById("uf-coleta") as HTMLInputElement;
                const uf = el?.value?.toUpperCase().trim();
                if (!uf || uf.length !== 2) {
                  toast.error("Informe uma UF válida (ex: MS)");
                  return;
                }
                syncUf.mutate(uf);
              }}
              disabled={syncUf.isPending}
              className="gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${syncUf.isPending ? "animate-spin" : ""}`} />
              {syncUf.isPending ? "Coletando..." : "Coletar"}
            </Button>
          </div>
          {ultimoLog && (
            <p className="text-xs text-muted-foreground mt-3">
              Última coleta: {new Date(ultimoLog.created_at).toLocaleString("pt-BR")} ·{" "}
              <span
                className={
                  ultimoLog.status === "success"
                    ? "text-green-600"
                    : ultimoLog.status === "partial"
                    ? "text-amber-600"
                    : "text-destructive"
                }
              >
                {ultimoLog.status} ({ultimoLog.municipios_processados} municípios em{" "}
                {Math.round((ultimoLog.duracao_ms || 0) / 1000)}s)
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar município..."
            className="pl-8"
          />
        </div>
        <Input
          value={ufFiltro}
          onChange={(e) => setUfFiltro(e.target.value.toUpperCase())}
          placeholder="UF"
          maxLength={2}
          className="max-w-[100px]"
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : municipios?.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum município indexado ainda.</p>
            <p className="text-xs mt-2">Use o coletor acima para puxar uma UF.</p>
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider>
          <div className="grid gap-3">
            {municipios?.map((m: any) => (
              <MunicipioCard
                key={m.id}
                m={m}
                ranking={rankingMap?.[String(m.codigo_ibge)]}
                temRanking={!!ufFiltro}
              />
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

function MunicipioCard({
  m,
  ranking,
  temRanking,
}: {
  m: any;
  ranking?: Record<string, any>;
  temRanking: boolean;
}) {
  const [open, setOpen] = useState(false);
  const indicadores: Record<string, any> = m.indicadores || {};
  const lista = Object.values(indicadores) as any[];
  const recentes = lista.filter((i) => !i.outdated);
  const antigos = lista.filter((i) => i.outdated);

  // Agrupa por área
  const porArea: Record<string, any[]> = {};
  for (const i of recentes) {
    if (!porArea[i.area]) porArea[i.area] = [];
    porArea[i.area].push(i);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              {m.nome}
              <span className="text-xs text-muted-foreground font-normal">/ {m.uf}</span>
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {fmt(m.populacao, 0)} hab.
              {m.populacao_ano ? ` (${m.populacao_ano})` : ""} ·{" "}
              {recentes.length} indicadores recentes
              {antigos.length > 0 && (
                <span className="text-amber-600"> · {antigos.length} desatualizados</span>
              )}
            </CardDescription>
          </div>
          {m.idh != null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="cursor-help">
                  IDH {fmt(m.idh, 3)}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>IDH-M ({m.idh_ano})</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {lista.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sem indicadores carregados — rode o coletor para puxar do IBGE.
          </p>
        ) : (
          <>
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between h-8 px-2">
                  <span className="text-xs font-medium">
                    Ver {recentes.length} indicadores recentes
                    {antigos.length > 0 ? ` (+ ${antigos.length} antigos)` : ""}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                {Object.entries(porArea).map(([area, items]) => {
                  const Icon = AREA_ICON[area] || Building2;
                  return (
                    <div key={area} className="space-y-1.5">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Icon className="w-3 h-3" />
                        {AREA_LABEL[area] || area}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {items.map((i: any) => (
                          <IndicadorPill
                            key={i.id}
                            i={i}
                            comparativo={ranking?.[String(i.id)]}
                            temRanking={temRanking}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {antigos.length > 0 && (
                  <div className="pt-2 border-t space-y-1.5">
                    <div className="text-[11px] uppercase tracking-wide text-amber-600 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3" />
                      Dados antigos (&gt;3 anos — não usados na narrativa)
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {antigos.map((i: any) => (
                        <IndicadorPill key={i.id} i={i} antigo />
                      ))}
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function IndicadorPill({
  i,
  antigo,
  comparativo,
  temRanking,
}: {
  i: any;
  antigo?: boolean;
  comparativo?: any;
  temRanking?: boolean;
}) {
  // delta_pct vs média estadual; ajusta cor pelo "higher_is_worse"
  const deltaPct = comparativo?.delta_pct;
  const ehBom =
    deltaPct == null
      ? null
      : i.higher_is_worse
      ? deltaPct < 0 // menor que a média é bom
      : deltaPct > 0; // maior que a média é bom
  const corDelta =
    ehBom == null
      ? "text-muted-foreground"
      : ehBom
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

  // Tendência interna (último vs anterior)
  const tend = i.tendencia;
  const TendIcon = tend
    ? tend.delta > 0
      ? TrendingUp
      : tend.delta < 0
      ? TrendingDown
      : Minus
    : null;
  const tendCor = tend
    ? i.higher_is_worse
      ? tend.delta > 0
        ? "text-rose-500"
        : tend.delta < 0
        ? "text-emerald-500"
        : "text-muted-foreground"
      : tend.delta > 0
      ? "text-emerald-500"
      : tend.delta < 0
      ? "text-rose-500"
      : "text-muted-foreground"
    : "text-muted-foreground";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`rounded border p-2 text-xs cursor-help ${
            antigo ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200/40" : "bg-card/50"
          }`}
        >
          <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
            <span className="truncate">{i.label}</span>
            {TendIcon && (
              <TendIcon className={`w-2.5 h-2.5 shrink-0 ${tendCor}`} />
            )}
          </div>
          <div className="font-semibold mt-0.5 truncate">
            {fmt(i.valor)}{" "}
            <span className="text-[10px] font-normal text-muted-foreground">{i.unidade}</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between gap-1">
            <span>{i.ano}</span>
            {comparativo && temRanking && (
              <span className="flex items-center gap-1">
                <Trophy className="w-2.5 h-2.5" />
                <span>
                  {comparativo.posicao}º/{comparativo.total_uf}
                </span>
              </span>
            )}
          </div>
          {comparativo && temRanking && deltaPct != null && (
            <div className={`text-[10px] mt-0.5 font-medium ${corDelta}`}>
              {deltaPct > 0 ? "+" : ""}
              {fmt(deltaPct, 1)}% vs média
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1 text-xs">
          <div className="font-semibold">
            {i.label} ({i.ano})
          </div>
          <div>{i.fonte}</div>
          {comparativo && temRanking && (
            <>
              <div className="border-t pt-1 mt-1">
                <div>
                  Média estadual: <strong>{fmt(comparativo.media_uf)}</strong> {i.unidade}
                </div>
                <div>
                  Mín/Máx: {fmt(comparativo.min_uf)} / {fmt(comparativo.max_uf)}
                </div>
                <div>
                  Posição:{" "}
                  <strong>
                    {comparativo.posicao}º de {comparativo.total_uf}
                  </strong>{" "}
                  ({i.higher_is_worse ? "1º = pior" : "1º = melhor"})
                </div>
                <div>Percentil: {fmt(comparativo.percentil, 1)}</div>
              </div>
            </>
          )}
          {tend && (
            <div className="border-t pt-1 mt-1">
              Tendência: {fmt(tend.valor_anterior)} ({tend.ano_anterior}) →{" "}
              {fmt(i.valor)} ({i.ano})
              {tend.delta_pct != null && (
                <>
                  {" "}
                  ({tend.delta > 0 ? "+" : ""}
                  {fmt(tend.delta_pct, 1)}%)
                </>
              )}
            </div>
          )}
          {antigo && (
            <div className="text-amber-600 border-t pt-1 mt-1">
              {i.idade_anos} anos — não usado na narrativa
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

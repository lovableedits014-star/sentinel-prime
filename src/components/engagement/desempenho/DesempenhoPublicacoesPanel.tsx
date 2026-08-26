import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Gauge, Grid3x3, Megaphone, RefreshCw, TrendingUp } from "lucide-react";
import { fetchAudiences } from "@/lib/mission-audiences";
import {
  fetchEquipeDesempenho, fetchPubKpis, fetchPublicacoesDesempenho,
} from "@/lib/engagement-desempenho";
import MonitorKpisHeader from "./MonitorKpisHeader";
import MonitorCharts from "./MonitorCharts";
import PublicacoesDesempenhoPanel from "./PublicacoesDesempenhoPanel";
import EquipeRankingPanel from "./EquipeRankingPanel";
import MatrizCumprimentoPanel from "./MatrizCumprimentoPanel";

export default function DesempenhoPublicacoesPanel({ clientId }: { clientId: string }) {
  const [dias, setDias] = useState(30);
  const [audienceId, setAudienceId] = useState<string>("padrao");
  const aud = audienceId === "padrao" ? null : audienceId;
  const periodoLabel = `${dias}d`;

  const audiences = useQuery({
    queryKey: ["mission-audiences", clientId],
    queryFn: () => fetchAudiences(clientId),
    enabled: !!clientId,
  });

  const kpis = useQuery({
    queryKey: ["eng-pub-kpis", clientId, dias, aud],
    queryFn: () => fetchPubKpis(clientId, dias, aud),
    enabled: !!clientId,
  });

  const publicacoes = useQuery({
    queryKey: ["eng-pub-desempenho", clientId, dias, aud],
    queryFn: () => fetchPublicacoesDesempenho(clientId, dias, aud),
    enabled: !!clientId,
  });

  const equipe = useQuery({
    queryKey: ["eng-equipe-desempenho", clientId, dias, aud],
    queryFn: () => fetchEquipeDesempenho(clientId, dias, aud),
    enabled: !!clientId,
  });

  const carregando = kpis.isLoading || publicacoes.isLoading || equipe.isLoading;
  const erro = kpis.error || publicacoes.error || equipe.error;

  const recarregar = () => {
    kpis.refetch();
    publicacoes.refetch();
    equipe.refetch();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" /> Desempenho da equipe nas publicações
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Conta <strong>todas</strong> as publicações do período e reúne as provas de cumprimento em um só lugar:
            <strong> E1</strong> comprovado pela API ou clique na rede, <strong>E2</strong> confirmado no portal ou
            check-in, <strong>E3</strong> evidência anexada. Quem abriu o link e não confirmou aparece separado de quem
            nunca abriu.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3 px-3 sm:px-6">
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
                <SelectItem value="180">180 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lista de obrigados</Label>
            <Select value={audienceId} onValueChange={setAudienceId}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="padrao">Padrão (estrutura + contratos)</SelectItem>
                {(audiences.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={recarregar} disabled={carregando} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </CardContent>
      </Card>

      {erro && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            Erro ao carregar o desempenho: {(erro as Error).message}
          </CardContent>
        </Card>
      )}

      {carregando ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <MonitorKpisHeader kpis={kpis.data ?? null} />
          <MonitorCharts
            kpis={kpis.data ?? null}
            publicacoes={publicacoes.data ?? []}
            pessoas={equipe.data ?? []}
          />

          <Tabs defaultValue="publicacoes" className="space-y-4">
            <TabsList>
              <TabsTrigger value="publicacoes" className="gap-1.5 text-xs sm:text-sm">
                <Megaphone className="h-4 w-4" /> Publicações
              </TabsTrigger>
              <TabsTrigger value="equipe" className="gap-1.5 text-xs sm:text-sm">
                <TrendingUp className="h-4 w-4" /> Ranking da equipe
              </TabsTrigger>
              <TabsTrigger value="matriz" className="gap-1.5 text-xs sm:text-sm">
                <Grid3x3 className="h-4 w-4" /> Matriz
              </TabsTrigger>
            </TabsList>

            <TabsContent value="publicacoes">
              <PublicacoesDesempenhoPanel
                clientId={clientId}
                audienceId={aud}
                rows={publicacoes.data ?? []}
                periodoLabel={periodoLabel}
              />
            </TabsContent>

            <TabsContent value="equipe">
              <EquipeRankingPanel rows={equipe.data ?? []} periodoLabel={periodoLabel} />
            </TabsContent>

            <TabsContent value="matriz">
              <MatrizCumprimentoPanel
                pessoas={equipe.data ?? []}
                publicacoes={publicacoes.data ?? []}
                periodoLabel={periodoLabel}
              />
            </TabsContent>
          </Tabs>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" /> Base: publicações não arquivadas do período, confirmações do portal,
            check-ins, cliques rastreados nas redes e obrigações/evidências.
          </p>
        </>
      )}
    </div>
  );
}

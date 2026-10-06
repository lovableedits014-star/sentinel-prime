import { lazy, Suspense, useState } from "react";
import {
  Activity,
  BarChart3,
  CircleDollarSign,
  Database,
  FileCheck2,
  Flag,
  History,
  Megaphone,
  Vote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";

const RelatorioEleicao2026 = lazy(
  () => import("@/components/inteligencia/PainelComparativoEleitoral2026"),
);
const CustoRegionalEleitoral = lazy(
  () => import("@/components/inteligencia/CustoRegionalEleitoral"),
);
const ComparativoCiclosEleitorais = lazy(
  () => import("@/components/inteligencia/ComparativoCiclosEleitorais"),
);
const CoberturaDadosEleitorais = lazy(
  () => import("@/components/inteligencia/CoberturaDadosEleitorais"),
);
const RadarParlamentar = lazy(
  () => import("@/components/inteligencia/parlamentar/RadarParlamentar"),
);
const BandeiraAutismoMS = lazy(
  () => import("@/components/inteligencia/bandeira/BandeiraAutismoMS"),
);
const NarrativaPolitica = lazy(
  () => import("@/components/inteligencia/narrativa/NarrativaPolitica"),
);

type AreaId = "resultado" | "eficiencia" | "historico" | "estrategia" | "dados";

function LoadingPanel() {
  return <div className="h-40 animate-pulse rounded-xl border bg-muted/40" />;
}

function AreaIntro({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="border-primary/20 bg-primary/[0.025]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
        <CardDescription className="max-w-4xl">{description}</CardDescription>
      </CardHeader>
      {children && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

export default function InteligenciaEleitoral() {
  const { data: clientId = null } = useCurrentClientId();
  const [area, setArea] = useState<AreaId>("resultado");

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="space-y-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
            <Vote className="h-7 w-7 text-primary" />
            Inteligência Eleitoral
          </h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground md:text-base">
            Consulte o resultado oficial, descubra onde o candidato recebeu votos e confronte o
            desempenho territorial com o investimento da campanha.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="gap-1">
            <FileCheck2 className="h-3 w-3" /> Resultado atual: 2026
          </Badge>
          <Badge variant="secondary">Histórico estadual/federal: 2022 × 2026</Badge>
          <Badge variant="outline">Contexto municipal: 2024</Badge>
        </div>
      </header>

      <Tabs value={area} onValueChange={(value) => setArea(value as AreaId)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 md:grid-cols-5">
          <TabsTrigger value="resultado" className="gap-1.5 py-2.5">
            <Vote className="h-4 w-4" /> Comparar candidatos
          </TabsTrigger>
          <TabsTrigger value="eficiencia" className="gap-1.5 py-2.5">
            <CircleDollarSign className="h-4 w-4" /> Relatório gerencial
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5 py-2.5">
            <History className="h-4 w-4" /> Histórico
          </TabsTrigger>
          <TabsTrigger value="estrategia" className="gap-1.5 py-2.5">
            <Megaphone className="h-4 w-4" /> Estratégia
          </TabsTrigger>
          <TabsTrigger value="dados" className="col-span-2 gap-1.5 py-2.5 md:col-span-1">
            <Database className="h-4 w-4" /> Dados e cobertura
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resultado" className="mt-4 space-y-4">
          <AreaIntro
            icon={<Vote className="h-5 w-5 text-primary" />}
            title="Comparação de vários candidatos"
            description="Marque 2, 3, 5 ou mais candidatos e compare lado a lado por cidade, região, bairro, zona, seção e local de votação. A mesma seleção é exportada em um único Excel ou PDF."
          />
          <Suspense fallback={<LoadingPanel />}>
            <RelatorioEleicao2026 />
          </Suspense>
        </TabsContent>

        <TabsContent value="eficiencia" className="mt-4 space-y-4">
          <AreaIntro
            icon={<CircleDollarSign className="h-5 w-5 text-primary" />}
            title="Relatório gerencial: investimento × resultado"
            description="Relatório para apresentação com região, coordenador, investimento, votos, custo por voto, participação no total e ranking das regiões mais e menos eficientes. Exporta em Excel e PDF."
          />
          <Suspense fallback={<LoadingPanel />}>
            <CustoRegionalEleitoral />
          </Suspense>
        </TabsContent>

        <TabsContent value="historico" className="mt-4 space-y-4">
          <AreaIntro
            icon={<BarChart3 className="h-5 w-5 text-primary" />}
            title="Evolução estadual e federal"
            description="Compara eleições equivalentes: deputado estadual ou federal em 2022 contra o mesmo cargo em 2026. A eleição municipal de 2024 não é somada a esses resultados."
          />
          <Suspense fallback={<LoadingPanel />}>
            <ComparativoCiclosEleitorais />
          </Suspense>
        </TabsContent>

        <TabsContent value="estrategia" className="mt-4 space-y-4">
          <AreaIntro
            icon={<Megaphone className="h-5 w-5 text-primary" />}
            title="Estratégia de campanha"
            description="Atividade parlamentar, bandeiras e produção de narrativa ficam reunidas aqui, separadas da consulta operacional de votos."
          />
          <Tabs defaultValue="parlamentar">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="parlamentar" className="gap-1.5">
                <Activity className="h-4 w-4" /> Atividade parlamentar
              </TabsTrigger>
              <TabsTrigger value="bandeira" className="gap-1.5">
                <Flag className="h-4 w-4" /> Bandeira
              </TabsTrigger>
              <TabsTrigger value="dossie" className="gap-1.5">
                <Megaphone className="h-4 w-4" /> Dossiê e narrativa
              </TabsTrigger>
            </TabsList>
            <TabsContent value="parlamentar" className="mt-4">
              <Suspense fallback={<LoadingPanel />}>
                <RadarParlamentar clientId={clientId} />
              </Suspense>
            </TabsContent>
            <TabsContent value="bandeira" className="mt-4">
              <Suspense fallback={<LoadingPanel />}>
                <BandeiraAutismoMS />
              </Suspense>
            </TabsContent>
            <TabsContent value="dossie" className="mt-4">
              <Suspense fallback={<LoadingPanel />}>
                <NarrativaPolitica />
              </Suspense>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="dados" className="mt-4 space-y-4">
          <AreaIntro
            icon={<Database className="h-5 w-5 text-primary" />}
            title="Cobertura, sincronização e integridade"
            description="Mostra o que realmente existe no banco por ano e granularidade. Ausência de dados, carga parcial e erro técnico são estados diferentes."
          />
          <Suspense fallback={<LoadingPanel />}>
            <CoberturaDadosEleitorais />
          </Suspense>
        </TabsContent>
      </Tabs>

      <p className="pt-2 text-center text-xs text-muted-foreground">
        Fontes: TSE · Câmara dos Deputados · Senado Federal · IBGE · CNES/DataSUS · INEP
      </p>
    </div>
  );
}

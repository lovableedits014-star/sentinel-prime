import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Vote, Map as MapIcon, Users, Flag, Megaphone, Database,
  Trophy, MapPin, Building2, Network, LayoutGrid, Target, Brain, Plus,
} from "lucide-react";
import ComposicaoChapa from "@/components/inteligencia/ComposicaoChapa";
import CompararCandidatos from "@/components/inteligencia/CompararCandidatos";
import EvolucaoPartidos from "@/components/inteligencia/EvolucaoPartidos";
import MapaCalorMunicipios from "@/components/inteligencia/MapaCalorMunicipios";
import SimuladorChapa from "@/components/inteligencia/SimuladorChapa";
import CampoGrandeAnalise from "@/components/inteligencia/cg/CampoGrandeAnalise";
import { EleitoralFiltersProvider, useEleitoralFilters } from "@/components/inteligencia/_shared/EleitoralFiltersContext";
import EleitoralScopeBar from "@/components/inteligencia/_shared/EleitoralScopeBar";
import EtapaHeader from "@/components/inteligencia/_shared/EtapaHeader";
import MunicipioContextoIBGE from "@/components/ibge/MunicipioContextoIBGE";
import NarrativaPolitica from "@/components/inteligencia/narrativa/NarrativaPolitica";
import RadarParlamentar from "@/components/inteligencia/parlamentar/RadarParlamentar";
import BandeiraAutismoMS from "@/components/inteligencia/bandeira/BandeiraAutismoMS";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";

type CoverageRow = { ano: number; ufs: number; municipios: number; candidatos: number; votos: number };
const fmt = (n: number) => n.toLocaleString("pt-BR");

type EtapaId = "territorio" | "adversarios" | "bandeira" | "dossie";

const ETAPAS: { id: EtapaId; numero: number; label: string; icone: any }[] = [
  { id: "territorio",  numero: 1, label: "Território",  icone: MapIcon },
  { id: "adversarios", numero: 2, label: "Adversários", icone: Users },
  { id: "bandeira",    numero: 3, label: "Bandeira",    icone: Flag },
  { id: "dossie",      numero: 4, label: "Dossiê",      icone: Megaphone },
];

const InteligenciaEleitoralInner = () => {
  const f = useEleitoralFilters();
  const { data: clientId = null } = useCurrentClientId();
  const [etapa, setEtapa] = useState<EtapaId>("territorio");

  const isCampoGrande = f.uf === "MS" && f.municipio === "Campo Grande";

  const { data: coverage } = useQuery<CoverageRow[]>({
    queryKey: ["tse-coverage-global", f.uf, f.municipio, f.anoMode, f.cargo],
    staleTime: Infinity,
    queryFn: async () => {
      const PAGE = 1000;
      const MAX_ROWS = 200000;
      let from = 0;
      const all: any[] = [];
      while (from < MAX_ROWS) {
        let q: any = supabase
          .from("tse_votacao_zona" as any)
          .select("ano,uf,cod_municipio,numero,partido,votos,cargo,municipio")
          .range(from, from + PAGE - 1);
        if (f.uf !== "__all__") q = q.eq("uf", f.uf);
        if (f.municipio !== "__all__") q = q.eq("municipio", f.municipio);
        if (f.cargo !== "__all__") q = q.eq("cargo", f.cargo);
        if (f.anoMode !== "ambos") q = q.eq("ano", Number(f.anoMode));
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data as any[]) || [];
        all.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      const byAno = new Map<number, { ufs: Set<string>; munis: Set<number>; cands: Set<string>; votos: number }>();
      all.forEach((r) => {
        if (!byAno.has(r.ano)) byAno.set(r.ano, { ufs: new Set(), munis: new Set(), cands: new Set(), votos: 0 });
        const b = byAno.get(r.ano)!;
        if (r.uf) b.ufs.add(r.uf);
        if (r.cod_municipio) b.munis.add(r.cod_municipio);
        if (r.numero) b.cands.add(`${r.numero}-${r.partido || ""}`);
        b.votos += Number(r.votos || 0);
      });
      return Array.from(byAno.entries())
        .map(([ano, b]) => ({ ano, ufs: b.ufs.size, municipios: b.munis.size, candidatos: b.cands.size, votos: b.votos }))
        .sort((a, b) => a.ano - b.ano);
    },
  });

  const totalVotos = (coverage || []).reduce((s, r) => s + r.votos, 0);
  const totalMunicipios = Math.max(0, ...(coverage || []).map((r) => r.municipios));
  const totalCandidatos = (coverage || []).reduce((s, r) => s + r.candidatos, 0);
  const anosCobertos = (coverage || []).map((r) => r.ano);

  const escopoLabel = useMemo(() => {
    const partes: string[] = [];
    partes.push(f.uf === "__all__" ? "Brasil" : f.uf);
    if (f.municipio !== "__all__") partes.push(f.municipio);
    partes.push(f.cargo === "__all__" ? "todos cargos" : f.cargo);
    partes.push(f.anoMode === "ambos" ? "2022+2024" : f.anoMode);
    return partes.join(" · ");
  }, [f]);

  // Navegação entre etapas
  const goNext = (atual: EtapaId): EtapaId | null => {
    const idx = ETAPAS.findIndex((e) => e.id === atual);
    return idx < ETAPAS.length - 1 ? ETAPAS[idx + 1].id : null;
  };
  const proxima = (atual: EtapaId) => {
    const next = goNext(atual);
    if (next) {
      setEtapa(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const proximaLabel = (atual: EtapaId) => {
    const next = goNext(atual);
    if (!next) return undefined;
    const n = ETAPAS.find((e) => e.id === next)!;
    return `Etapa ${n.numero}: ${n.label}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header com explicação geral do funil */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Vote className="w-7 h-7 text-primary" />
            Inteligência Eleitoral
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Funil estratégico em 4 etapas. Você responde: <strong>onde estão meus votos</strong>,{" "}
            <strong>contra quem disputo</strong>, <strong>qual é minha bandeira</strong>, e a IA monta o{" "}
            <strong>dossiê de campanha</strong> pronto pra usar em discurso, redes e agenda de visita.
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="secondary" className="gap-1">
              <Database className="w-3 h-3" />
              TSE {anosCobertos.length > 0 ? anosCobertos.join(" + ") : "—"}
            </Badge>
            {coverage?.map((c) => (
              <Badge key={c.ano} variant="outline" className="text-xs">
                {c.ano}: {c.ufs} UF · {fmt(c.municipios)} municípios
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Filtros globais */}
      <EleitoralScopeBar />

      {/* KPIs contextuais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Trophy className="w-4 h-4" /> Total de votos · {escopoLabel}</CardDescription>
            <CardTitle className="text-2xl">{fmt(totalVotos)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Users className="w-4 h-4" /> Candidatos</CardDescription>
            <CardTitle className="text-2xl">{fmt(totalCandidatos)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Municípios</CardDescription>
            <CardTitle className="text-2xl">{fmt(totalMunicipios)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Database className="w-4 h-4" /> Anos cobertos</CardDescription>
            <CardTitle className="text-2xl">{anosCobertos.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Indicador visual do funil */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {ETAPAS.map((e, i) => {
          const ativa = etapa === e.id;
          const Icone = e.icone;
          return (
            <div key={e.id} className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setEtapa(e.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  ativa
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background hover:bg-muted border-border text-muted-foreground"
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${ativa ? "bg-primary-foreground text-primary" : "bg-muted-foreground/20"}`}>
                  {e.numero}
                </span>
                <Icone className="w-3.5 h-3.5" />
                {e.label}
              </button>
              {i < ETAPAS.length - 1 && <span className="text-muted-foreground/40">→</span>}
            </div>
          );
        })}
      </div>

      {/* Conteúdo da etapa */}
      <Tabs value={etapa} onValueChange={(v) => setEtapa(v as EtapaId)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-auto">
          {ETAPAS.map((e) => {
            const Icone = e.icone;
            return (
              <TabsTrigger key={e.id} value={e.id} className="flex items-center gap-2 py-2.5">
                <span className="text-xs font-bold opacity-60">{e.numero}.</span>
                <Icone className="w-4 h-4" />
                <span>{e.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* ============ ETAPA 1 — TERRITÓRIO ============ */}
        <TabsContent value="territorio" className="mt-4 space-y-4">
          <EtapaHeader
            numero={1}
            titulo="Território"
            icone={<MapIcon className="w-5 h-5" />}
            cor="primary"
            oqueE="A foto do mapa eleitoral: onde sua base está hoje, em quais cidades/bairros seu partido cresceu ou caiu, e qual é o perfil socioeconômico de cada lugar."
            paraQueServe="Decidir ONDE investir comício, visita e cabo eleitoral. Identificar cidades viráveis com pouca margem e bairros onde o adversário foi fraco."
            proximoPasso={{ label: proximaLabel("territorio")!, onClick: () => proxima("territorio") }}
          />

          {/* Contexto IBGE só quando município está definido */}
          {f.uf !== "__all__" && f.municipio !== "__all__" && (
            <MunicipioContextoIBGE nome={f.municipio} uf={f.uf} />
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapIcon className="w-4 h-4 text-primary" /> Mapa de calor por município
              </CardTitle>
              <CardDescription>
                Use o filtro acima para mudar UF/cargo/ano. Cores mais quentes = mais votos.
              </CardDescription>
            </CardHeader>
            <CardContent><MapaCalorMunicipios /></CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Network className="w-4 h-4 text-primary" /> Quem subiu / quem caiu (partidos)
              </CardTitle>
              <CardDescription>
                Compara votos do mesmo partido entre 2022 e 2024 no escopo escolhido — mostra para onde a maré política está virando.
              </CardDescription>
            </CardHeader>
            <CardContent><EvolucaoPartidos /></CardContent>
          </Card>

          {/* Análise hiperlocal — só aparece quando o filtro = Campo Grande/MS */}
          {isCampoGrande && (
            <Card className="border-primary/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" /> Análise rua a rua — Campo Grande/MS
                </CardTitle>
                <CardDescription>
                  Granularidade máxima: zona eleitoral, escola, bairro. Disponível porque o filtro está em Campo Grande/MS.
                </CardDescription>
              </CardHeader>
              <CardContent><CampoGrandeAnalise /></CardContent>
            </Card>
          )}
          {!isCampoGrande && f.uf === "MS" && (
            <Card className="border-dashed">
              <CardContent className="pt-4 text-sm text-muted-foreground flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Para ver análise rua a rua (escola/bairro), selecione <strong className="text-foreground">Campo Grande</strong> no filtro de município. É a única cidade com geocodificação por local de votação no momento.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ============ ETAPA 2 — ADVERSÁRIOS ============ */}
        <TabsContent value="adversarios" className="mt-4 space-y-4">
          <EtapaHeader
            numero={2}
            titulo="Adversários"
            icone={<Users className="w-5 h-5" />}
            cor="rose"
            oqueE="Raio-x dos seus concorrentes e potenciais aliados: votação histórica, atividade parlamentar (faltas, projetos, votações), e simulação de cenários de chapa."
            paraQueServe="Saber quem é o REAL ameaça (não só o mais barulhento), de quem trazer pra chapa, e qual munição usar em debate (faltas, propostas opostas, queda de votos)."
            proximoPasso={{ label: proximaLabel("adversarios")!, onClick: () => proxima("adversarios") }}
          />

          <Tabs defaultValue="comparar" className="w-full">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="comparar" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Comparar candidatos</TabsTrigger>
              <TabsTrigger value="composicao" className="gap-1.5"><LayoutGrid className="w-3.5 h-3.5" /> Composição (2022+2024)</TabsTrigger>
              <TabsTrigger value="simulador" className="gap-1.5"><Target className="w-3.5 h-3.5" /> Simulador de chapa</TabsTrigger>
              <TabsTrigger value="parlamentar" className="gap-1.5"><Brain className="w-3.5 h-3.5" /> Atividade parlamentar</TabsTrigger>
            </TabsList>
            <TabsContent value="comparar" className="mt-4"><CompararCandidatos /></TabsContent>
            <TabsContent value="composicao" className="mt-4"><ComposicaoChapa /></TabsContent>
            <TabsContent value="simulador" className="mt-4"><SimuladorChapa /></TabsContent>
            <TabsContent value="parlamentar" className="mt-4"><RadarParlamentar clientId={clientId} /></TabsContent>
          </Tabs>
        </TabsContent>

        {/* ============ ETAPA 3 — BANDEIRA ============ */}
        <TabsContent value="bandeira" className="mt-4 space-y-4">
          <EtapaHeader
            numero={3}
            titulo="Bandeira"
            icone={<Flag className="w-5 h-5" />}
            cor="amber"
            oqueE="A pauta-marca da campanha — o assunto que diferencia você dos demais e em que você tem autoridade pra falar. Hoje a bandeira ativa do candidato é o Autismo (TEA) em Mato Grosso do Sul."
            paraQueServe="Transformar uma agenda em proposta concreta por município (lei CIPTEA, fila zero, CER, escola com AEE). A IA da etapa 4 vai entrelaçar esses dados no dossiê."
            proximoPasso={{ label: proximaLabel("bandeira")!, onClick: () => proxima("bandeira") }}
          />

          <BandeiraAutismoMS />

          <Card className="border-dashed">
            <CardContent className="pt-5 pb-5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Plus className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-medium">Adicionar nova bandeira</div>
                  <div className="text-xs text-muted-foreground">Educação, Segurança, Economia local, Mulheres… cada bandeira vira uma seção própria com dados do município.</div>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled>Em breve</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ ETAPA 4 — DOSSIÊ ============ */}
        <TabsContent value="dossie" className="mt-4 space-y-4">
          <EtapaHeader
            numero={4}
            titulo="Dossiê de Narrativa"
            icone={<Megaphone className="w-5 h-5" />}
            cor="emerald"
            oqueE="A IA junta tudo das etapas 1, 2 e 3 e GERA o material de campanha: PDF executivo, discursos prontos, posts de rede social e plano de visitas por bairro."
            paraQueServe="Sair daqui com material PRONTO pra usar — sem precisar reescrever, sem precisar pesquisar de novo. É o ponto final do funil e a peça mais importante da plataforma."
          />

          <NarrativaPolitica />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground text-center pt-4">
        Fontes: TSE (Tribunal Superior Eleitoral) · Câmara dos Deputados · Senado Federal · IBGE · CNES/DataSUS · INEP.
      </p>
    </div>
  );
};

const InteligenciaEleitoral = () => (
  <EleitoralFiltersProvider>
    <InteligenciaEleitoralInner />
  </EleitoralFiltersProvider>
);

export default InteligenciaEleitoral;

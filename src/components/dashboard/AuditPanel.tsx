import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollText, Database, Filter, Calendar, Calculator, ChevronDown } from "lucide-react";

interface AuditPanelProps {
  clientId: string;
  periodDays: number;
}

interface MetricSource {
  metric: string;
  table: string;
  filters: string[];
  interval: string;
  formula?: string;
}

const IED_SOURCES: MetricSource[] = [
  {
    metric: "Sentimento (peso 30%)",
    table: "comments",
    filters: [
      "client_id = cliente atual",
      "is_page_owner = false",
      "text ≠ '__post_stub__'",
      "sentiment IS NOT NULL",
    ],
    interval: "Últimos 30 dias (comment_created_time)",
    formula: "(positivos×100 + neutros×50 + negativos×0) ÷ total analisado",
  },
  {
    metric: "Crescimento (peso 25%)",
    table: "pessoas",
    filters: ["client_id = cliente atual"],
    interval: "Últimos 30 dias vs 30 anteriores (created_at)",
    formula: "50 + ((novos − anteriores) ÷ anteriores × 100) ÷ 2 — limitado a [0,100]",
  },
  {
    metric: "Engajamento (peso 25%)",
    table: "pessoas + interacoes_pessoa",
    filters: [
      "pessoas.nivel_apoio IN (apoiador, militante)",
      "interacoes_pessoa.criado_em ≥ 30 dias",
    ],
    interval: "Últimos 30 dias",
    formula: "(% apoiador+militante × 0.6) + (% interações por pessoa × 0.4) × 100",
  },
  {
    metric: "Check-in (peso 20%)",
    table: "contratado_checkins + funcionario_checkins",
    filters: [
      "presenca_obrigatoria = true",
      "status = ativo",
      "checkin_at ≥ 30 dias",
    ],
    interval: "Últimos 30 dias",
    formula: "total check-ins ÷ (pessoas obrigatórias × 22 dias úteis) × 100",
  },
];

export function AuditPanel({ clientId, periodDays }: AuditPanelProps) {
  const [open, setOpen] = useState(false);

  const KPI_SOURCES: MetricSource[] = [
    {
      metric: "Base Política",
      table: "pessoas",
      filters: ["client_id = cliente atual"],
      interval: "Total acumulado (sem filtro de data)",
    },
    {
      metric: "Novos em 7 dias",
      table: "pessoas",
      filters: ["client_id = cliente atual", "created_at ≥ 7 dias"],
      interval: "Últimos 7 dias",
    },
    {
      metric: "Apoio comprometido",
      table: "pessoas",
      filters: ["nivel_apoio IN (apoiador, militante)"],
      interval: "Total acumulado",
    },
    {
      metric: "Contratados ativos / Líderes",
      table: "contratados",
      filters: ["status = ativo", "is_lider = true (para líderes)"],
      interval: "Total acumulado",
    },
    {
      metric: "Funcionários ativos",
      table: "funcionarios",
      filters: ["status = ativo"],
      interval: "Total acumulado",
    },
    {
      metric: "Check-ins hoje",
      table: "contratado_checkins + funcionario_checkins",
      filters: ["checkin_date = hoje"],
      interval: "Dia atual",
      formula: "% presença = check-ins hoje ÷ (contratados ativos + funcionários ativos)",
    },
    {
      metric: "Indicados a ligar",
      table: "contratado_indicados",
      filters: ["ligacao_status = pendente"],
      interval: "Total acumulado",
    },
    {
      metric: "Crescimento (gráfico 14d)",
      table: "pessoas",
      filters: ["created_at ≥ 14 dias"],
      interval: "Últimos 14 dias agrupado por dia",
    },
    {
      metric: "Termômetro de Apoio",
      table: "pessoas",
      filters: ["nivel_apoio = militante / apoiador / simpatizante / desconhecido / opositor"],
      interval: "Total acumulado",
    },
    {
      metric: "Top Líderes",
      table: "contratados",
      filters: ["is_lider = true", "status = ativo", "lider_id = ID do líder"],
      interval: "Total acumulado",
    },
    {
      metric: "Aniversariantes",
      table: "pessoas",
      filters: ["data_nascimento com mês/dia = hoje"],
      interval: "Dia atual",
    },
  ];

  const COMMENT_SOURCES: MetricSource[] = [
    {
      metric: "Distribuição de sentimentos",
      table: "comments",
      filters: ["is_page_owner = false", "text ≠ '__post_stub__'"],
      interval: `Últimos ${periodDays} dias (comment_created_time)`,
    },
    {
      metric: "Apoiadores (legado)",
      table: "supporters",
      filters: ["client_id = cliente atual"],
      interval: "Total acumulado",
    },
    {
      metric: "Respondidos / Pendentes",
      table: "comments",
      filters: ["status = responded ou pending", "is_page_owner = false"],
      interval: `Últimos ${periodDays} dias`,
    },
  ];

  return (
    <Card>
      <CardHeader
        className="cursor-pointer pb-3"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Auditoria de Métricas</CardTitle>
            <Badge variant="outline" className="text-[10px]">transparência</Badge>
          </div>
          <Button variant="ghost" size="sm" className="h-7">
            <ChevronDown
              className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </Button>
        </div>
        <CardDescription className="text-xs">
          De onde vem cada número, quais filtros e qual intervalo de tempo é usado.
          Use para conferir se algum KPI parece estranho.
        </CardDescription>
      </CardHeader>

      {open && (
        <CardContent className="pt-0">
          <Accordion type="multiple" defaultValue={["ied"]} className="w-full">
            <AccordionItem value="ied">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-primary" />
                  Índice de Eleitorabilidade Digital (IED)
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <SourcesTable sources={IED_SOURCES} />
                <p className="text-[11px] text-muted-foreground mt-3 px-1">
                  <strong>Score final:</strong> sentimento×0.30 + crescimento×0.25 +
                  engajamento×0.25 + check-in×0.20. Recalculado automaticamente
                  quando o último cálculo tem mais de 24h. Histórico armazenado em{" "}
                  <code className="bg-muted px-1 rounded">ied_scores</code> (1
                  registro por semana ISO).
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="kpis">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  KPIs e gráficos da Visão Executiva
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <SourcesTable sources={KPI_SOURCES} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="comments">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-primary" />
                  Métricas de comentários e gestão de crise
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <SourcesTable sources={COMMENT_SOURCES} />
                <p className="text-[11px] text-muted-foreground mt-3 px-1">
                  O período é controlado pelo seletor no topo do dashboard
                  (atual: <strong>{periodDays} dias</strong>). Comentários do
                  próprio dono da página e stubs de post são sempre excluídos.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="meta">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Notas de cache e atualização
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="text-xs text-muted-foreground space-y-1.5 px-1 list-disc list-inside">
                  <li>
                    KPIs e gráficos da Visão Executiva: cache de{" "}
                    <strong>2-5 minutos</strong> (React Query staleTime).
                  </li>
                  <li>
                    Aniversariantes: cache de <strong>30 minutos</strong>.
                  </li>
                  <li>
                    Comentários: carregados sob demanda; recarregados apenas
                    com "Sincronizar Meta" ou refresh manual.
                  </li>
                  <li>
                    IED: recálculo automático em background se o último score
                    tiver mais de <strong>24 horas</strong>.
                  </li>
                  <li>
                    Cliente atual: <code className="bg-muted px-1 rounded">{clientId}</code>
                  </li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      )}
    </Card>
  );
}

function SourcesTable({ sources }: { sources: MetricSource[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Métrica</th>
            <th className="py-2 pr-3 font-medium">Tabela</th>
            <th className="py-2 pr-3 font-medium">Filtros</th>
            <th className="py-2 pr-3 font-medium">Intervalo</th>
            <th className="py-2 font-medium">Fórmula</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.metric} className="border-b last:border-0 align-top">
              <td className="py-2 pr-3 font-medium">{s.metric}</td>
              <td className="py-2 pr-3">
                <code className="bg-muted px-1 py-0.5 rounded text-[10px]">
                  {s.table}
                </code>
              </td>
              <td className="py-2 pr-3">
                <ul className="space-y-0.5">
                  {s.filters.map((f, i) => (
                    <li key={i} className="text-muted-foreground">
                      • {f}
                    </li>
                  ))}
                </ul>
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{s.interval}</td>
              <td className="py-2 text-muted-foreground">
                {s.formula ? (
                  <code className="bg-muted px-1 py-0.5 rounded text-[10px] whitespace-nowrap">
                    {s.formula}
                  </code>
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
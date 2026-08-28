import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Gauge,
  Headphones,
  ListChecks,
  Loader2,
  Phone,
  RefreshCw,
  Settings as SettingsIcon,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { supabase } from "@/integrations/supabase/client";

type ReportRow = {
  contato_id: string;
  tabela: string;
  origem: string;
  ligacao_status: string | null;
  proxima_tentativa_em: string | null;
};
type CallRow = {
  id: string;
  operador_id: string | null;
  operador_nome: string;
  created_at: string;
  ligacao_status: string;
  vota_candidato: string | null;
  tabela: string;
  contato_id: string;
};
type OperatorActivity = {
  key: string;
  nome: string;
  tentativas: number;
  atendidas: number;
  ultima: string;
};

const PAGE_SIZE = 1000;
const pct = (value: number, total: number) => (total ? Math.round((value / total) * 1000) / 10 : 0);
const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};
const fmtTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const operatorKey = (row: CallRow) =>
  row.operador_id || `nome:${row.operador_nome.trim().toLocaleLowerCase("pt-BR")}`;

async function fetchAllRpc<T>(name: string, params: Record<string, unknown>, orders: string[]) {
  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    let query = supabase.rpc(name as never, params as never);
    orders.forEach((column) => {
      query = query.order(column, { ascending: true });
    });
    const { data, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    const part = ((data as unknown[]) || []) as T[];
    rows.push(...part);
    if (part.length < PAGE_SIZE) return rows;
  }
}

export default function TelemarketingAdmin() {
  const { clientId, isLoading: loadingClient, needsClientSelection } = useActiveClientId();
  const [contacts, setContacts] = useState<ReportRow[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [operatorCount, setOperatorCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    const from = startOfToday();
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    try {
      const [reportRows, callRows, operators] = await Promise.all([
        fetchAllRpc<ReportRow>(
          "tele_fila_report_rows_v2",
          { _client_id: clientId, _campanha_id: null },
          ["tabela", "contato_id"],
        ),
        fetchAllRpc<CallRow>(
          "tele_produtividade_ligacoes",
          {
            _client_id: clientId,
            _inicio: from.toISOString(),
            _fim: to.toISOString(),
            _campanha_id: null,
          },
          ["created_at", "id"],
        ),
        supabase
          .from("telemarketing_operadores")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .eq("ativo", true),
      ]);
      if (operators.error) throw operators.error;
      setContacts(reportRows);
      setCalls(callRows);
      setOperatorCount(operators.count || 0);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Falha ao carregar os indicadores.";
      setError(message);
      toast.error(`Não foi possível carregar a visão geral: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const attended = calls.filter((row) => row.ligacao_status === "atendeu").length;
    const conversions = calls.filter(
      (row) => row.ligacao_status === "atendeu" && row.vota_candidato === "sim",
    ).length;
    const pending = contacts.filter(
      (row) => !row.ligacao_status || row.ligacao_status === "pendente",
    ).length;
    const overdue = contacts.filter(
      (row) => row.proxima_tentativa_em && new Date(row.proxima_tentativa_em) < new Date(),
    ).length;
    return {
      attended,
      conversions,
      pending,
      overdue,
      attendance: pct(attended, calls.length),
      conversion: pct(conversions, attended),
    };
  }, [calls, contacts]);

  const operators = useMemo(() => {
    const grouped = new Map<string, OperatorActivity>();
    calls.forEach((row) => {
      const key = operatorKey(row);
      const item = grouped.get(key) || {
        key,
        nome: row.operador_nome || "Operador não identificado",
        tentativas: 0,
        atendidas: 0,
        ultima: row.created_at,
      };
      item.tentativas += 1;
      if (row.ligacao_status === "atendeu") item.atendidas += 1;
      if (row.created_at > item.ultima) item.ultima = row.created_at;
      grouped.set(key, item);
    });
    return [...grouped.values()].sort((a, b) => b.tentativas - a.tentativas);
  }, [calls]);

  const sources = useMemo(() => {
    const grouped = new Map<string, number>();
    contacts.forEach((row) => grouped.set(row.origem, (grouped.get(row.origem) || 0) + 1));
    return [...grouped.entries()]
      .map(([name, count]) => ({ name, count, share: pct(count, contacts.length) }))
      .sort((a, b) => b.count - a.count);
  }, [contacts]);

  const hours = useMemo(() => {
    const values = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    calls.forEach((row) => {
      values[new Date(row.created_at).getHours()].count += 1;
    });
    const max = Math.max(1, ...values.map((item) => item.count));
    return values.map((item) => ({
      ...item,
      height: Math.max(item.count ? 8 : 2, Math.round((item.count / max) * 72)),
    }));
  }, [calls]);

  if (loadingClient)
    return (
      <div className="p-6">
        <Loader2 className="mx-auto mt-20 size-8 animate-spin text-primary" />
      </div>
    );

  const cards: [string, string | number, LucideIcon, string][] = [
    ["Tentativas", calls.length, Phone, "Cada registro do histórico"],
    ["Atendidas", summary.attended, CheckCircle2, `${summary.attendance}% das tentativas`],
    ["Conversões", summary.conversions, Target, `${summary.conversion}% dos atendidos`],
    [
      "Operadores com atividade",
      operators.length,
      Users,
      `${operatorCount} operadores ativos cadastrados`,
    ],
    ["Pendentes na base", summary.pending, Clock, `${contacts.length} contatos no total`],
    ["Retornos vencidos", summary.overdue, AlertCircle, "Estado atual dos contatos"],
  ];

  return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Headphones className="size-6 text-primary" /> Visão geral do telemarketing
          </h1>
          <p className="text-sm text-muted-foreground">
            Situação atual da base e produção registrada hoje, considerando todas as cinco origens.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading || !clientId}>
            <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button asChild size="sm">
            <Link to="/telemarketing-admin/filas">
              <Phone className="mr-2 size-4" /> Gerenciar filas
            </Link>
          </Button>
        </div>
      </div>
      {needsClientSelection && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Selecione um cliente para visualizar os indicadores.
          </CardContent>
        </Card>
      )}
      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Indicadores indisponíveis</p>
            <p>{error}</p>
          </div>
        </div>
      )}
      {clientId && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Produção de hoje
            </p>
            {loading && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Atualizando
              </span>
            )}
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
            {cards.map(([label, value, Icon, hint]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="size-3.5" />
                    {label}
                  </div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mb-5 grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Atividade dos operadores hoje</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Mostra atividade registrada; não representa presença online.
                </p>
              </CardHeader>
              <CardContent>
                {operators.length ? (
                  <div className="space-y-2">
                    {operators.slice(0, 8).map((operator) => (
                      <div
                        key={operator.key}
                        className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{operator.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            Última atividade às {fmtTime(operator.ultima)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">{operator.tentativas} tentativas</Badge>
                          <Badge variant="outline">{operator.atendidas} atendidas</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma tentativa registrada hoje.
                  </p>
                )}
                {operators.length > 8 && (
                  <Button asChild variant="link" className="mt-2 px-0">
                    <Link to="/telemarketing-admin/produtividade">
                      Ver todos os operadores <ArrowRight className="ml-1 size-4" />
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Volume por hora hoje</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Baseado no histórico de tentativas, inclusive contatos repetidos.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex h-28 items-end gap-1">
                  {hours.map((item) => (
                    <div
                      key={item.hour}
                      className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                      title={`${item.hour}h: ${item.count} tentativas`}
                    >
                      <span className="text-[9px] text-muted-foreground">{item.count || ""}</span>
                      <div
                        className="w-full rounded-t bg-primary/80"
                        style={{ height: item.height }}
                      />
                      <span className="text-[8px] text-muted-foreground">
                        {item.hour % 3 === 0 ? `${item.hour}h` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_2fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Composição da base</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sources.map((source) => (
                  <div key={source.name}>
                    <div className="mb-1 flex justify-between gap-3 text-xs">
                      <span>{source.name}</span>
                      <span className="font-medium">
                        {source.count} ({source.share}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${source.share}%` }}
                      />
                    </div>
                  </div>
                ))}
                {!sources.length && (
                  <p className="py-5 text-center text-sm text-muted-foreground">
                    Base sem contatos.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ações de gestão</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {[
                  [
                    "/telemarketing-admin/produtividade",
                    "Analisar produtividade",
                    "Comparativo e auditoria por operador",
                    Gauge,
                  ],
                  [
                    "/telemarketing-admin/resultados",
                    "Investigar resultados",
                    "Filtrar contatos e exportar CSV",
                    ListChecks,
                  ],
                  [
                    "/telemarketing-admin/relatorios",
                    "Abrir relatórios",
                    "Indicadores consolidados por fila",
                    BarChart3,
                  ],
                  [
                    "/telemarketing-admin/configuracoes",
                    "Configurações",
                    "Acesso público e regras operacionais",
                    SettingsIcon,
                  ],
                ].map(([to, title, text, Icon]) => (
                  <Link
                    key={String(to)}
                    to={String(to)}
                    className="group flex items-center gap-3 rounded-lg border p-3 transition hover:bg-muted/40"
                  >
                    <Icon className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{String(title)}</p>
                      <p className="text-xs text-muted-foreground">{String(text)}</p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

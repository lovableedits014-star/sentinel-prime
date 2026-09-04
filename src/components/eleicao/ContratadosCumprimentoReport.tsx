import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfDay, format, startOfMonth } from "date-fns";
import { AlertCircle, ChevronDown, Download, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type MissionDetail = {
  mission_id: string;
  titulo: string;
  publicado_em: string;
  status: "cumpriu" | "abriu" | "nao_abriu";
  primeiro_acesso_em?: string;
  cumprido_em?: string;
};
type IndicationDetail = {
  id: string;
  nome: string;
  telefone: string;
  cidade?: string;
  bairro?: string;
  origem: string;
  status_telemarketing: string;
  created_at: string;
};
type ReportRow = {
  pessoa_id: string;
  nome: string;
  telefone: string;
  cargo: string;
  escopo: string;
  regiao: string | null;
  cidade: string | null;
  parent_id: string | null;
  responsavel_nome: string | null;
  coordenador_id: string | null;
  coordenador_nome: string | null;
  coordenador_telefone: string | null;
  valor_contratacao: number;
  contratado_em: string;
  missoes: number;
  cumpridas: number;
  abriu_sem_concluir: number;
  nao_abriu: number;
  taxa: number;
  faixa: string;
  ultima_atividade: string | null;
  total_indicados: number;
  meta_indicados: number;
  situacao_lista: string;
  ultima_indicacao_em: string | null;
  missoes_detalhe: MissionDetail[];
  indicados_detalhe: IndicationDetail[];
};

type RpcResult = { data: unknown; error: { message: string } | null };
const reportDb = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

const statusLabel: Record<string, string> = {
  cumprindo: "Cumprindo",
  atencao: "Em atenção",
  baixo: "Baixo cumprimento",
  nao_cumprindo: "Não está cumprindo",
  sem_avaliacao: "Sem avaliação",
};
const listLabel: Record<string, string> = {
  nao_iniciou: "Não iniciou",
  parcial: "Lista parcial",
  completa: "Lista completa",
  acima_meta: "Acima da meta",
};
const badgeClass = (s: string) =>
  s === "cumprindo"
    ? "text-emerald-700 border-emerald-300"
    : s === "atencao"
      ? "text-sky-700 border-sky-300"
      : s === "baixo"
        ? "text-amber-700 border-amber-300"
        : s === "nao_cumprindo"
          ? "text-destructive border-destructive/40"
          : "text-muted-foreground";
const area = (r: ReportRow) =>
  r.escopo === "interior" ? r.cidade || "Sem cidade" : r.regiao || "Sem região";
const n = (v: unknown) => Number(v || 0);

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function ContratadosCumprimentoReport({ clientId }: { clientId: string }) {
  const today = format(endOfDay(new Date()), "yyyy-MM-dd");
  const [inicio, setInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [fim, setFim] = useState(today);
  const [search, setSearch] = useState("");
  const [coordinator, setCoordinator] = useState("all");
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState("all");

  const query = useQuery({
    queryKey: ["election-contract-compliance", clientId, inicio, fim],
    enabled: !!clientId && !!inicio && !!fim && fim >= inicio,
    queryFn: async () => {
      const { data, error } = await reportDb.rpc("election_contract_compliance_report", {
        p_client_id: clientId,
        p_data_inicio: inicio,
        p_data_fim: fim,
      });
      if (error) throw error;
      return ((data || []) as ReportRow[]).map((r) => ({
        ...r,
        missoes_detalhe: Array.isArray(r.missoes_detalhe) ? r.missoes_detalhe : [],
        indicados_detalhe: Array.isArray(r.indicados_detalhe) ? r.indicados_detalhe : [],
      }));
    },
  });
  const rows = useMemo(() => query.data || [], [query.data]);
  const coordinators = useMemo(
    () =>
      Array.from(
        new Map(
          rows
            .filter((r) => r.coordenador_id)
            .map((r) => [r.coordenador_id!, r.coordenador_nome || "Sem nome"]),
        ),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [rows],
  );
  const regions = useMemo(() => Array.from(new Set(rows.map(area))).sort(), [rows]);
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const q = search.trim().toLocaleLowerCase("pt-BR");
        return (
          (coordinator === "all" ||
            (coordinator === "standalone"
              ? !r.coordenador_id
              : r.coordenador_id === coordinator)) &&
          (region === "all" || area(r) === region) &&
          (status === "all" || r.faixa === status) &&
          (!q ||
            [r.nome, r.telefone, r.coordenador_nome, r.responsavel_nome, area(r)].some((v) =>
              (v || "").toLocaleLowerCase("pt-BR").includes(q),
            ))
        );
      }),
    [rows, search, coordinator, region, status],
  );
  const totals = useMemo(
    () => ({
      people: filtered.length,
      missions: filtered.reduce((s, r) => s + n(r.missoes), 0),
      done: filtered.reduce((s, r) => s + n(r.cumpridas), 0),
      opened: filtered.reduce((s, r) => s + n(r.abriu_sem_concluir), 0),
      missed: filtered.reduce((s, r) => s + n(r.nao_abriu), 0),
      indicated: filtered.reduce((s, r) => s + n(r.total_indicados), 0),
      sent: filtered.filter((r) => n(r.total_indicados) > 0).length,
    }),
    [filtered],
  );
  const adherence = totals.missions ? (100 * totals.done) / totals.missions : 0;
  const byCoordinator = useMemo(
    () => groupRows(filtered, (r) => r.coordenador_nome || "Sem coordenador"),
    [filtered],
  );
  const byRegion = useMemo(() => groupRows(filtered, area), [filtered]);

  const exportCsv = () => {
    const header = [
      "Nome",
      "Telefone",
      "Cargo",
      "Coordenador",
      "Responsável direto",
      "Região/Cidade",
      "Missões",
      "Cumpridas",
      "Abriu sem concluir",
      "Não abriu",
      "Taxa",
      "Indicados",
      "Meta",
      "Situação da lista",
    ];
    const body = filtered.map((r) => [
      r.nome,
      r.telefone,
      r.cargo,
      r.coordenador_nome || "Sem coordenador",
      r.responsavel_nome || "",
      area(r),
      r.missoes,
      r.cumpridas,
      r.abriu_sem_concluir,
      r.nao_abriu,
      `${n(r.taxa).toFixed(1)}%`,
      r.total_indicados,
      r.meta_indicados,
      listLabel[r.situacao_lista] || r.situacao_lista,
    ]);
    const blob = new Blob(
      ["\ufeff" + [header, ...body].map((line) => line.map(csvCell).join(";")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-contratados-${inicio}-${fim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (query.isLoading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  if (query.isError)
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex gap-2 pt-6 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <div>
            <p className="font-medium">Não foi possível carregar o relatório.</p>
            <p className="text-sm">{(query.error as Error).message}</p>
          </div>
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Relatório de cumprimento dos contratados</CardTitle>
              <CardDescription>
                Missões e listas de indicados consolidadas pela estrutura da Eleição.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-1">
            <Label htmlFor="report-date-start" className="text-xs">
              Missões de
            </Label>
            <Input
              id="report-date-start"
              type="date"
              value={inicio}
              max={fim}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-date-end" className="text-xs">
              Missões até
            </Label>
            <Input
              id="report-date-end"
              type="date"
              value={fim}
              min={inicio}
              max={today}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
          <Select value={coordinator} onValueChange={setCoordinator}>
            <SelectTrigger>
              <SelectValue placeholder="Coordenador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os coordenadores</SelectItem>
              <SelectItem value="standalone">Sem coordenador</SelectItem>
              {coordinators.map(([id, name]) => (
                <SelectItem value={id} key={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger>
              <SelectValue placeholder="Região" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as regiões</SelectItem>
              {regions.map((v) => (
                <SelectItem value={v} key={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Cumprimento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os resultados</SelectItem>
              {Object.entries(statusLabel).map(([v, l]) => (
                <SelectItem value={v} key={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou telefone"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Metric
          label="Contratados"
          value={totals.people}
          help={`${filtered.filter((r) => !r.coordenador_id).length} sem coordenador`}
        />
        <Metric
          label="Cumprimento"
          value={`${adherence.toFixed(1)}%`}
          help={`${totals.done}/${totals.missions} obrigações`}
        />
        <Metric label="Cumpriram" value={totals.done} help="missões concluídas" good />
        <Metric label="Abriram" value={totals.opened} help="sem concluir" />
        <Metric label="Não abriram" value={totals.missed} help="missões pendentes" danger />
        <Metric
          label="Indicados"
          value={totals.indicated}
          help={`${totals.sent}/${totals.people} enviaram lista`}
        />
      </div>

      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people">Contratados ({filtered.length})</TabsTrigger>
          <TabsTrigger value="coordinators">Por coordenador</TabsTrigger>
          <TabsTrigger value="regions">Por região</TabsTrigger>
        </TabsList>
        <TabsContent value="people">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contratado</TableHead>
                      <TableHead>Coordenação</TableHead>
                      <TableHead>Região</TableHead>
                      <TableHead>Missões</TableHead>
                      <TableHead>Resultado</TableHead>
                      <TableHead>Indicados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <PersonRow key={r.pessoa_id} row={r} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              {!filtered.length && (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Nenhum contratado encontrado nesses filtros.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="coordinators">
          <GroupTable rows={byCoordinator} label="Coordenador" />
        </TabsContent>
        <TabsContent value="regions">
          <GroupTable rows={byRegion} label="Região / cidade" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({
  label,
  value,
  help,
  good,
  danger,
}: {
  label: string;
  value: string | number;
  help: string;
  good?: boolean;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-2xl font-bold ${good ? "text-emerald-600" : danger ? "text-destructive" : ""}`}
        >
          {value}
        </p>
        <p className="text-[11px] text-muted-foreground">{help}</p>
      </CardContent>
    </Card>
  );
}

function PersonRow({ row: r }: { row: ReportRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen(!open)}>
        <TableCell>
          <div className="flex items-center gap-2">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            <div>
              <p className="font-medium">{r.nome}</p>
              <p className="text-xs text-muted-foreground">
                {r.telefone} · {r.cargo}
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <p>{r.coordenador_nome || "Sem coordenador"}</p>
          <p className="text-xs text-muted-foreground">Responsável: {r.responsavel_nome || "—"}</p>
        </TableCell>
        <TableCell>{area(r)}</TableCell>
        <TableCell>
          <p className="font-medium">
            {r.cumpridas}/{r.missoes}
          </p>
          <Progress className="mt-1 h-1.5 w-24" value={n(r.taxa)} />
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={badgeClass(r.faixa)}>
            {statusLabel[r.faixa] || r.faixa}
          </Badge>
        </TableCell>
        <TableCell>
          <p className="font-medium">
            {r.total_indicados}/{r.meta_indicados}
          </p>
          <p className="text-xs text-muted-foreground">
            {listLabel[r.situacao_lista] || r.situacao_lista}
          </p>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/25 p-4">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 font-semibold">Missões no período</h4>
                {!r.missoes_detalhe.length ? (
                  <p className="text-sm text-muted-foreground">Não recebeu missão no período.</p>
                ) : (
                  <div className="space-y-2">
                    {r.missoes_detalhe.map((m) => (
                      <div
                        key={m.mission_id}
                        className="flex items-center justify-between rounded border bg-background p-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{m.titulo || "Missão"}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(m.publicado_em).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            m.status === "cumpriu"
                              ? "text-emerald-700"
                              : m.status === "abriu"
                                ? "text-amber-700"
                                : "text-destructive"
                          }
                        >
                          {m.status === "cumpriu"
                            ? "Cumpriu"
                            : m.status === "abriu"
                              ? "Abriu, não concluiu"
                              : "Não abriu"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="mb-2 font-semibold">Lista enviada por {r.nome}</h4>
                {!r.indicados_detalhe.length ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum indicado enviado no período.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {r.indicados_detalhe.map((i) => (
                      <div
                        key={i.id}
                        className="flex items-center justify-between rounded border bg-background p-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{i.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {i.telefone} · {i.cidade || i.bairro || "sem local"}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">{i.status_telemarketing}</Badge>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {new Date(i.created_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

type Group = {
  name: string;
  people: number;
  missions: number;
  done: number;
  opened: number;
  missed: number;
  indicated: number;
  senders: number;
  rate: number;
};
function groupRows(rows: ReportRow[], key: (r: ReportRow) => string): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const name = key(r);
    const g = map.get(name) || {
      name,
      people: 0,
      missions: 0,
      done: 0,
      opened: 0,
      missed: 0,
      indicated: 0,
      senders: 0,
      rate: 0,
    };
    g.people++;
    g.missions += n(r.missoes);
    g.done += n(r.cumpridas);
    g.opened += n(r.abriu_sem_concluir);
    g.missed += n(r.nao_abriu);
    g.indicated += n(r.total_indicados);
    if (n(r.total_indicados) > 0) g.senders++;
    map.set(name, g);
  }
  return Array.from(map.values())
    .map((g) => ({ ...g, rate: g.missions ? (100 * g.done) / g.missions : 0 }))
    .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));
}
function GroupTable({ rows, label }: { rows: Group[]; label: string }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{label}</TableHead>
              <TableHead>Contratados</TableHead>
              <TableHead>Missões</TableHead>
              <TableHead>Cumpriram</TableHead>
              <TableHead>Pendentes</TableHead>
              <TableHead>Taxa</TableHead>
              <TableHead>Listas / indicados</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((g) => (
              <TableRow key={g.name}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell>{g.people}</TableCell>
                <TableCell>{g.missions}</TableCell>
                <TableCell className="text-emerald-700">{g.done}</TableCell>
                <TableCell className="text-destructive">{g.opened + g.missed}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={g.rate} className="h-2 w-24" />
                    <span>{g.rate.toFixed(1)}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  {g.senders}/{g.people} enviaram · {g.indicated} nomes
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

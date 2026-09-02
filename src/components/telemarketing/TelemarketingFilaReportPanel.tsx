import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  FilterX,
  Loader2,
  ListChecks,
  Phone,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  Vote,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export interface FilaReportRow {
  contato_id: string;
  tabela: string;
  origem: string;
  nome: string;
  telefone: string;
  cidade: string | null;
  bairro: string | null;
  ligacao_status: string | null;
  status_telemarketing: string | null;
  vota_candidato: string | null;
  candidato_alternativo: string | null;
  candidato_federal: string | null;
  federal_status: string | null;
  candidato_senador: string | null;
  senador_status: string | null;
  candidato_governador: string | null;
  governador_status: string | null;
  operador_nome: string | null;
  ligacao_em: string | null;
  total_tentativas: number;
  proxima_tentativa_em: string | null;
  campanha_id: string | null;
  campanha_nome: string | null;
  indicador_id: string | null;
  indicador_nome: string | null;
}

interface GabineteReportRow {
  contato_id: string;
  nome: string;
  telefone: string;
  bairro: string | null;
  regiao: string | null;
  areas: string;
  ultimo_atendimento: string | null;
  ligacao_status: string | null;
  vota_candidato: string | null;
  operador_nome: string | null;
  total_tentativas: number;
}

const ALL = "__all__";
const REPORT_PAGE_SIZE = 1000;
const clean = (v: string | null | undefined) => v?.trim() || "—";
const pct = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
const slug = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

const VOTE_LABEL: Record<string, string> = {
  sim: "Vota",
  nao: "Não vota",
  indeciso: "Indeciso",
  nao_quis_opinar: "Não quis opinar",
  sem_resposta: "Sem resposta",
};
const RESULT_LABEL: Record<string, string> = {
  atendeu: "Atendeu",
  nao_atendeu: "Não atendeu",
  reagendou: "Reagendou",
  invalido: "Inválido",
  pendente: "Pendente",
};
const VOTE_COLORS: Record<string, string> = {
  sim: "#22c55e",
  nao: "#ef4444",
  indeciso: "#f59e0b",
  nao_quis_opinar: "#8b5cf6",
  sem_resposta: "#94a3b8",
};

const topNames = (rows: FilaReportRow[], key: keyof FilaReportRow, limit = 10) => {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    const v = (r[key] as string | null)?.trim();
    if (!v) return;
    map.set(v, (map.get(v) || 0) + 1);
  });
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([nome, total]) => ({ nome, total }));
};

interface Props {
  clientId: string;
  campanhaId: string | null;
  campanhaNome: string;
}

export default function TelemarketingFilaReportPanel({
  clientId,
  campanhaId,
  campanhaNome,
}: Props) {
  const [rows, setRows] = useState<FilaReportRow[]>([]);
  const [gabineteRows, setGabineteRows] = useState<GabineteReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [operator, setOperator] = useState(ALL);
  const [origin, setOrigin] = useState(ALL);
  const [city, setCity] = useState(ALL);
  const [neighborhood, setNeighborhood] = useState(ALL);
  const [result, setResult] = useState(ALL);
  const [vote, setVote] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(
    async (notify = false) => {
      setLoading(true);
      const allRows: FilaReportRow[] = [];
      let page = 0;
      let error: { message: string } | null = null;

      // O servidor limita cada resposta a 1.000 registros. Percorre todas as
      // paginas para que os indicadores, graficos e exportacoes usem a fila completa.
      while (true) {
        const fromRow = page * REPORT_PAGE_SIZE;
        const response = await supabase
          .rpc(
            "tele_fila_report_rows_v2" as never,
            {
              _client_id: clientId,
              _campanha_id: campanhaId,
            } as never,
          )
          .order("tabela", { ascending: true })
          .order("contato_id", { ascending: true })
          .range(fromRow, fromRow + REPORT_PAGE_SIZE - 1);

        if (response.error) {
          error = response.error;
          break;
        }

        const pageRows = ((response.data as unknown[]) || []) as FilaReportRow[];
        allRows.push(...pageRows);
        if (pageRows.length < REPORT_PAGE_SIZE) break;
        page += 1;
      }
      setLoading(false);
      if (error) {
        toast.error(`Erro ao carregar relatório: ${error.message}`);
        return;
      }
      setRows(allRows);
      if (campanhaId) {
        const gabinete = await supabase.rpc(
          "tele_gabinete_report" as never,
          {
            _client_id: clientId,
            _campanha_id: campanhaId,
          } as never,
        );
        setGabineteRows(
          gabinete.error ? [] : (((gabinete.data as unknown[]) || []) as GabineteReportRow[]),
        );
      } else setGabineteRows([]);
      if (notify) toast.success("Relatório atualizado");
    },
    [clientId, campanhaId],
  );

  useEffect(() => {
    if (clientId) void load();
  }, [clientId, load]);

  const options = useMemo(
    () => ({
      operators: [...new Set(rows.map((r) => r.operador_nome).filter(Boolean) as string[])].sort(),
      origins: [...new Set(rows.map((r) => r.origem).filter(Boolean))].sort(),
      cities: [...new Set(rows.map((r) => r.cidade).filter(Boolean) as string[])].sort(),
      neighborhoods: [...new Set(rows.map((r) => r.bairro).filter(Boolean) as string[])].sort(),
    }),
    [rows],
  );

  const normalizedResult = (r: FilaReportRow) =>
    r.ligacao_em || r.total_tentativas > 0 ? r.ligacao_status || "pendente" : "pendente";

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const q = search.trim().toLocaleLowerCase("pt-BR");
        if (
          q &&
          !`${r.nome} ${r.telefone} ${r.indicador_nome || ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(q)
        )
          return false;
        if (operator !== ALL && clean(r.operador_nome) !== operator) return false;
        if (origin !== ALL && r.origem !== origin) return false;
        if (city !== ALL && clean(r.cidade) !== city) return false;
        if (neighborhood !== ALL && clean(r.bairro) !== neighborhood) return false;
        if (vote !== ALL && (r.vota_candidato || "sem_resposta") !== vote) return false;
        if (result !== ALL && normalizedResult(r) !== result) return false;
        if (from && (!r.ligacao_em || r.ligacao_em.slice(0, 10) < from)) return false;
        if (to && (!r.ligacao_em || r.ligacao_em.slice(0, 10) > to)) return false;
        return true;
      }),
    [rows, search, operator, origin, city, neighborhood, vote, result, from, to],
  );

  const kpi = useMemo(() => {
    const total = filtered.length;
    const trabalhados = filtered.filter((r) => r.ligacao_em || r.total_tentativas > 0).length;
    const atendidos = filtered.filter((r) => r.ligacao_status === "atendeu").length;
    const count = (v: string) => filtered.filter((r) => r.vota_candidato === v).length;
    const naoAtendeu = filtered.filter((r) => r.ligacao_status === "nao_atendeu").length;
    const invalidos = filtered.filter(
      (r) => r.ligacao_status === "invalido" || r.status_telemarketing === "descartado",
    ).length;
    const tentativas = filtered.reduce((s, r) => s + (r.total_tentativas || 0), 0);
    return {
      total,
      trabalhados,
      pendentes: total - trabalhados,
      atendidos,
      tentativas,
      sim: count("sim"),
      nao: count("nao"),
      indeciso: count("indeciso"),
      naoQuisOpinar: count("nao_quis_opinar"),
      naoAtendeu,
      invalidos,
      cobertura: pct(trabalhados, total),
      taxaContato: pct(atendidos, trabalhados),
      conversao: pct(count("sim"), atendidos),
    };
  }, [filtered]);

  const voteChart = useMemo(() => {
    const keys = ["sim", "nao", "indeciso", "nao_quis_opinar", "sem_resposta"];
    return keys
      .map((k) => ({
        name: VOTE_LABEL[k],
        key: k,
        value: filtered.filter((r) => (r.vota_candidato || "sem_resposta") === k).length,
      }))
      .filter((d) => d.value > 0);
  }, [filtered]);

  const resultChart = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const k = normalizedResult(r);
      map.set(k, (map.get(k) || 0) + 1);
    });
    return [...map.entries()].map(([k, total]) => ({ nome: RESULT_LABEL[k] || k, total }));
  }, [filtered]);

  const operatorChart = useMemo(() => {
    const map = new Map<
      string,
      { nome: string; trabalhados: number; tentativas: number; sim: number }
    >();
    filtered.forEach((r) => {
      if (!r.ligacao_em && !r.total_tentativas) return;
      const nome = clean(r.operador_nome);
      const cur = map.get(nome) || { nome, trabalhados: 0, tentativas: 0, sim: 0 };
      cur.trabalhados += 1;
      cur.tentativas += r.total_tentativas || 0;
      if (r.vota_candidato === "sim") cur.sim += 1;
      map.set(nome, cur);
    });
    return [...map.values()].sort((a, b) => b.tentativas - a.tentativas).slice(0, 12);
  }, [filtered]);

  const originChart = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => map.set(r.origem, (map.get(r.origem) || 0) + 1));
    return [...map.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const bairroRanking = useMemo(() => {
    const map = new Map<string, { nome: string; total: number; sim: number }>();
    filtered.forEach((r) => {
      const nome = clean(r.bairro);
      const cur = map.get(nome) || { nome, total: 0, sim: 0 };
      cur.total += 1;
      if (r.vota_candidato === "sim") cur.sim += 1;
      map.set(nome, cur);
    });
    return [...map.values()].sort((a, b) => b.sim - a.sim || b.total - a.total).slice(0, 12);
  }, [filtered]);

  const gabineteRegioes = useMemo(() => {
    const map = new Map<string, { nome: string; total: number; atendidos: number; sim: number }>();
    gabineteRows.forEach((r) => {
      const nome = clean(r.regiao);
      const cur = map.get(nome) || { nome, total: 0, atendidos: 0, sim: 0 };
      cur.total += 1;
      if (r.ligacao_status === "atendeu") cur.atendidos += 1;
      if (r.vota_candidato === "sim") cur.sim += 1;
      map.set(nome, cur);
    });
    return [...map.values()].sort((a, b) => b.sim - a.sim || b.total - a.total);
  }, [gabineteRows]);

  const gabineteAreas = useMemo(() => {
    const map = new Map<string, { nome: string; total: number; sim: number }>();
    gabineteRows.forEach((r) =>
      (r.areas || "Sem area")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .forEach((nome) => {
          const cur = map.get(nome) || { nome, total: 0, sim: 0 };
          cur.total += 1;
          if (r.vota_candidato === "sim") cur.sim += 1;
          map.set(nome, cur);
        }),
    );
    return [...map.values()].sort((a, b) => b.sim - a.sim || b.total - a.total);
  }, [gabineteRows]);

  const federal = useMemo(() => topNames(filtered, "candidato_federal"), [filtered]);
  const senador = useMemo(() => topNames(filtered, "candidato_senador"), [filtered]);
  const governador = useMemo(() => topNames(filtered, "candidato_governador"), [filtered]);
  const alternativos = useMemo(() => topNames(filtered, "candidato_alternativo"), [filtered]);

  const activeFilters = [
    search,
    operator,
    origin,
    city,
    neighborhood,
    result,
    vote,
    from,
    to,
  ].filter((v) => v && v !== ALL).length;
  const resetFilters = () => {
    setSearch("");
    setOperator(ALL);
    setOrigin(ALL);
    setCity(ALL);
    setNeighborhood(ALL);
    setResult(ALL);
    setVote(ALL);
    setFrom("");
    setTo("");
  };

  const detailRows = () =>
    filtered.map((r) => ({
      Fila: clean(r.campanha_nome),
      Origem: r.origem,
      Contato: r.nome,
      Telefone: r.telefone,
      Cidade: clean(r.cidade),
      Bairro: clean(r.bairro),
      Indicador: clean(r.indicador_nome),
      Resultado: RESULT_LABEL[normalizedResult(r)] || normalizedResult(r),
      "Voto estadual": VOTE_LABEL[r.vota_candidato || "sem_resposta"],
      "Vota em (se não)": clean(r.candidato_alternativo),
      Federal: clean(r.candidato_federal),
      Senador: clean(r.candidato_senador),
      Governador: clean(r.candidato_governador),
      Operador: clean(r.operador_nome),
      Tentativas: r.total_tentativas,
      "Última ligação": r.ligacao_em ? new Date(r.ligacao_em).toLocaleString("pt-BR") : "—",
    }));

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const resumo = [
      { Indicador: "Contatos na fila", Valor: kpi.total },
      { Indicador: "Trabalhados", Valor: kpi.trabalhados },
      { Indicador: "Pendentes", Valor: kpi.pendentes },
      { Indicador: "Tentativas", Valor: kpi.tentativas },
      { Indicador: "Atendidos", Valor: kpi.atendidos },
      { Indicador: "Cobertura (%)", Valor: kpi.cobertura },
      { Indicador: "Taxa de contato (%)", Valor: kpi.taxaContato },
      { Indicador: "Vota (sim)", Valor: kpi.sim },
      { Indicador: "Não vota", Valor: kpi.nao },
      { Indicador: "Indecisos", Valor: kpi.indeciso },
      { Indicador: "Não quis opinar", Valor: kpi.naoQuisOpinar },
      { Indicador: "Não atendeu", Valor: kpi.naoAtendeu },
      { Indicador: "Inválidos", Valor: kpi.invalidos },
      { Indicador: "Conversão sobre atendidos (%)", Valor: kpi.conversao },
    ];
    const wsResumo = XLSX.utils.json_to_sheet(resumo);
    wsResumo["!cols"] = [{ wch: 32 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
    const wsDetail = XLSX.utils.json_to_sheet(detailRows());
    wsDetail["!cols"] = [
      { wch: 22 },
      { wch: 22 },
      { wch: 28 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 24 },
      ...Array(9).fill({ wch: 18 }),
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, "Contatos");
    const wsOps = XLSX.utils.json_to_sheet(
      operatorChart.map((o) => ({
        Operador: o.nome,
        "Contatos trabalhados": o.trabalhados,
        Tentativas: o.tentativas,
        "Vota sim": o.sim,
      })),
    );
    XLSX.utils.book_append_sheet(wb, wsOps, "Operadores");
    const wsBairros = XLSX.utils.json_to_sheet(
      bairroRanking.map((b) => ({ Bairro: b.nome, Contatos: b.total, "Vota sim": b.sim })),
    );
    XLSX.utils.book_append_sheet(wb, wsBairros, "Bairros");
    if (gabineteRows.length) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          gabineteRegioes.map((r) => ({
            Regiao: r.nome,
            Base: r.total,
            Atendidos: r.atendidos,
            "Apoios declarados": r.sim,
            "Conversao (%)": pct(r.sim, r.atendidos),
          })),
        ),
        "Gabinete - Regioes",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          gabineteAreas.map((r) => ({
            "Area de atendimento": r.nome,
            Base: r.total,
            "Apoios declarados": r.sim,
            "Apoio sobre base (%)": pct(r.sim, r.total),
          })),
        ),
        "Gabinete - Areas",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          gabineteRows.map((r) => ({
            Nome: r.nome,
            Telefone: r.telefone,
            Bairro: clean(r.bairro),
            Regiao: clean(r.regiao),
            Areas: r.areas,
            "Ultimo atendimento": r.ultimo_atendimento || "",
            Resultado: RESULT_LABEL[r.ligacao_status || "pendente"] || r.ligacao_status,
            "Intencao declarada": VOTE_LABEL[r.vota_candidato || "sem_resposta"],
            Operador: clean(r.operador_nome),
            Tentativas: r.total_tentativas,
          })),
        ),
        "Gabinete - Pessoas",
      );
    }
    XLSX.writeFile(
      wb,
      `telemarketing-${slug(campanhaNome)}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const exportPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(`Relatório da fila — ${campanhaNome}`, 36, 38);
    doc.setFontSize(9);
    doc.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")} | ${filtered.length} contato(s)${activeFilters ? " | filtros aplicados" : ""}`,
      36,
      55,
    );
    autoTable(doc, {
      startY: 72,
      head: [
        [
          "Contatos",
          "Trabalhados",
          "Pendentes",
          "Atendidos",
          "Vota",
          "Não vota",
          "Indeciso",
          "Não opinou",
          "Não atendeu",
          "Cobertura",
          "Conversão",
        ],
      ],
      body: [
        [
          kpi.total,
          kpi.trabalhados,
          kpi.pendentes,
          kpi.atendidos,
          kpi.sim,
          kpi.nao,
          kpi.indeciso,
          kpi.naoQuisOpinar,
          kpi.naoAtendeu,
          `${kpi.cobertura}%`,
          `${kpi.conversao}%`,
        ],
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 52] },
    });
    if (gabineteRows.length) {
      autoTable(doc, {
        head: [["Regiao", "Base", "Atendidos", "Apoios declarados", "Conversao"]],
        body: gabineteRegioes.map((r) => [
          r.nome,
          r.total,
          r.atendidos,
          r.sim,
          `${pct(r.sim, r.atendidos)}%`,
        ]),
        styles: { fontSize: 7.5 },
        headStyles: { fillColor: [30, 76, 140] },
      });
      autoTable(doc, {
        head: [["Area de atendimento", "Base", "Apoios declarados", "Apoio sobre base"]],
        body: gabineteAreas.map((r) => [r.nome, r.total, r.sim, `${pct(r.sim, r.total)}%`]),
        styles: { fontSize: 7.5 },
        headStyles: { fillColor: [30, 76, 140] },
      });
    }
    autoTable(doc, {
      head: [["Operador", "Contatos trabalhados", "Tentativas", "Vota sim"]],
      body: operatorChart.map((o) => [o.nome, o.trabalhados, o.tentativas, o.sim]),
      styles: { fontSize: 7.5 },
      headStyles: { fillColor: [30, 64, 52] },
    });
    autoTable(doc, {
      head: [
        [
          "Origem",
          "Contato",
          "Telefone",
          "Bairro",
          "Resultado",
          "Voto",
          "Federal",
          "Senador",
          "Governador",
          "Operador",
        ],
      ],
      body: filtered.map((r) => [
        r.origem,
        r.nome,
        r.telefone,
        clean(r.bairro),
        RESULT_LABEL[normalizedResult(r)] || normalizedResult(r),
        VOTE_LABEL[r.vota_candidato || "sem_resposta"],
        clean(r.candidato_federal),
        clean(r.candidato_senador),
        clean(r.candidato_governador),
        clean(r.operador_nome),
      ]),
      styles: { fontSize: 6.5 },
      headStyles: { fillColor: [30, 64, 52] },
      showHead: "everyPage",
    });
    doc.save(`telemarketing-${slug(campanhaNome)}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const metricCards = [
    { label: campanhaId ? "Contatos na fila" : "Contatos na base", value: kpi.total, Icon: Users },
    { label: "Trabalhados", value: `${kpi.trabalhados} (${kpi.cobertura}%)`, Icon: Phone },
    { label: "Pendentes", value: kpi.pendentes, Icon: ListChecks },
    { label: "Atendidos", value: `${kpi.atendidos} (${kpi.taxaContato}%)`, Icon: UserCheck },
    { label: "Tentativas realizadas", value: kpi.tentativas, Icon: Phone },
    { label: "Vota (sim)", value: kpi.sim, Icon: CheckCircle2 },
    { label: "Não vota", value: kpi.nao, Icon: Vote },
    { label: "Indecisos", value: kpi.indeciso, Icon: Vote },
    { label: "Não atendeu", value: kpi.naoAtendeu, Icon: Phone },
    { label: "Não quis opinar", value: kpi.naoQuisOpinar, Icon: Vote },
    { label: "Inválidos", value: kpi.invalidos, Icon: ListChecks },
    { label: "Conversão / atendidos", value: `${kpi.conversao}%`, Icon: CheckCircle2 },
  ];

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="size-4 text-primary" /> Resultado geral — {campanhaNome}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Vale para qualquer lista de ligação (planilha, estrutura, indicados, contratados,
              avulsos). Use o seletor de fila acima para medir cada fila separadamente.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filtered.length}>
              <FileSpreadsheet className="size-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF} disabled={!filtered.length}>
              <FileDown className="size-4" /> PDF
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {gabineteRows.length > 0 && (
          <div className="rounded-lg border-2 border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-blue-800 dark:text-blue-200">
                Resultado exclusivo da acao: atendidos pelo gabinete
              </h3>
              <p className="text-xs text-muted-foreground">
                Estes apoios declarados pertencem somente a esta fila e nao se misturam com
                indicados ou outras origens.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Por regiao
                </p>
                <div className="space-y-1 text-xs">
                  {gabineteRegioes.slice(0, 10).map((r) => (
                    <div key={r.nome} className="grid grid-cols-[1fr_auto] gap-2 border-b py-1">
                      <span>{r.nome}</span>
                      <strong>
                        {r.sim} apoios / {r.atendidos} atendidos ({pct(r.sim, r.atendidos)}%)
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Por area de atendimento
                </p>
                <div className="space-y-1 text-xs">
                  {gabineteAreas.slice(0, 10).map((r) => (
                    <div key={r.nome} className="grid grid-cols-[1fr_auto] gap-2 border-b py-1">
                      <span>{r.nome}</span>
                      <strong>
                        {r.sim} apoios / {r.total} pessoas
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, telefone ou indicador"
            />
          </div>
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger>
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as origens</SelectItem>
              {options.origins.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={operator} onValueChange={setOperator}>
            <SelectTrigger>
              <SelectValue placeholder="Operador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os operadores</SelectItem>
              {options.operators.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger>
              <SelectValue placeholder="Resultado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os resultados</SelectItem>
              {Object.entries(RESULT_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={vote} onValueChange={setVote}>
            <SelectTrigger>
              <SelectValue placeholder="Voto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os votos</SelectItem>
              {Object.entries(VOTE_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger>
              <SelectValue placeholder="Cidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as cidades</SelectItem>
              {options.cities.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={neighborhood} onValueChange={setNeighborhood}>
            <SelectTrigger>
              <SelectValue placeholder="Bairro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os bairros</SelectItem>
              {options.neighborhoods.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {activeFilters > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{activeFilters} filtro(s) ativo(s)</Badge>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <FilterX className="size-4" /> Limpar filtros
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando contatos…
          </div>
        )}

        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum contato vinculado a esta fila ainda.
          </p>
        )}

        {!loading && rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {metricCards.map(({ label, value, Icon }) => (
                <div key={label} className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="size-3.5" /> {label}
                  </div>
                  <p className="mt-1 text-xl font-bold">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Intenção de voto (estadual)</p>
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={voteChart} dataKey="value" nameKey="name" outerRadius={80} label>
                      {voteChart.map((d) => (
                        <Cell key={d.key} fill={VOTE_COLORS[d.key]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Resultado das ligações</p>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={resultChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar
                      dataKey="total"
                      name="Contatos"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Produção por operador</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={operatorChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="trabalhados"
                      name="Contatos trabalhados"
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                    />
                    <Bar
                      dataKey="tentativas"
                      name="Tentativas"
                      fill="#0ea5e9"
                      radius={[0, 4, 4, 0]}
                    />
                    <Bar dataKey="sim" name="Vota sim" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Origem dos contatos da fila</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={originChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="total" name="Contatos" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Ranking por bairro (vota sim)</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bairro</TableHead>
                      <TableHead className="text-right">Contatos</TableHead>
                      <TableHead className="text-right">Vota sim</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bairroRanking.map((b) => (
                      <TableRow key={b.nome}>
                        <TableCell>{b.nome}</TableCell>
                        <TableCell className="text-right">{b.total}</TableCell>
                        <TableCell className="text-right font-semibold">{b.sim}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3">
                {[
                  ["Deputado federal", federal],
                  ["Senador", senador],
                  ["Governador", governador],
                  ["Vota em (quando não vota)", alternativos],
                ].map(([title, list]) => (
                  <div key={title as string} className="rounded-lg border p-3">
                    <p className="mb-1 text-sm font-medium">{title as string}</p>
                    {(list as { nome: string; total: number }[]).length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem respostas ainda.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(list as { nome: string; total: number }[]).map((c) => (
                          <Badge key={c.nome} variant="outline" className="text-[11px]">
                            {c.nome} · {c.total}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Accordion type="single" collapsible>
              <AccordionItem value="detalhe">
                <AccordionTrigger className="text-sm font-medium">
                  Lista detalhada dos contatos ({filtered.length})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="max-h-[520px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Contato</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Origem</TableHead>
                          <TableHead>Bairro</TableHead>
                          <TableHead>Resultado</TableHead>
                          <TableHead>Voto</TableHead>
                          <TableHead>Federal</TableHead>
                          <TableHead>Operador</TableHead>
                          <TableHead>Última ligação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((r) => (
                          <TableRow key={`${r.tabela}-${r.contato_id}`}>
                            <TableCell className="font-medium">{r.nome}</TableCell>
                            <TableCell>{r.telefone}</TableCell>
                            <TableCell className="text-xs">{r.origem}</TableCell>
                            <TableCell className="text-xs">{clean(r.bairro)}</TableCell>
                            <TableCell className="text-xs">
                              {RESULT_LABEL[normalizedResult(r)] || normalizedResult(r)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {VOTE_LABEL[r.vota_candidato || "sem_resposta"]}
                            </TableCell>
                            <TableCell className="text-xs">{clean(r.candidato_federal)}</TableCell>
                            <TableCell className="text-xs">{clean(r.operador_nome)}</TableCell>
                            <TableCell className="text-xs">
                              {r.ligacao_em ? new Date(r.ligacao_em).toLocaleString("pt-BR") : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}
      </CardContent>
    </Card>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2, Search, Download, FileText, CheckCircle2, Eye, XCircle, Users,
  MessageCircle, History, TrendingUp,
} from "lucide-react";
import { fmtPhoneBR, toWhatsAppBR } from "@/lib/phone-utils";
import MissionPessoaHistorico from "./MissionPessoaHistorico";
import MissionCheckinCharts from "./MissionCheckinCharts";
import MissionCheckinAlerts from "./MissionCheckinAlerts";

type Props = {
  clientId: string;
  missionId: string;
  missionTitle: string | null;
  missionLink: string | null;
};

type Row = {
  pessoa_id: string;
  origem: string;
  nome: string;
  telefone: string | null;
  cargo: string | null;
  regiao: string | null;
  cidade: string | null;
  is_voluntario: boolean;
  tem_contrato: boolean;
  indicador_nome: string | null;
  status: "cumpriu" | "abriu" | "nao_abriu";
  primeiro_acesso_em: string | null;
  concluido_em: string | null;
  clicks: number;
  tem_cadastro?: boolean;
  links_clicados?: string[] | null;
};

const CARGO_LABEL: Record<string, string> = {
  coordenador: "Coordenador",
  lider: "Líder",
  cabo: "Cabo",
  voluntario: "Voluntário",
  funcionario: "Funcionário",
  contratado: "Contratado",
};

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export default function MissionCheckinDashboard({ clientId, missionId, missionTitle, missionLink }: Props) {
  const [incluirSemValor, setIncluirSemValor] = useState(false);
  const [incluirFuncionarios, setIncluirFuncionarios] = useState(false);
  const [somenteFaltantes, setSomenteFaltantes] = useState(false);
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [obrigacaoFiltro, setObrigacaoFiltro] = useState<string>("todos");
  const [cadastroFiltro, setCadastroFiltro] = useState<string>("todos");
  const [cargoFiltro, setCargoFiltro] = useState<string>("todos");
  const [regiaoFiltro, setRegiaoFiltro] = useState<string>("todas");
  const [search, setSearch] = useState("");
  const [historicoPessoa, setHistoricoPessoa] = useState<{ id: string; nome: string } | null>(null);

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["mission-checkin-dashboard", clientId, missionId, incluirSemValor, incluirFuncionarios],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("mission_checkin_dashboard", {
        p_client_id: clientId,
        p_mission_id: missionId,
        p_incluir_sem_valor: incluirSemValor,
        p_incluir_funcionarios: incluirFuncionarios,
        p_regiao: null,
      });
      if (error) throw error;
      return (data || []) as Row[];
    },
    enabled: !!clientId && !!missionId,
    staleTime: 15_000,
  });

  const regioes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.regiao).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (somenteFaltantes && r.status === "cumpriu") return false;
      if (statusFiltro !== "todos" && r.status !== statusFiltro) return false;
      if (obrigacaoFiltro === "voluntarios" && !r.is_voluntario) return false;
      if (obrigacaoFiltro === "contrato" && !r.tem_contrato) return false;
      if (cadastroFiltro === "com" && r.tem_cadastro === false) return false;
      if (cadastroFiltro === "sem" && r.tem_cadastro !== false) return false;
      if (cargoFiltro !== "todos" && (r.cargo || "") !== cargoFiltro) return false;
      if (regiaoFiltro !== "todas" && (r.regiao || "") !== regiaoFiltro) return false;
      if (q) {
        const hay = `${r.nome} ${r.telefone || ""} ${r.indicador_nome || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, somenteFaltantes, statusFiltro, obrigacaoFiltro, cadastroFiltro, cargoFiltro, regiaoFiltro, search]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const cumpriu = rows.filter((r) => r.status === "cumpriu").length;
    const abriu = rows.filter((r) => r.status === "abriu").length;
    const naoAbriu = total - cumpriu - abriu;
    return { total, cumpriu, abriu, naoAbriu, adesao: total ? Math.round((cumpriu / total) * 100) : 0 };
  }, [rows]);

  const ranking = useMemo(() => {
    const map = new Map<string, { nome: string; total: number; cumpriu: number }>();
    for (const r of rows) {
      const key = r.regiao || "Sem região";
      const cur = map.get(key) || { nome: key, total: 0, cumpriu: 0 };
      cur.total += 1;
      if (r.status === "cumpriu") cur.cumpriu += 1;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, pct: g.total ? Math.round((g.cumpriu / g.total) * 100) : 0 }))
      .sort((a, b) => b.pct - a.pct || b.total - a.total);
  }, [rows]);

  const cobrar = (r: Row) => {
    const phone = toWhatsAppBR(r.telefone);
    if (!phone) {
      toast.error("Telefone inválido ou ausente neste cadastro");
      return;
    }
    const texto = [
      `Olá ${r.nome.split(" ")[0]}, tudo bem?`,
      "",
      `Estamos conferindo a missão *${missionTitle || "da campanha"}* e o seu registro ainda não apareceu.`,
      missionLink ? `Acesse e conclua: ${missionLink}` : "",
      "",
      "Sua interação faz diferença. Obrigado!",
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  };

  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const data = filtered.map((r) => ({
        Nome: r.nome,
        Cargo: CARGO_LABEL[r.cargo || ""] || r.cargo || "",
        Região: r.regiao || "",
        Telefone: fmtPhoneBR(r.telefone),
        Indicador: r.indicador_nome || "",
        Voluntário: r.is_voluntario ? "Sim" : "Não",
        "Com contrato": r.tem_contrato ? "Sim" : "Não",
        Status: r.status === "cumpriu" ? "Cumpriu" : r.status === "abriu" ? "Abriu e não concluiu" : "Não abriu",
        "Abriu em": fmtDate(r.primeiro_acesso_em),
        "Concluiu em": fmtDate(r.concluido_em),
        Cliques: r.clicks,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Check-in");
      XLSX.writeFile(wb, `checkin-missao-${(missionTitle || "missao").slice(0, 30).replace(/\W+/g, "-")}.xlsx`);
      toast.success("Excel gerado");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar Excel");
    }
  };

  const exportPdf = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text(`Check-in da missão: ${missionTitle || "-"}`, 14, 14);
      doc.setFontSize(9);
      doc.text(
        `Obrigados: ${kpis.total} · Cumpriram: ${kpis.cumpriu} · Abriram: ${kpis.abriu} · Não abriram: ${kpis.naoAbriu} · Adesão: ${kpis.adesao}%`,
        14,
        21,
      );
      autoTable(doc, {
        startY: 26,
        styles: { fontSize: 8 },
        head: [["Nome", "Cargo", "Região", "Telefone", "Indicador", "Status", "Concluiu em"]],
        body: filtered.map((r) => [
          r.nome,
          CARGO_LABEL[r.cargo || ""] || r.cargo || "",
          r.regiao || "",
          fmtPhoneBR(r.telefone),
          r.indicador_nome || "",
          r.status === "cumpriu" ? "Cumpriu" : r.status === "abriu" ? "Abriu" : "Não abriu",
          fmtDate(r.concluido_em),
        ]),
        didParseCell: (d: any) => {
          if (d.section === "body" && d.column.index === 5 && d.cell.raw === "Não abriu") {
            d.cell.styles.textColor = [200, 30, 30];
          }
        },
      });
      doc.save(`checkin-missao-${(missionTitle || "missao").slice(0, 30).replace(/\W+/g, "-")}.pdf`);
      toast.success("PDF gerado");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar PDF");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> Obrigados</p>
            <p className="text-2xl font-bold">{kpis.total}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30">
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Cumpriram</p>
            <p className="text-2xl font-bold text-emerald-600">{kpis.cumpriu}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30">
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Eye className="h-3.5 w-3.5 text-amber-600" /> Abriram e não concluíram</p>
            <p className="text-2xl font-bold text-amber-600">{kpis.abriu}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><XCircle className="h-3.5 w-3.5 text-destructive" /> Nunca abriram</p>
            <p className="text-2xl font-bold text-destructive">{kpis.naoAbriu}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Adesão</p>
            <p className="text-2xl font-bold">{kpis.adesao}%</p>
            <Progress value={kpis.adesao} className="h-2" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quem é obrigado a interagir</CardTitle>
          <CardDescription>
            Por padrão, o público são todos com contrato gerado (valor definido) mais os voluntários.
            Use as chaves abaixo para ampliar a medição.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Switch id="sv" checked={incluirSemValor} onCheckedChange={setIncluirSemValor} />
              <Label htmlFor="sv" className="text-xs">Incluir cadastros sem valor de contrato</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="fn" checked={incluirFuncionarios} onCheckedChange={setIncluirFuncionarios} />
              <Label htmlFor="fn" className="text-xs">Incluir funcionários</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ft" checked={somenteFaltantes} onCheckedChange={setSomenteFaltantes} />
              <Label htmlFor="ft" className="text-xs">Somente faltantes</Label>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, telefone ou indicador"
                className="pl-8"
              />
            </div>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="cumpriu">Entrou e concluiu</SelectItem>
                <SelectItem value="abriu">Entrou e não concluiu</SelectItem>
                <SelectItem value="nao_abriu">Não entrou no link</SelectItem>
              </SelectContent>
            </Select>
            <Select value={obrigacaoFiltro} onValueChange={setObrigacaoFiltro}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Obrigados (todos)</SelectItem>
                <SelectItem value="contrato">Somente com contrato</SelectItem>
                <SelectItem value="voluntarios">Somente voluntários</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cadastroFiltro} onValueChange={setCadastroFiltro}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Com e sem cadastro</SelectItem>
                <SelectItem value="com">Com cadastro no sistema</SelectItem>
                <SelectItem value="sem">Sem cadastro</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cargoFiltro} onValueChange={setCargoFiltro}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os cargos</SelectItem>
                {Object.entries(CARGO_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={regiaoFiltro} onValueChange={setRegiaoFiltro}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as regiões</SelectItem>
                {regioes.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-1.5" onClick={exportExcel} disabled={!filtered.length}>
              <Download className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={exportPdf} disabled={!filtered.length}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>

          {isLoading ? (
            <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma pessoa no público com estes filtros.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Pessoa</th>
                    <th className="p-2 text-left">Cargo</th>
                    <th className="p-2 text-left">Região</th>
                    <th className="p-2 text-left">Telefone</th>
                    <th className="p-2 text-left">Indicador</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Links abertos</th>
                    <th className="p-2 text-left">Check-in</th>
                    <th className="p-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={`${r.origem}-${r.pessoa_id}`} className="border-t">
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                            {r.nome.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="font-medium">{r.nome}</span>
                        </div>
                      </td>
                      <td className="p-2">
                        <Badge variant={r.is_voluntario ? "outline" : "secondary"} className="text-[10px]">
                          {CARGO_LABEL[r.cargo || ""] || r.cargo || "—"}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs">{r.regiao || "—"}</td>
                      <td className="p-2 text-xs">{fmtPhoneBR(r.telefone) || "—"}</td>
                      <td className="p-2 text-xs">{r.indicador_nome || "—"}</td>
                      <td className="p-2">
                        {r.status === "cumpriu" ? (
                          <Badge className="gap-1 bg-emerald-600 text-[10px] hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3" /> Cumpriu</Badge>
                        ) : r.status === "abriu" ? (
                          <Badge variant="secondary" className="gap-1 text-[10px]"><Eye className="h-3 w-3" /> Abriu</Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1 text-[10px]"><XCircle className="h-3 w-3" /> Não abriu</Badge>
                        )}
                      </td>
                      <td className="p-2">
                        {(r.links_clicados || []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(r.links_clicados || []).map((l, i) => (
                              <Badge key={`${l}-${i}`} variant="outline" className="text-[10px]">{l}</Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {fmtDate(r.concluido_em || r.primeiro_acesso_em)}
                      </td>
                      <td className="p-2">
                        <div className="flex justify-end gap-1">
                          {r.origem === "eleicao" && (
                            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"
                              onClick={() => setHistoricoPessoa({ id: r.pessoa_id, nome: r.nome })}>
                              <History className="h-3.5 w-3.5" /> Histórico
                            </Button>
                          )}
                          {r.status !== "cumpriu" && (
                            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => cobrar(r)}>
                              <MessageCircle className="h-3.5 w-3.5" /> Cobrar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Adesão por região</CardTitle>
          <CardDescription>Quem entrega e quem não entrega nesta missão.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados.</p>
          ) : (
            ranking.map((g) => (
              <div key={g.nome} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{g.nome}</span>
                  <span className="text-muted-foreground">{g.cumpriu}/{g.total} · {g.pct}%</span>
                </div>
                <Progress value={g.pct} className="h-2" />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <MissionCheckinCharts clientId={clientId} missionId={missionId} rows={filtered} />

      <MissionCheckinAlerts
        clientId={clientId}
        missionId={missionId}
        missionTitle={missionTitle}
        missionLink={missionLink}
      />

      <MissionPessoaHistorico
        clientId={clientId}
        pessoa={historicoPessoa}
        onClose={() => setHistoricoPessoa(null)}
      />
    </div>
  );
}

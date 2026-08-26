import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, FileDown, Minus, Search, TrendingUp } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";
import {
  FAIXA_DESEMPENHO, PROVA_LABEL, STATUS_PUB_LABEL, fmtData, fmtDataHora, fmtPct, fmtTelefone, waLink,
  type PessoaDesempenho,
} from "@/lib/engagement-desempenho";

export default function EquipeRankingPanel({
  rows,
  periodoLabel,
}: {
  rows: PessoaDesempenho[];
  periodoLabel: string;
}) {
  const [busca, setBusca] = useState("");
  const [cargo, setCargo] = useState("todos");
  const [regiao, setRegiao] = useState("todas");
  const [faixa, setFaixa] = useState("todas");
  const [soContrato, setSoContrato] = useState(false);
  const [soVoluntario, setSoVoluntario] = useState(false);
  const [detalhe, setDetalhe] = useState<PessoaDesempenho | null>(null);

  const cargos = useMemo(
    () => Array.from(new Set(rows.map((r) => r.cargo).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const regioes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.regiao || r.cidade).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(`${r.nome} ${r.telefone || ""}`.toLowerCase().includes(q))) return false;
      if (cargo !== "todos" && r.cargo !== cargo) return false;
      if (regiao !== "todas" && (r.regiao || r.cidade) !== regiao) return false;
      if (faixa !== "todas" && r.faixa !== faixa) return false;
      if (soContrato && !r.tem_contrato) return false;
      if (soVoluntario && !r.is_voluntario) return false;
      return true;
    });
  }, [rows, busca, cargo, regiao, faixa, soContrato, soVoluntario]);

  const exportarExcel = () => {
    const data = filtradas.map((r) => ({
      Nome: r.nome,
      Cargo: r.cargo || "—",
      Região: r.regiao || r.cidade || "—",
      Telefone: fmtTelefone(r.telefone),
      Publicações: r.publicacoes,
      Cumpridas: r.cumpridas,
      "Abriu sem confirmar": r.abriu_sem_confirmar,
      Faltas: r.faltas,
      "Cumprimento %": Number(r.pct),
      "Período anterior %": r.pct_anterior == null ? "" : Number(r.pct_anterior),
      Variação: r.variacao == null ? "" : Number(r.variacao),
      Prova: r.prova_principal || "—",
      Faixa: FAIXA_DESEMPENHO[r.faixa].label,
      Contrato: r.tem_contrato ? "Sim" : "Não",
      Voluntário: r.is_voluntario ? "Sim" : "Não",
      "Última atividade": fmtDataHora(r.ultima_atividade),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Ranking");
    XLSX.writeFile(wb, `ranking-equipe-${periodoLabel}.xlsx`);
  };

  const exportarPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Ranking da equipe — cumprimento de publicações", 14, 14);
    doc.setFontSize(9);
    doc.text(`Período: ${periodoLabel} · ${filtradas.length} pessoas`, 14, 20);
    autoTable(doc, {
      startY: 26,
      styles: { fontSize: 8 },
      head: [["Nome", "Cargo", "Região", "Public.", "Cumpr.", "Faltas", "%", "Faixa", "Última atividade"]],
      body: filtradas.map((r) => [
        r.nome.slice(0, 40),
        r.cargo || "—",
        (r.regiao || r.cidade || "—").slice(0, 20),
        r.publicacoes,
        r.cumpridas,
        r.faltas,
        fmtPct(r.pct),
        FAIXA_DESEMPENHO[r.faixa].label,
        fmtDataHora(r.ultima_atividade),
      ]),
    });
    doc.save(`ranking-equipe-${periodoLabel}.pdf`);
  };

  return (
    <Card>
      <CardHeader className="px-3 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" /> Ranking da equipe
            </CardTitle>
            <CardDescription className="text-xs">
              Clique em uma pessoa para ver publicação por publicação e cobrar pelo WhatsApp.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportarExcel} className="gap-1.5">
              <FileDown className="h-4 w-4" /> Excel
            </Button>
            <Button size="sm" variant="outline" onClick={exportarPdf} className="gap-1.5">
              <FileDown className="h-4 w-4" /> PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou telefone"
              className="pl-8"
            />
          </div>
          <Select value={cargo} onValueChange={setCargo}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os cargos</SelectItem>
              {cargos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={regiao} onValueChange={setRegiao}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as regiões</SelectItem>
              {regioes.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={faixa} onValueChange={setFaixa}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as faixas</SelectItem>
              <SelectItem value="excelente">Excelente</SelectItem>
              <SelectItem value="atencao">Atenção</SelectItem>
              <SelectItem value="baixo">Baixo</SelectItem>
              <SelectItem value="critico">Crítico</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch id="ct" checked={soContrato} onCheckedChange={setSoContrato} />
            <Label htmlFor="ct" className="text-xs">Só com contrato</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="vl" checked={soVoluntario} onCheckedChange={setSoVoluntario} />
            <Label htmlFor="vl" className="text-xs">Só voluntários</Label>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{filtradas.length} pessoas no filtro atual.</p>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Pessoa</TableHead>
                <TableHead className="text-right">Public.</TableHead>
                <TableHead className="text-right">Cumpridas</TableHead>
                <TableHead className="text-right">Faltas</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead>Variação</TableHead>
                <TableHead>Prova</TableHead>
                <TableHead>Faixa</TableHead>
                <TableHead>Última atividade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-muted-foreground">
                    Ninguém encontrado com esses filtros.
                  </TableCell>
                </TableRow>
              )}
              {filtradas.map((r, i) => {
                const VarIcon = r.variacao == null ? Minus : r.variacao > 0 ? ArrowUp : r.variacao < 0 ? ArrowDown : Minus;
                return (
                  <TableRow key={`${r.origem}-${r.pessoa_id}`} className="cursor-pointer" onClick={() => setDetalhe(r)}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="max-w-[240px]">
                      <p className="truncate font-medium">{r.nome}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.cargo || "—"} · {r.regiao || r.cidade || "—"}
                        {r.tem_contrato ? " · contrato" : ""}
                        {r.is_voluntario ? " · voluntário" : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.publicacoes}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-600">{r.cumpridas}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">{r.faltas}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmtPct(r.pct)}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-xs">
                        <VarIcon
                          className={cn(
                            "h-3 w-3",
                            (r.variacao ?? 0) > 0 && "text-emerald-500",
                            (r.variacao ?? 0) < 0 && "text-destructive",
                            !r.variacao && "text-muted-foreground",
                          )}
                        />
                        {r.variacao == null ? "—" : `${r.variacao > 0 ? "+" : ""}${r.variacao}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{r.prova_principal || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px]", FAIXA_DESEMPENHO[r.faixa].className)}>
                        {FAIXA_DESEMPENHO[r.faixa].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{fmtDataHora(r.ultima_atividade)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{detalhe?.nome}</DialogTitle>
            <DialogDescription>
              {detalhe?.cargo || "—"} · {detalhe?.regiao || detalhe?.cidade || "—"} · {fmtTelefone(detalhe?.telefone)}
              {" · "}
              {detalhe ? `${detalhe.cumpridas}/${detalhe.publicacoes} publicações (${fmtPct(detalhe.pct)})` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {(detalhe?.detalhe || []).map((d) => (
              <div key={d.mission_id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{d.titulo || "Publicação"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtData(d.publicado_em)}
                    {d.prova ? ` · ${PROVA_LABEL[d.prova]}` : ""}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 text-[10px]",
                    d.status === "cumpriu" && "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
                    d.status === "abriu" && "bg-amber-500/15 text-amber-600 border-amber-500/30",
                    d.status === "nao_abriu" && "bg-destructive/15 text-destructive border-destructive/30",
                  )}
                >
                  {STATUS_PUB_LABEL[d.status]}
                </Badge>
              </div>
            ))}
          </div>
          {detalhe && waLink(detalhe.telefone) && (
            <Button asChild className="w-full">
              <a
                href={
                  waLink(
                    detalhe.telefone,
                    `Oi ${detalhe.nome.split(" ")[0]}! Você cumpriu ${detalhe.cumpridas} de ${detalhe.publicacoes} publicações no período. Vamos melhorar isso?`,
                  ) || "#"
                }
                target="_blank"
                rel="noreferrer"
              >
                Cobrar pelo WhatsApp
              </a>
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

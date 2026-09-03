import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDown, Users } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtPct, type PessoaDesempenho, type TeamRoot } from "@/lib/engagement-desempenho";

export type TeamPeriodSummary = TeamRoot & {
  membros: PessoaDesempenho[];
  atribuicoes: number;
  cumpridas: number;
  abriu: number;
  faltas: number;
  adesao: number;
};

const summaryRows = (rows: TeamPeriodSummary[]) => rows.map((r) => ({
  Responsável: r.nome,
  Tipo: r.is_avulso ? "Líder avulso" : "Coordenador",
  "Pessoas avaliadas": r.membros.length,
  "Missões atribuídas": r.atribuicoes,
  Cumpridas: r.cumpridas,
  "Abriu sem confirmar": r.abriu,
  "Não abriu": r.faltas,
  "Cumprimento %": r.adesao,
}));

export default function ResumoEquipesPeriodoPanel({ rows, periodoLabel, loading }: {
  rows: TeamPeriodSummary[];
  periodoLabel: string;
  loading: boolean;
}) {
  const coordenadores = rows.filter((r) => !r.is_avulso);
  const avulsos = rows.filter((r) => r.is_avulso);

  const exportExcel = (items: TeamPeriodSummary[], kind: string) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows(items)), "Resumo");
    XLSX.writeFile(wb, `${kind}-${periodoLabel.replace(/\s+/g, "_")}.xlsx`);
  };

  const exportPdf = (items: TeamPeriodSummary[], title: string, filename: string) => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(title, 14, 14);
    doc.setFontSize(9);
    doc.text(`Período: ${periodoLabel} · ${items.length} resultado(s)`, 14, 20);
    autoTable(doc, {
      startY: 26,
      styles: { fontSize: 8 },
      head: [["Responsável", "Pessoas", "Atribuições", "Cumpridas", "Abriu", "Não abriu", "%"]],
      body: items.map((r) => [r.nome, r.membros.length, r.atribuicoes, r.cumpridas, r.abriu, r.faltas, fmtPct(r.adesao)]),
    });
    doc.save(`${filename}-${periodoLabel.replace(/\s+/g, "_")}.pdf`);
  };

  const exportIndividual = (team: TeamPeriodSummary) => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(`${team.is_avulso ? "Líder avulso" : "Equipe do coordenador"}: ${team.nome}`, 14, 14);
    doc.setFontSize(9);
    doc.text(`Período: ${periodoLabel} · Cumprimento geral: ${fmtPct(team.adesao)}`, 14, 20);
    autoTable(doc, {
      startY: 26,
      styles: { fontSize: 8 },
      head: [["Pessoa", "Cargo", "Recebidas", "Cumpridas", "Abriu", "Não abriu", "%"]],
      body: team.membros.map((p) => [p.nome, p.cargo || "—", p.publicacoes, p.cumpridas, p.abriu_sem_confirmar, p.faltas, fmtPct(p.pct)]),
    });
    doc.save(`resultado-${team.nome.replace(/[^a-z0-9]+/gi, "-")}-${periodoLabel.replace(/\s+/g, "_")}.pdf`);
  };

  const Group = ({ title, description, items, kind }: { title: string; description: string; items: TeamPeriodSummary[]; kind: "coordenadores" | "avulsos" }) => (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><CardTitle className="text-base">{title}</CardTitle><CardDescription>{description}</CardDescription></div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!items.length || loading} onClick={() => exportExcel(items, kind)}><FileDown className="mr-1 h-4 w-4" />Excel geral</Button>
            <Button size="sm" variant="outline" disabled={!items.length || loading} onClick={() => exportPdf(items, title, kind)}><FileDown className="mr-1 h-4 w-4" />PDF geral</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Calculando resultados do período…</p> :
          <div className="divide-y rounded-md border">{items.map((r) => <div key={r.root_id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-52 flex-1"><p className="font-medium">{r.nome}</p><p className="text-xs text-muted-foreground">{r.membros.length} pessoa(s) · {r.cumpridas}/{r.atribuicoes} cumpridas</p></div>
            <Badge variant="outline">{fmtPct(r.adesao)}</Badge>
            <Button size="sm" variant="outline" onClick={() => exportIndividual(r)}><FileDown className="mr-1 h-4 w-4" />PDF individual</Button>
          </div>)}{!items.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum resultado neste período.</p>}</div>}
      </CardContent>
    </Card>
  );

  return <div className="space-y-4">
    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" />Relatórios separados, sem misturar equipes e líderes avulsos.</div>
    <Group title="Resultado geral dos coordenadores" description="Uma linha por coordenador, consolidando todos os integrantes de sua equipe." items={coordenadores} kind="coordenadores" />
    <Group title="Resultado geral dos líderes avulsos" description="Uma linha por líder avulso; nesse grupo o resultado é individual." items={avulsos} kind="avulsos" />
  </div>;
}

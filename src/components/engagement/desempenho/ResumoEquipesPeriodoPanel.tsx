import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDown, Info, Phone, Users } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtPct, fmtTelefone, type PessoaDesempenho, type TeamRoot } from "@/lib/engagement-desempenho";

export type PeriodPersonResult = Pick<PessoaDesempenho, "pessoa_id" | "nome" | "telefone" | "cargo" | "publicacoes" | "cumpridas" | "abriu_sem_confirmar" | "faltas" | "pct">;
export type TeamPeriodSummary = TeamRoot & {
  membros: PessoaDesempenho[];
  responsavel: PeriodPersonResult;
  lideres: PeriodPersonResult[];
  atribuicoes: number; cumpridas: number; abriu: number; faltas: number; adesao: number;
};

const status = (p: PeriodPersonResult) => !p.publicacoes ? "Sem atribuições" : p.pct >= 80 ? "Bom" : p.pct >= 50 ? "Atenção" : p.pct > 0 ? "Baixo" : "Não cumpriu";
const statusClass = (p: PeriodPersonResult) => !p.publicacoes ? "bg-slate-100 text-slate-600" : p.pct >= 80 ? "bg-emerald-50 text-emerald-700" : p.pct >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
const people = (t: TeamPeriodSummary) => [
  { role: t.is_avulso ? "Líder avulso" : "Coordenador", person: t.responsavel },
  ...t.lideres.map((person) => ({ role: "Líder", person })),
];
const tableRow = (role: string, p: PeriodPersonResult) => [role, p.nome, fmtTelefone(p.telefone), p.publicacoes, p.cumpridas, p.abriu_sem_confirmar, p.faltas, fmtPct(p.pct), status(p)];

const legend = (doc: jsPDF, y: number) => {
  doc.setFillColor(241, 245, 249); doc.roundedRect(14, y, 269, 15, 2, 2, "F");
  doc.setTextColor(51, 65, 85); doc.setFontSize(7.5);
  doc.text("COMO LER: Recebidas = missões atribuídas · Cumpridas = confirmações · Abriu = acessou, mas não confirmou", 18, y + 6);
  doc.text("Não abriu = não acessou · Taxa = Cumpridas ÷ Recebidas. Sem atribuições = nenhuma missão destinada no período.", 18, y + 11);
  doc.setTextColor(0, 0, 0); return y + 20;
};

const reportTable = (doc: jsPDF, body: (string | number)[][], startY: number) => autoTable(doc, {
  startY, margin: { left: 14, right: 14 }, styles: { fontSize: 7.4, cellPadding: 2 }, headStyles: { fillColor: [51, 65, 85] },
  head: [["Função", "Nome", "Telefone", "Recebidas", "Cumpridas", "Abriu", "Não abriu", "Taxa", "Situação"]], body,
  didParseCell: (data) => {
    if (data.section === "body" && data.row.index === 0) {
      data.cell.styles.fillColor = [219, 234, 254]; data.cell.styles.textColor = [30, 64, 175]; data.cell.styles.fontStyle = "bold";
    }
  },
});

export default function ResumoEquipesPeriodoPanel({ rows, periodoLabel, loading }: { rows: TeamPeriodSummary[]; periodoLabel: string; loading: boolean }) {
  const coordenadores = rows.filter((r) => !r.is_avulso);
  const avulsos = rows.filter((r) => r.is_avulso);

  const exportExcel = (items: TeamPeriodSummary[], kind: string) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(items.map((r) => ({
      Responsável: r.nome, Telefone: fmtTelefone(r.telefone), Tipo: r.is_avulso ? "Líder avulso" : "Coordenador", Pessoas: r.membros.length,
      Recebidas: r.atribuicoes, Cumpridas: r.cumpridas, "Abriu sem confirmar": r.abriu, "Não abriu": r.faltas, "Taxa %": r.adesao,
    }))), "Resumo das equipes");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(items.flatMap((t) => people(t).map(({ role, person: p }) => ({
      Equipe: t.nome, Função: role, Nome: p.nome, Telefone: fmtTelefone(p.telefone), Recebidas: p.publicacoes, Cumpridas: p.cumpridas,
      "Abriu sem confirmar": p.abriu_sem_confirmar, "Não abriu": p.faltas, "Taxa %": p.pct, Situação: status(p),
    })))), kind === "coordenadores" ? "Coordenadores e líderes" : "Líderes avulsos");
    XLSX.writeFile(wb, `${kind}-${periodoLabel.replace(/\s+/g, "_")}.xlsx`);
  };

  const exportPdf = (items: TeamPeriodSummary[], title: string, filename: string) => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(15); doc.text(title, 14, 14); doc.setFontSize(9); doc.text(`Período: ${periodoLabel} · ${items.length} responsável(is)`, 14, 20);
    let y = legend(doc, 24);
    items.forEach((t) => {
      if (y > 164) { doc.addPage(); y = legend(doc, 12); }
      doc.setFillColor(t.is_avulso ? 15 : 30, t.is_avulso ? 118 : 64, t.is_avulso ? 110 : 175); doc.roundedRect(14, y, 269, 10, 1, 1, "F");
      doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.text(`${t.is_avulso ? "LÍDER AVULSO" : "EQUIPE"}: ${t.nome}`, 18, y + 6.5); doc.text(`${t.cumpridas}/${t.atribuicoes} · ${fmtPct(t.adesao)}`, 245, y + 6.5);
      doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
      reportTable(doc, people(t).map(({ role, person }) => tableRow(role, person)), y + 11);
      y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 7;
    });
    doc.save(`${filename}-${periodoLabel.replace(/\s+/g, "_")}.pdf`);
  };

  const exportIndividual = (t: TeamPeriodSummary) => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(15); doc.text(`${t.is_avulso ? "Resultado do líder avulso" : "Equipe do coordenador"}: ${t.nome}`, 14, 14);
    doc.setFontSize(9); doc.text(`Período: ${periodoLabel} · Equipe: ${t.cumpridas}/${t.atribuicoes} (${fmtPct(t.adesao)})`, 14, 20);
    const listed = new Set(people(t).map(({ person }) => person.pessoa_id));
    const body = people(t).map(({ role, person }) => tableRow(role, person));
    t.membros.filter((p) => !listed.has(p.pessoa_id)).forEach((p) => body.push(tableRow(p.cargo || "Integrante", p)));
    reportTable(doc, body, legend(doc, 24));
    doc.save(`resultado-${t.nome.replace(/[^a-z0-9]+/gi, "-")}-${periodoLabel.replace(/\s+/g, "_")}.pdf`);
  };

  const PersonLine = ({ p, role, highlight }: { p: PeriodPersonResult; role: string; highlight?: boolean }) => <div className={`grid gap-2 border-t px-3 py-2 text-sm sm:grid-cols-[minmax(180px,1fr)_150px_repeat(4,75px)_145px] ${highlight ? "bg-blue-50 text-blue-950" : "bg-background"}`}>
    <div><span className="font-semibold">{p.nome}</span><span className="ml-2 text-xs text-muted-foreground">{role}</span></div>
    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{fmtTelefone(p.telefone)}</span>
    <span><small className="text-muted-foreground">Recebidas</small><br />{p.publicacoes}</span><span><small className="text-muted-foreground">Cumpridas</small><br />{p.cumpridas}</span>
    <span><small className="text-muted-foreground">Abriu</small><br />{p.abriu_sem_confirmar}</span><span><small className="text-muted-foreground">Não abriu</small><br />{p.faltas}</span>
    <Badge variant="outline" className={statusClass(p)}>{fmtPct(p.pct)} · {status(p)}</Badge>
  </div>;

  const Group = ({ title, description, items, kind }: { title: string; description: string; items: TeamPeriodSummary[]; kind: "coordenadores" | "avulsos" }) => <Card>
    <CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle className="text-base">{title}</CardTitle><CardDescription>{description}</CardDescription></div><div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={!items.length || loading} onClick={() => exportExcel(items, kind)}><FileDown className="mr-1 h-4 w-4" />Excel completo</Button>
      <Button size="sm" variant="outline" disabled={!items.length || loading} onClick={() => exportPdf(items, title, kind)}><FileDown className="mr-1 h-4 w-4" />PDF completo</Button>
    </div></div></CardHeader>
    <CardContent>{loading ? <p className="py-8 text-center text-sm text-muted-foreground">Calculando resultados do período…</p> : <div className="space-y-3">{items.map((t) => <div key={t.root_id} className="overflow-hidden rounded-lg border">
      <div className={`flex flex-wrap items-center gap-3 p-3 text-white ${t.is_avulso ? "bg-teal-700" : "bg-blue-800"}`}><div className="min-w-52 flex-1"><p className="font-semibold">{t.nome}</p><p className="text-xs text-white/80">{fmtTelefone(t.telefone)} · equipe: {t.cumpridas}/{t.atribuicoes} cumpridas</p></div><Badge className="border-white/30 bg-white/15 text-white">Equipe {fmtPct(t.adesao)}</Badge><Button size="sm" variant="secondary" onClick={() => exportIndividual(t)}><FileDown className="mr-1 h-4 w-4" />PDF desta equipe</Button></div>
      <PersonLine p={t.responsavel} role={t.is_avulso ? "Líder avulso" : "Coordenador · desempenho próprio"} highlight />
      {t.lideres.map((p) => <PersonLine key={p.pessoa_id} p={p} role="Líder da equipe" />)}
      {!t.is_avulso && !t.lideres.length && <p className="border-t p-3 text-sm text-muted-foreground">Nenhum líder cadastrado abaixo deste coordenador.</p>}
    </div>)}{!items.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum resultado neste período.</p>}</div>}</CardContent>
  </Card>;

  return <div className="space-y-4"><div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><p className="flex items-center gap-2 font-semibold"><Info className="h-4 w-4" />Como interpretar o relatório</p><p className="mt-1 text-xs leading-5">Recebidas são as missões atribuídas. Cumpridas são as confirmações. “Abriu” acessou, mas não confirmou; “Não abriu” não acessou. A taxa é Cumpridas ÷ Recebidas. O coordenador aparece em azul e seu resultado é somente o que ele próprio fez; o cabeçalho representa toda a equipe.</p></div>
    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" />Coordenadores, líderes das equipes e líderes avulsos aparecem separados.</div>
    <Group title="Resultado geral dos coordenadores" description="Total da equipe, desempenho próprio do coordenador e resultado individual de todos os seus líderes." items={coordenadores} kind="coordenadores" />
    <Group title="Resultado geral dos líderes avulsos" description="Resultado individual de cada líder que não pertence a uma equipe de coordenador." items={avulsos} kind="avulsos" />
  </div>;
}

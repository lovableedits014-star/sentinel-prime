import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDown, MessageCircle, Megaphone } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  fetchFaltantes, fmtData, fmtPct, fmtTelefone, STATUS_PUB_LABEL, waLink,
  type Faltante, type PublicacaoAudit, type PublicacaoDesempenho,
} from "@/lib/engagement-desempenho";

export default function PublicacoesDesempenhoPanel({
  clientId,
  audienceId,
  rows,
  periodoLabel,
  audit,
}: {
  clientId: string;
  audienceId: string | null;
  rows: PublicacaoDesempenho[];
  periodoLabel: string;
  audit: PublicacaoAudit[];
}) {
  const [alvo, setAlvo] = useState<PublicacaoDesempenho | null>(null);
  const [faltantes, setFaltantes] = useState<Faltante[]>([]);
  const [carregando, setCarregando] = useState(false);

  const abrirFaltantes = async (p: PublicacaoDesempenho) => {
    setAlvo(p);
    setCarregando(true);
    try {
      setFaltantes(await fetchFaltantes(clientId, p.mission_id, audienceId));
    } catch (e) {
      toast.error("Erro ao carregar faltantes: " + (e as Error).message);
      setFaltantes([]);
    } finally {
      setCarregando(false);
    }
  };

  const exportarExcel = () => {
    const data = rows.map((p) => {
      const a = audit.find((item) => item.mission_id === p.mission_id);
      return ({
      Publicação: p.titulo || "—",
      Plataforma: p.plataforma || "—",
      Data: fmtData(p.publicado_em),
      "Contratados no disparo": a?.publico_congelado ?? p.obrigados,
      "Público válido (pessoas únicas)": p.obrigados,
      Dispensados: a?.dispensados ?? 0,
      "Duplicados consolidados": a?.duplicados ?? 0,
      Confirmaram: p.cumpriram,
      "Abriu sem confirmar": p.abriu_sem_confirmar,
      "Não abriu": p.faltaram,
      "Comprovação validada": p.e1,
      "Confirmou no portal": p.e2,
      "Evidência aprovada": p.e3,
      "Taxa de cumprimento %": Number(p.adesao),
    }); });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Publicações");
    XLSX.writeFile(wb, `publicacoes-desempenho-${periodoLabel}.xlsx`);
  };

  const exportarPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Desempenho por publicação", 14, 14);
    doc.setFontSize(9);
    doc.text(`Período: ${periodoLabel}`, 14, 20);
    autoTable(doc, {
      startY: 26,
      styles: { fontSize: 8 },
      head: [["Missão", "Rede", "Data", "Público válido", "Confirmaram", "Abriu s/ confirmar", "Não abriu", "Taxa"]],
      body: rows.map((p) => [
        (p.titulo || "—").slice(0, 60),
        p.plataforma || "—",
        fmtData(p.publicado_em),
        p.obrigados,
        p.cumpriram,
        p.abriu_sem_confirmar,
        p.faltaram,
        fmtPct(p.adesao),
      ]),
    });
    doc.save(`publicacoes-desempenho-${periodoLabel}.pdf`);
  };

  return (
    <Card>
      <CardHeader className="px-3 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-primary" /> Desempenho por publicação
            </CardTitle>
            <CardDescription className="text-xs">
              “Contratados no disparo” é a quantidade que já estava contratada quando a missão foi publicada. Contratações posteriores entram somente nas próximas missões.
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
      <CardContent className="px-3 sm:px-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Publicação</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Contratados no disparo</TableHead>
                <TableHead className="text-right">Público válido</TableHead>
                <TableHead className="text-right">Confirmaram</TableHead>
                <TableHead className="text-right">Abriu s/ confirmar</TableHead>
                <TableHead className="text-right">Não abriram</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                    Nenhuma publicação no período selecionado.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((p) => {
                const a = audit.find((item) => item.mission_id === p.mission_id);
                return <TableRow key={p.mission_id}>
                  <TableCell className="max-w-[280px]">
                    <p className="truncate font-medium">{p.titulo || "Publicação sem título"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.plataforma || "—"} · Portal {p.e2} · Comprovadas {p.e1 + p.e3}
                      {!!a?.dispensados && ` · ${a.dispensados} dispensados`}
                      {!!a?.duplicados && ` · ${a.duplicados} duplicados consolidados`}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs">{fmtData(p.publicado_em)}</TableCell>
                  <TableCell className="text-right tabular-nums">{a?.publico_congelado ?? p.obrigados}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{p.obrigados}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-emerald-600">{p.cumpriram}</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-600">{p.abriu_sem_confirmar}</TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">{p.faltaram}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className="tabular-nums">{fmtPct(p.adesao)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => abrirFaltantes(p)} className="gap-1.5">
                      <MessageCircle className="h-4 w-4" /> Cobrar
                    </Button>
                  </TableCell>
                </TableRow>;
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quem não cumpriu</DialogTitle>
            <DialogDescription>{alvo?.titulo || "Publicação"}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!carregando && faltantes.length === 0 && (
              <p className="text-sm text-muted-foreground">Todos cumpriram esta publicação. 👏</p>
            )}
            {faltantes.map((f) => {
              const link = waLink(
                f.telefone,
                `Oi ${f.nome.split(" ")[0]}! Falta você cumprir a missão: ${alvo?.titulo || "nossa publicação"}. Pode confirmar pelo link, por favor?`,
              );
              return (
                <div key={`${f.origem}-${f.pessoa_id}`} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.nome}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {f.cargo || "—"} · {f.regiao || f.cidade || "—"} · {fmtTelefone(f.telefone)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{STATUS_PUB_LABEL[f.status]}</Badge>
                    {link && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={link} target="_blank" rel="noreferrer">WhatsApp</a>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

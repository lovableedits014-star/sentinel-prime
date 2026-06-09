import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUpDown, ChevronRight, Download } from "lucide-react";
import type { RankingRow } from "./useRankingIndicadores";

type SortKey = "pessoa_nome" | "indicados_total" | "confirmados" | "taxa_conversao" | "ultima_atividade";

interface Props {
  rows: RankingRow[];
  tipoFiltro: "coordenador" | "lider" | "liderado" | "todos";
  onSelect: (row: RankingRow) => void;
}

function exportCsv(rows: RankingRow[]) {
  const header = ["Nome","Tipo","Cidade","Coordenador","Indicados","Ligados","Confirmados","Indecisos","Não vota","Pendentes","% Conversão","Meta","Última atividade"];
  const lines = rows.map((r) => [
    r.pessoa_nome, r.pessoa_tipo, r.cidade ?? "", r.coordenador_nome ?? "",
    r.indicados_total, r.ligados, r.confirmados, r.indecisos, r.rejeitados, r.pendentes,
    r.taxa_conversao ?? "", r.meta, r.ultima_atividade ?? "",
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `ranking-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function fmtUlt(s: string | null) {
  if (!s) return "—";
  const d = new Date(s).getTime();
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `${days}d`;
  return new Date(s).toLocaleDateString("pt-BR");
}

function MiniStack({ conf, ind, rej }: { conf: number; ind: number; rej: number }) {
  const total = conf + ind + rej;
  if (total === 0) return <span className="text-xs text-muted-foreground">sem ligações</span>;
  const pConf = (conf / total) * 100;
  const pInd = (ind / total) * 100;
  const pRej = (rej / total) * 100;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex h-1.5 w-20 rounded overflow-hidden bg-muted">
            <div style={{ width: `${pConf}%` }} className="bg-green-500" />
            <div style={{ width: `${pInd}%` }} className="bg-yellow-500" />
            <div style={{ width: `${pRej}%` }} className="bg-red-500" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-0.5">
            <div>✅ Confirmados: {conf}</div>
            <div>🤔 Indecisos: {ind}</div>
            <div>❌ Não vota: {rej}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function RankingTable({ rows, tipoFiltro, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("confirmados");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    if (tipoFiltro === "todos") return rows;
    return rows.filter((r) => r.pessoa_tipo === tipoFiltro);
  }, [rows, tipoFiltro]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const Th = ({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-primary text-xs uppercase tracking-wide">
        {label} <ArrowUpDown className="w-3 h-3" />
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? "pessoa" : "pessoas"} · clique para ver indicados
        </p>
        <Button variant="outline" size="sm" onClick={() => exportCsv(sorted)}>
          <Download className="w-4 h-4 mr-2" /> CSV
        </Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 text-center text-xs uppercase">#</TableHead>
              <Th k="pessoa_nome" label="Pessoa" />
              <TableHead className="text-xs uppercase">Cidade</TableHead>
              <Th k="indicados_total" label="Indicados" align="right" />
              <Th k="confirmados" label="Confirmados" align="right" />
              <Th k="taxa_conversao" label="% Conv." align="right" />
              <TableHead className="text-xs uppercase min-w-[140px]">Meta</TableHead>
              <Th k="ultima_atividade" label="Atividade" align="right" />
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sem dados.</TableCell></TableRow>
            )}
            {sorted.map((r, idx) => {
              const pct = r.meta > 0 ? Math.min(100, Math.round((r.indicados_total / r.meta) * 100)) : 0;
              return (
                <TableRow key={r.pessoa_id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelect(r)}>
                  <TableCell className="text-center text-muted-foreground text-sm">{idx + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.pessoa_nome}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Badge variant="outline" className="px-1 py-0 h-4 text-[10px] capitalize">{r.pessoa_tipo}</Badge>
                      {r.coordenador_nome && <span>· {r.coordenador_nome}</span>}
                      {r.filhos_count > 0 && <span>· {r.filhos_count} sob ele</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.cidade || "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-semibold tabular-nums">{r.indicados_total}</span>
                      <MiniStack conf={r.confirmados} ind={r.indecisos} rej={r.rejeitados} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-green-600 tabular-nums">{r.confirmados}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.taxa_conversao != null ? `${r.taxa_conversao}%` : "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs">
                        <span className="tabular-nums">{r.indicados_total}/{r.meta}</span>
                        <span className={pct >= 100 ? "text-green-600" : "text-muted-foreground"}>{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{fmtUlt(r.ultima_atividade)}</TableCell>
                  <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

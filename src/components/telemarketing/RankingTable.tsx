import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Download } from "lucide-react";
import type { RankingRow } from "./useRankingIndicadores";

type SortKey = "pessoa_nome" | "indicados_total" | "ligados" | "confirmados" | "taxa_conversao" | "meta";

interface Props {
  rows: RankingRow[];
  tipoFiltro: "coordenador" | "lider" | "todos";
}

function exportCsv(rows: RankingRow[]) {
  const header = ["Nome","Tipo","Cidade","Coordenador","Líderes","Indicados","Ligados","Confirmados","Indecisos","Rejeitados","Pendentes","% Conversão","Meta","Última atividade"];
  const lines = rows.map((r) => [
    r.pessoa_nome, r.pessoa_tipo, r.cidade ?? "", r.coordenador_nome ?? "",
    r.filhos_count, r.indicados_total, r.ligados, r.confirmados, r.indecisos, r.rejeitados, r.pendentes,
    r.taxa_conversao ?? "", r.meta, r.ultima_atividade ?? "",
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `ranking-indicadores-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export default function RankingTable({ rows, tipoFiltro }: Props) {
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

  const SortableTh = ({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-primary">
        {label} <ArrowUpDown className="w-3 h-3" />
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{sorted.length} {sorted.length === 1 ? "registro" : "registros"}</p>
        <Button variant="outline" size="sm" onClick={() => exportCsv(sorted)}>
          <Download className="w-4 h-4 mr-2" /> CSV
        </Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTh k="pessoa_nome" label="Nome" />
              <TableHead>Tipo</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead>Coordenador</TableHead>
              <TableHead className="text-right">Líderes</TableHead>
              <SortableTh k="indicados_total" label="Indicados" align="right" />
              <SortableTh k="ligados" label="Ligados" align="right" />
              <SortableTh k="confirmados" label="Confirmados" align="right" />
              <TableHead className="text-right">Indecisos</TableHead>
              <TableHead className="text-right">Rejeitados</TableHead>
              <SortableTh k="taxa_conversao" label="% Conv." align="right" />
              <SortableTh k="meta" label="Meta" align="right" />
              <TableHead className="text-right">Δ Meta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">Sem dados.</TableCell></TableRow>
            )}
            {sorted.map((r) => {
              const delta = r.indicados_total - r.meta;
              return (
                <TableRow key={r.pessoa_id}>
                  <TableCell className="font-medium">{r.pessoa_nome}</TableCell>
                  <TableCell>
                    <Badge variant={r.pessoa_tipo === "coordenador" || r.pessoa_tipo === "lider" ? "default" : "secondary"}>
                      {r.pessoa_tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.cidade || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.coordenador_nome || "—"}</TableCell>
                  <TableCell className="text-right">{r.filhos_count}</TableCell>
                  <TableCell className="text-right font-medium">{r.indicados_total}</TableCell>
                  <TableCell className="text-right">{r.ligados}</TableCell>
                  <TableCell className="text-right font-semibold text-green-600">{r.confirmados}</TableCell>
                  <TableCell className="text-right text-yellow-600">{r.indecisos}</TableCell>
                  <TableCell className="text-right text-red-600">{r.rejeitados}</TableCell>
                  <TableCell className="text-right">{r.taxa_conversao != null ? `${r.taxa_conversao}%` : "—"}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{r.meta}</TableCell>
                  <TableCell className={`text-right font-medium ${delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {delta >= 0 ? "+" : ""}{delta}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Grid3x3, FileDown, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import { fmtData, fmtPct, type PessoaDesempenho, type PublicacaoDesempenho } from "@/lib/engagement-desempenho";

const CELL: Record<string, string> = {
  cumpriu: "bg-emerald-500/80",
  abriu: "bg-amber-400/80",
  nao_abriu: "bg-destructive/60",
};

export default function MatrizCumprimentoPanel({
  pessoas,
  publicacoes,
  periodoLabel,
}: {
  pessoas: PessoaDesempenho[];
  publicacoes: PublicacaoDesempenho[];
  periodoLabel: string;
}) {
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(80);

  const cols = useMemo(
    () =>
      [...publicacoes].sort(
        (a, b) => new Date(b.publicado_em || 0).getTime() - new Date(a.publicado_em || 0).getTime(),
      ),
    [publicacoes],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pessoas.filter((p) => !q || p.nome.toLowerCase().includes(q));
  }, [pessoas, busca]);

  const statusDe = (p: PessoaDesempenho, missionId: string) =>
    p.detalhe.find((d) => d.mission_id === missionId)?.status || "nao_abriu";

  const exportarExcel = () => {
    const data = filtradas.map((p) => {
      const row: Record<string, string | number> = {
        Nome: p.nome,
        Cargo: p.cargo || "—",
        Região: p.regiao || p.cidade || "—",
        "Cumprimento %": Number(p.pct),
      };
      for (const c of cols) {
        row[`${(c.titulo || "Publicação").slice(0, 25)} (${fmtData(c.publicado_em)})`] =
          statusDe(p, c.mission_id) === "cumpriu" ? "Cumpriu" : statusDe(p, c.mission_id) === "abriu" ? "Abriu" : "Faltou";
      }
      return row;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Matriz");
    XLSX.writeFile(wb, `matriz-cumprimento-${periodoLabel}.xlsx`);
  };

  return (
    <Card>
      <CardHeader className="px-3 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Grid3x3 className="h-4 w-4 text-primary" /> Matriz pessoa × publicação
            </CardTitle>
            <CardDescription className="text-xs">
              Verde cumpriu · amarelo abriu e não confirmou · vermelho não abriu.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={exportarExcel} className="gap-1.5">
            <FileDown className="h-4 w-4" /> Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6">
        <div className="relative max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa" className="pl-8" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-background p-2 text-left">Pessoa</th>
                {cols.map((c) => (
                  <th key={c.mission_id} className="p-1 text-center align-bottom">
                    <div className="mx-auto w-16 truncate text-[10px] text-muted-foreground" title={c.titulo || ""}>
                      {fmtData(c.publicado_em)}
                    </div>
                  </th>
                ))}
                <th className="p-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, limite).map((p) => (
                <tr key={`${p.origem}-${p.pessoa_id}`} className="border-t">
                  <td className="sticky left-0 max-w-[200px] truncate bg-background p-2">{p.nome}</td>
                  {cols.map((c) => {
                    const st = statusDe(p, c.mission_id);
                    return (
                      <td key={c.mission_id} className="p-1">
                        <div
                          className={cn("mx-auto h-4 w-10 rounded", CELL[st])}
                          title={`${c.titulo || "Publicação"} · ${st}`}
                        />
                      </td>
                    );
                  })}
                  <td className="p-2 text-right font-semibold tabular-nums">{fmtPct(p.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtradas.length > limite && (
          <Button variant="outline" size="sm" onClick={() => setLimite((l) => l + 80)}>
            Mostrar mais ({filtradas.length - limite} restantes)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import IndicadosDaPessoaList from "./IndicadosDaPessoaList";
import type { RankingRow } from "./useRankingIndicadores";

interface Props {
  row: RankingRow | null;
  onClose: () => void;
  clientId: string;
  universo: "eleicao" | "contratados";
  campanhaId?: string | null;
  dataDe?: string | null;
  dataAte?: string | null;
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${tone || ""}`}>{value}</div>
    </div>
  );
}

export default function RankingPersonDrawer({ row, onClose, clientId, universo, campanhaId, dataDe, dataAte }: Props) {
  const [incluirFilhos, setIncluirFilhos] = useState(true);
  const open = !!row;
  if (!row) return null;

  const isCoord = row.pessoa_tipo === "coordenador" || (universo === "contratados" && row.pessoa_tipo === "lider");
  const metaPct = row.meta > 0 ? Math.min(100, Math.round((row.indicados_total / row.meta) * 100)) : 0;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <SheetTitle>{row.pessoa_nome}</SheetTitle>
            <Badge variant="secondary" className="capitalize">{row.pessoa_tipo}</Badge>
          </div>
          <SheetDescription>
            {[row.bairro, row.cidade].filter(Boolean).join(" · ") || "—"}
            {row.coordenador_nome && ` · Coordenador: ${row.coordenador_nome}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi label="Indicados" value={row.indicados_total} />
          <Kpi label="Ligados" value={row.ligados} />
          <Kpi label="✅ Confirmados" value={row.confirmados} tone="text-green-600" />
          <Kpi label="🤔 Indecisos" value={row.indecisos} tone="text-yellow-600" />
          <Kpi label="❌ Não vota" value={row.rejeitados} tone="text-red-600" />
          <Kpi label="⏳ Pendentes" value={row.pendentes} tone="text-muted-foreground" />
          <Kpi label="% Conversão" value={row.taxa_conversao != null ? `${row.taxa_conversao}%` : "—"} />
          <Kpi label="Meta" value={`${row.indicados_total}/${row.meta}`} />
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Progresso da meta</span>
            <span>{metaPct}%</span>
          </div>
          <Progress value={metaPct} />
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Indicados {isCoord && row.filhos_count > 0 ? "(via líderes e diretos)" : "diretos"}</h3>
            {isCoord && row.filhos_count > 0 && (
              <div className="flex items-center gap-2">
                <Label htmlFor="incluir-filhos" className="text-sm">Incluir indicados dos {universo === "eleicao" ? "líderes" : "liderados"}</Label>
                <Switch id="incluir-filhos" checked={incluirFilhos} onCheckedChange={setIncluirFilhos} />
              </div>
            )}
          </div>
          <IndicadosDaPessoaList
            clientId={clientId}
            pessoaId={row.pessoa_id}
            pessoaNome={row.pessoa_nome}
            universo={universo}
            incluirFilhos={isCoord && incluirFilhos}
            campanhaId={campanhaId}
            dataDe={dataDe}
            dataAte={dataAte}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { Trophy, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingRow } from "./useRankingIndicadores";

export default function RankingHighlights({ rows, universo }: { rows: RankingRow[]; universo: "eleicao" | "contratados" }) {
  const coordenadores = rows.filter((r) => r.pessoa_tipo === "coordenador" || r.pessoa_tipo === "lider" && !r.coordenador_id);
  const lideres = rows.filter((r) => r.pessoa_tipo === "lider" || r.pessoa_tipo === "liderado");

  const topCoord = [...coordenadores].sort((a, b) => b.confirmados - a.confirmados).slice(0, 3);
  const topConv = [...lideres]
    .filter((r) => r.ligados >= 5 && r.taxa_conversao !== null)
    .sort((a, b) => (b.taxa_conversao || 0) - (a.taxa_conversao || 0))
    .slice(0, 3);

  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const inativos = coordenadores
    .filter((r) => !r.ultima_atividade || new Date(r.ultima_atividade).getTime() < sevenDaysAgo)
    .slice(0, 5);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="w-4 h-4 text-yellow-500" /> {universo === "eleicao" ? "Top coordenadores" : "Top líderes"} (confirmados)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {topCoord.length === 0 && <p className="text-sm text-muted-foreground">Sem dados ainda.</p>}
          {topCoord.map((r, i) => (
            <div key={r.pessoa_id} className="flex justify-between text-sm">
              <span className="truncate">{i + 1}. {r.pessoa_nome}</span>
              <span className="font-semibold text-green-600">{r.confirmados}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4 text-blue-500" /> Top líderes (% conversão)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {topConv.length === 0 && <p className="text-sm text-muted-foreground">Mínimo 5 ligações para entrar no ranking.</p>}
          {topConv.map((r, i) => (
            <div key={r.pessoa_id} className="flex justify-between text-sm">
              <span className="truncate">{i + 1}. {r.pessoa_nome}</span>
              <span className="font-semibold">{r.taxa_conversao}%</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-orange-500" /> {universo === "eleicao" ? "Coordenadores" : "Líderes"} inativos (7d)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {inativos.length === 0 && <p className="text-sm text-muted-foreground">Todos com atividade recente. 👍</p>}
          {inativos.map((r) => (
            <div key={r.pessoa_id} className="flex justify-between text-sm">
              <span className="truncate">{r.pessoa_nome}</span>
              <span className="text-muted-foreground">{r.indicados_total} ind.</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

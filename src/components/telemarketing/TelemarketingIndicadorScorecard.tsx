import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Trophy, Award, AlertTriangle, ChevronRight, Vote } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Score {
  indicador_id: string;
  indicador_nome: string | null;
  indicador_tipo: string;
  total_indicados: number;
  ligados: number;
  confirmados: number;
  rejeitados: number;
  indecisos: number;
  recusou: number;
  nao_atendeu: number;
  invalidos: number;
  taxa_confirmacao: number;
  taxa_voto_efetivo: number;
  score_qualidade: number;
}

interface DrillRow {
  id: string; nome: string; telefone: string; cidade: string | null; bairro: string | null;
  status_telemarketing: string | null; ultimo_status_ligacao: string | null;
  vota_candidato: string | null; ultima_ligacao_em: string | null; total_tentativas: number;
}

const TIPO_LABEL: Record<string, string> = { coordenador: "Coordenador", lider: "Líder", cabo: "Cabo" };

export default function TelemarketingIndicadorScorecard({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState<string>("__all__");
  const [drill, setDrill] = useState<{ indicador: Score; data: DrillRow[]; loading: boolean } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("tele_indicador_scorecard" as any, {
      _client_id: clientId,
      _campanha_id: null,
      _indicador_tipo: tipoFiltro === "__all__" ? null : tipoFiltro,
    });
    setLoading(false);
    if (error) return;
    setRows((data as any[]) || []);
  };

  useEffect(() => { if (clientId) load(); /* eslint-disable-next-line */ }, [clientId, tipoFiltro]);

  const openDrill = async (s: Score) => {
    setDrill({ indicador: s, data: [], loading: true });
    const { data } = await supabase.rpc("tele_indicador_drill" as any, {
      _client_id: clientId, _indicador_id: s.indicador_id, _campanha_id: null,
    });
    setDrill({ indicador: s, data: (data as any[]) || [], loading: false });
  };

  const top = rows.slice(0, 10);
  const bottom = [...rows].filter(r => r.ligados >= 3).sort((a, b) => a.taxa_voto_efetivo - b.taxa_voto_efetivo).slice(0, 10);
  const totalConfirmados = rows.reduce((s, r) => s + r.confirmados, 0);
  const totalIndicados = rows.reduce((s, r) => s + r.total_indicados, 0);
  const totalInvalidos = rows.reduce((s, r) => s + r.invalidos, 0);
  const alertas = rows.filter(r => r.ligados >= 5 && r.taxa_voto_efetivo < 20);

  const chartData = top.map(r => ({
    nome: (r.indicador_nome || "—").slice(0, 18),
    Confirmados: r.confirmados,
    Rejeitados: r.rejeitados,
    Inválidos: r.invalidos,
  }));

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Vote className="w-4 h-4 text-primary" />
            Qualidade dos Indicadores (Eleição)
          </CardTitle>
          <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os tipos</SelectItem>
              <SelectItem value="coordenador">Coordenadores</SelectItem>
              <SelectItem value="lider">Líderes</SelectItem>
              <SelectItem value="cabo">Cabos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Cruzamento entre indicações da Eleição × resultado das ligações de telemarketing.
          Mede quem está trazendo votos reais e quem está inflando indicações.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum indicador com indicações ainda. Cadastre coordenadores/líderes/cabos na Eleição e designe os indicados a uma campanha de telemarketing.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="border rounded-lg p-3"><p className="text-[10px] uppercase text-muted-foreground">Indicados</p><p className="text-xl font-bold">{totalIndicados}</p></div>
              <div className="border rounded-lg p-3"><p className="text-[10px] uppercase text-muted-foreground">Confirmados</p><p className="text-xl font-bold text-emerald-600">{totalConfirmados}</p></div>
              <div className="border rounded-lg p-3"><p className="text-[10px] uppercase text-muted-foreground">Telefones inválidos</p><p className="text-xl font-bold text-amber-600">{totalInvalidos}</p></div>
              <div className="border rounded-lg p-3"><p className="text-[10px] uppercase text-muted-foreground">Alertas de qualidade</p><p className="text-xl font-bold text-destructive">{alertas.length}</p></div>
            </div>

            {chartData.length > 0 && (
              <div className="h-64 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="nome" fontSize={10} angle={-25} textAnchor="end" height={60} />
                    <YAxis fontSize={10} />
                    <Tooltip />
                    <Bar dataKey="Confirmados" stackId="a" fill="hsl(var(--primary))" />
                    <Bar dataKey="Rejeitados" stackId="a" fill="hsl(var(--destructive))" />
                    <Bar dataKey="Inválidos" stackId="a" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-semibold uppercase mb-2 flex items-center gap-1 text-emerald-700"><Trophy className="w-3.5 h-3.5" /> Top 10 — Voto efetivo</h4>
                <div className="space-y-1">
                  {top.map(r => (
                    <button key={r.indicador_id} onClick={() => openDrill(r)} className="w-full flex items-center justify-between p-2 border rounded hover:bg-muted/50 text-left">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.indicador_nome || "—"}</p>
                        <p className="text-[10px] text-muted-foreground">{TIPO_LABEL[r.indicador_tipo] ?? r.indicador_tipo} · {r.total_indicados} indicados · {r.ligados} ligados</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="default" className="text-[10px]">{r.confirmados} ✓</Badge>
                        <Badge variant="secondary" className="text-[10px]">{r.taxa_voto_efetivo}%</Badge>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase mb-2 flex items-center gap-1 text-destructive"><AlertTriangle className="w-3.5 h-3.5" /> Atenção — baixo desempenho</h4>
                <div className="space-y-1">
                  {bottom.length === 0 && <p className="text-xs text-muted-foreground">Sem dados suficientes ainda (mínimo 3 ligados).</p>}
                  {bottom.map(r => (
                    <button key={r.indicador_id} onClick={() => openDrill(r)} className="w-full flex items-center justify-between p-2 border rounded hover:bg-muted/50 text-left">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.indicador_nome || "—"}</p>
                        <p className="text-[10px] text-muted-foreground">{TIPO_LABEL[r.indicador_tipo] ?? r.indicador_tipo} · {r.invalidos} inválidos · {r.rejeitados} rejeitados</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="destructive" className="text-[10px]">{r.taxa_voto_efetivo}%</Badge>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1"><Award className="w-3 h-3" /> Ver tabela completa ({rows.length} indicadores)</summary>
              <div className="overflow-auto mt-2 border rounded">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50"><tr>
                    <th className="text-left p-2">Indicador</th><th className="p-2">Tipo</th>
                    <th className="p-2">Indicados</th><th className="p-2">Ligados</th>
                    <th className="p-2 text-emerald-700">Sim</th><th className="p-2 text-destructive">Não</th>
                    <th className="p-2">Indeciso</th><th className="p-2">Inválido</th>
                    <th className="p-2">% Conf.</th><th className="p-2">% Voto efet.</th><th className="p-2">Score</th>
                  </tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.indicador_id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => openDrill(r)}>
                        <td className="p-2 font-medium">{r.indicador_nome || "—"}</td>
                        <td className="p-2 text-center">{TIPO_LABEL[r.indicador_tipo] ?? r.indicador_tipo}</td>
                        <td className="p-2 text-center">{r.total_indicados}</td>
                        <td className="p-2 text-center">{r.ligados}</td>
                        <td className="p-2 text-center text-emerald-700 font-medium">{r.confirmados}</td>
                        <td className="p-2 text-center text-destructive">{r.rejeitados}</td>
                        <td className="p-2 text-center">{r.indecisos}</td>
                        <td className="p-2 text-center text-amber-700">{r.invalidos}</td>
                        <td className="p-2 text-center">{r.taxa_confirmacao}%</td>
                        <td className="p-2 text-center font-semibold">{r.taxa_voto_efetivo}%</td>
                        <td className="p-2 text-center">{r.score_qualidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </CardContent>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {drill?.indicador.indicador_nome} — indicados <Badge variant="outline" className="ml-2 text-[10px]">{drill && TIPO_LABEL[drill.indicador.indicador_tipo]}</Badge>
            </DialogTitle>
          </DialogHeader>
          {drill?.loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0"><tr>
                  <th className="text-left p-2">Nome</th><th className="p-2">Telefone</th>
                  <th className="p-2">Bairro</th><th className="p-2">Status</th>
                  <th className="p-2">Voto</th><th className="p-2">Última ligação</th><th className="p-2">Tent.</th>
                </tr></thead>
                <tbody>
                  {(drill?.data || []).map(d => (
                    <tr key={d.id} className="border-t">
                      <td className="p-2 font-medium">{d.nome}</td>
                      <td className="p-2">{d.telefone}</td>
                      <td className="p-2">{d.bairro || "—"}</td>
                      <td className="p-2">
                        <Badge variant={d.status_telemarketing === "confirmado" ? "default" : d.status_telemarketing === "rejeitado" ? "destructive" : "outline"} className="text-[10px]">
                          {d.status_telemarketing || "pendente"}
                        </Badge>
                      </td>
                      <td className="p-2">{d.vota_candidato || "—"}</td>
                      <td className="p-2">{d.ultima_ligacao_em ? new Date(d.ultima_ligacao_em).toLocaleString("pt-BR") : "—"}</td>
                      <td className="p-2 text-center">{d.total_tentativas}</td>
                    </tr>
                  ))}
                  {(drill?.data || []).length === 0 && (
                    <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Sem registros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

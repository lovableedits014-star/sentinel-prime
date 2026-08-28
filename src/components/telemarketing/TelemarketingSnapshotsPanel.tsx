import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Camera, TrendingDown, TrendingUp, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Snapshot {
  id: string;
  rotulo: string;
  captured_at: string;
  total: number;
  ligados: number;
  atendeu: number;
  vota_sim: number;
  vota_nao: number;
  indeciso: number;
  campanha_id: string | null;
}

interface Props { clientId: string; campanhaId: string | null; campanhaNome: string; }

const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

export default function TelemarketingSnapshotsPanel({ clientId, campanhaId, campanhaNome }: Props) {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [rotulo, setRotulo] = useState("");
  const [capturing, setCapturing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("telemarketing_relatorio_snapshots" as never)
      .select("id,rotulo,captured_at,total,ligados,atendeu,vota_sim,vota_nao,indeciso,campanha_id")
      .eq("client_id", clientId)
      .order("captured_at", { ascending: false })
      .limit(20);
    query = campanhaId ? query.eq("campanha_id", campanhaId) : query.is("campanha_id", null);
    const { data } = await query;
    setSnaps((data as unknown as Snapshot[]) || []);
    setLoading(false);
  }, [campanhaId, clientId]);

  useEffect(() => { void load(); }, [load]);

  const capture = async () => {
    if (!rotulo.trim()) { toast.error("Dê um rótulo (ex: Rodada 1 - 08/jun)"); return; }
    setCapturing(true);
    const { error } = await supabase.rpc("tele_capture_snapshot" as never, {
      _client_id: clientId,
      _rotulo: rotulo.trim(),
      _campanha_id: campanhaId,
    } as never);
    setCapturing(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Snapshot capturado");
    setRotulo("");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover snapshot?")) return;
    await supabase.from("telemarketing_relatorio_snapshots" as never).delete().eq("id", id);
    load();
  };

  const latest = snaps[0];
  const prev = snaps[1];
  const delta = (cur: number, old: number) => cur - old;
  const pctSimCur = latest ? pct(latest.vota_sim, latest.ligados) : 0;
  const pctSimPrev = prev ? pct(prev.vota_sim, prev.ligados) : 0;
  const deltaPct = pctSimCur - pctSimPrev;
  const alertDrop = prev && deltaPct <= -5;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2"><Camera className="w-4 h-4 text-primary" /> Rodadas / snapshots — {campanhaNome}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Ex: Rodada 1 - 08/jun"
            value={rotulo}
            onChange={(e) => setRotulo(e.target.value)}
            className="h-9 text-sm"
          />
          <Button onClick={capture} disabled={capturing || !rotulo.trim()} size="sm">
            {capturing ? "Capturando..." : "Capturar agora"}
          </Button>
        </div>

        {alertDrop && (
          <div className="flex items-start gap-2 text-xs bg-destructive/10 border border-destructive/30 p-2 rounded text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              Alerta: a taxa de "vota sim" caiu <strong>{Math.abs(deltaPct)} pontos percentuais</strong> em relação à rodada anterior
              ({pctSimPrev}% → {pctSimCur}%).
            </div>
          </div>
        )}

        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {!loading && snaps.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum snapshot capturado. Capture um ao final de cada rodada para comparar a evolução.</p>
        )}

        {snaps.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-1.5">Rodada</th>
                  <th className="py-1.5">Data</th>
                  <th className="py-1.5 text-right">Ligados</th>
                  <th className="py-1.5 text-right">Vota sim</th>
                  <th className="py-1.5 text-right">% sim</th>
                  <th className="py-1.5 text-right">Δ sim</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {snaps.map((s, i) => {
                  const pSim = pct(s.vota_sim, s.ligados);
                  const nxt = snaps[i + 1];
                  const d = nxt ? delta(s.vota_sim, nxt.vota_sim) : null;
                  return (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-1.5 font-medium">{s.rotulo}</td>
                      <td className="py-1.5 text-muted-foreground">{new Date(s.captured_at).toLocaleString("pt-BR")}</td>
                      <td className="py-1.5 text-right">{s.ligados}</td>
                      <td className="py-1.5 text-right">{s.vota_sim}</td>
                      <td className="py-1.5 text-right">
                        <Badge variant={pSim >= 50 ? "default" : "secondary"} className="text-[10px]">{pSim}%</Badge>
                      </td>
                      <td className="py-1.5 text-right">
                        {d === null ? "—" : (
                          <span className={`inline-flex items-center gap-0.5 ${d >= 0 ? "text-green-600" : "text-destructive"}`}>
                            {d >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {d >= 0 ? "+" : ""}{d}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">
                        <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

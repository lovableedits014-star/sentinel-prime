import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, AlertTriangle, Settings2 } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import RankingHighlights from "@/components/telemarketing/RankingHighlights";
import RankingTable from "@/components/telemarketing/RankingTable";
import RankingPersonDrawer from "@/components/telemarketing/RankingPersonDrawer";
import {
  useRankingIndicadores,
  type RankingRow,
} from "@/components/telemarketing/useRankingIndicadores";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";

interface Campanha {
  id: string;
  nome: string;
  ativo: boolean;
}
interface MetaCfg {
  meta_coordenador: number;
  meta_lider: number;
  meta_cabo: number;
}

const PERIODOS = [
  { id: "tudo", label: "Tudo", days: null as number | null },
  { id: "hoje", label: "Hoje", days: 0 },
  { id: "7d", label: "7 dias", days: 7 },
  { id: "30d", label: "30 dias", days: 30 },
];

export default function TelemarketingAdminRanking() {
  const { clientId } = useActiveClientId();
  const [universo, setUniverso] = useState<"eleicao" | "contratados">("eleicao");
  const [tipoFiltro, setTipoFiltro] = useState<"coordenador" | "lider" | "liderado" | "todos">(
    "coordenador",
  );
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [campanhaId, setCampanhaId] = useState<string>("all");
  const [periodo, setPeriodo] = useState<string>("tudo");
  const [dataDe, setDataDe] = useState<string>("");
  const [dataAte, setDataAte] = useState<string>("");
  const [metaCfg, setMetaCfg] = useState<MetaCfg | null>(null);
  const [selected, setSelected] = useState<RankingRow | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    void supabase
      .from("telemarketing_campanhas" as any)
      .select("id, nome, ativo")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setCampanhas(((data as any[]) || []) as Campanha[]));
    void supabase
      .from("eleicao_indicacao_config" as any)
      .select("meta_coordenador, meta_lider, meta_cabo")
      .eq("client_id", clientId)
      .maybeSingle()
      .then(({ data }) =>
        setMetaCfg((data as any) || { meta_coordenador: 30, meta_lider: 30, meta_cabo: 5 }),
      );
  }, [clientId]);

  const { dataDeISO, dataAteISO } = useMemo(() => {
    const p = PERIODOS.find((p) => p.id === periodo);
    if (!p) return { dataDeISO: null, dataAteISO: null };
    if (p.id === "tudo") {
      return {
        dataDeISO: dataDe ? new Date(dataDe).toISOString() : null,
        dataAteISO: dataAte ? new Date(dataAte + "T23:59:59").toISOString() : null,
      };
    }
    const now = new Date();
    const start = new Date(now);
    if (p.days === 0) start.setHours(0, 0, 0, 0);
    else start.setDate(start.getDate() - (p.days || 0));
    return { dataDeISO: start.toISOString(), dataAteISO: null };
  }, [periodo, dataDe, dataAte]);

  const { rows, loading, error, reload } = useRankingIndicadores(clientId, {
    campanhaId: campanhaId === "all" ? null : campanhaId,
    dataDe: dataDeISO,
    dataAte: dataAteISO,
    universo,
  });

  useEffect(() => {
    if (universo === "contratados" && tipoFiltro === "coordenador") setTipoFiltro("lider");
    if (universo === "eleicao" && tipoFiltro === "liderado") setTipoFiltro("coordenador");
  }, [universo]); // eslint-disable-line react-hooks/exhaustive-deps

  const inativos = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    return rows.filter(
      (r) =>
        (r.pessoa_tipo === "coordenador" ||
          (universo === "contratados" && r.pessoa_tipo === "lider")) &&
        (!r.ultima_atividade || new Date(r.ultima_atividade).getTime() < cutoff),
    );
  }, [rows, universo]);

  return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Ranking</h1>
        <p className="text-sm text-muted-foreground">
          Quem traz mais resultado pra campanha. Clique numa linha para ver os indicados dela e o
          que cada um respondeu no telemarketing.
        </p>
        {error && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span>Erro ao carregar o ranking: {error}</span>
            <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
              Tentar novamente
            </Button>
          </div>
        )}
      </div>

      {metaCfg && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Settings2 className="w-3.5 h-3.5" />
          Metas atuais — Coordenador:{" "}
          <strong className="text-foreground">{metaCfg.meta_coordenador}</strong> · Líder:{" "}
          <strong className="text-foreground">{metaCfg.meta_lider}</strong> · Cabo:{" "}
          <strong className="text-foreground">{metaCfg.meta_cabo}</strong>
          <Button asChild variant="link" size="sm" className="h-auto px-1 py-0">
            <Link to="/eleicao">Abrir Eleição</Link>
          </Button>
        </div>
      )}

      <Card className="mb-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div>
              <Label className="text-xs">Universo</Label>
              <Tabs value={universo} onValueChange={(v) => setUniverso(v as any)} className="mt-1">
                <TabsList>
                  <TabsTrigger value="eleicao">Eleição</TabsTrigger>
                  <TabsTrigger value="contratados">Contratados</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div>
              <Label className="text-xs">Período</Label>
              <Tabs value={periodo} onValueChange={setPeriodo} className="mt-1">
                <TabsList>
                  {PERIODOS.map((p) => (
                    <TabsTrigger key={p.id} value={p.id}>
                      {p.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <div className="ml-auto">
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {advancedOpen ? "Ocultar" : "Filtros avançados"}
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            </div>
          </div>
          <Collapsible open={advancedOpen}>
            <CollapsibleContent>
              <div className="grid gap-3 md:grid-cols-4 pt-2 border-t">
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as any)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {universo === "eleicao" ? (
                        <>
                          <SelectItem value="coordenador">Coordenadores</SelectItem>
                          <SelectItem value="lider">Líderes</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="lider">Líderes</SelectItem>
                          <SelectItem value="liderado">Liderados</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Campanha</Label>
                  <Select value={campanhaId} onValueChange={setCampanhaId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {campanhas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                          {!c.ativo ? " (inativa)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {periodo === "tudo" && (
                  <>
                    <div>
                      <Label className="text-xs">De</Label>
                      <Input
                        type="date"
                        value={dataDe}
                        onChange={(e) => setDataDe(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Até</Label>
                      <Input
                        type="date"
                        value={dataAte}
                        onChange={(e) => setDataAte(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {inativos.length > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-md px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          <span>
            <strong>{inativos.length}</strong>{" "}
            {inativos.length === 1 ? "líder/coordenador" : "líderes/coordenadores"} sem atividade
            nos últimos 7 dias.
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          <RankingHighlights rows={rows} universo={universo} />
          <RankingTable rows={rows} tipoFiltro={tipoFiltro} onSelect={setSelected} />
        </div>
      )}

      {clientId && (
        <RankingPersonDrawer
          row={selected}
          onClose={() => setSelected(null)}
          clientId={clientId}
          universo={universo}
          campanhaId={campanhaId === "all" ? null : campanhaId}
          dataDe={dataDeISO}
          dataAte={dataAteISO}
        />
      )}
    </div>
  );
}

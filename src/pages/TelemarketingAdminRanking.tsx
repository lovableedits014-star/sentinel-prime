import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import RankingHighlights from "@/components/telemarketing/RankingHighlights";
import RankingTable from "@/components/telemarketing/RankingTable";
import { useRankingIndicadores } from "@/components/telemarketing/useRankingIndicadores";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

interface Campanha { id: string; nome: string; ativo: boolean; }

export default function TelemarketingAdminRanking() {
  const { clientId } = useActiveClientId();
  const [universo, setUniverso] = useState<"eleicao" | "contratados">("eleicao");
  const [tipoFiltro, setTipoFiltro] = useState<"coordenador" | "lider" | "todos">("coordenador");
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [campanhaId, setCampanhaId] = useState<string>("all");
  const [dataDe, setDataDe] = useState<string>("");
  const [dataAte, setDataAte] = useState<string>("");

  useEffect(() => {
    if (!clientId) return;
    void supabase.from("telemarketing_campanhas" as any)
      .select("id, nome, ativo")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setCampanhas(((data as any[]) || []) as Campanha[]));
  }, [clientId]);

  const { rows, loading, error } = useRankingIndicadores(clientId, {
    campanhaId: campanhaId === "all" ? null : campanhaId,
    dataDe: dataDe ? new Date(dataDe).toISOString() : null,
    dataAte: dataAte ? new Date(dataAte + "T23:59:59").toISOString() : null,
    universo,
  });

  // Quando muda o universo, ajusta o filtro de tipo para um valor válido.
  useEffect(() => {
    if (universo === "contratados" && tipoFiltro === "coordenador") setTipoFiltro("lider");
    if (universo === "eleicao" && tipoFiltro === "liderado" as any) setTipoFiltro("coordenador");
  }, [universo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Ranking de coordenadores e líderes</h1>
        <p className="text-sm text-muted-foreground">
          Veja quem traz mais resultado pra campanha — indicados, ligações concluídas, votos confirmados e conversão.
          Os totais do coordenador somam os indicados dos líderes sob ele.
        </p>
        {error && <p className="text-sm text-destructive mt-2">Erro ao carregar: {error}</p>}
      </div>

      <Card className="mb-6">
        <CardContent className="p-4 grid gap-4 md:grid-cols-5">
          <div>
            <Label>Universo</Label>
            <Tabs value={universo} onValueChange={(v) => setUniverso(v as any)} className="mt-1">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="eleicao">Eleição</TabsTrigger>
                <TabsTrigger value="contratados">Contratados</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as any)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
            <Label>Campanha</Label>
            <Select value={campanhaId} onValueChange={setCampanhaId}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as campanhas</SelectItem>
                {campanhas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}{!c.ativo ? " (inativa)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>De</Label>
            <Input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-6">
          <RankingHighlights rows={rows} />
          <RankingTable rows={rows} tipoFiltro={tipoFiltro} />
        </div>
      )}
    </div>
  );
}

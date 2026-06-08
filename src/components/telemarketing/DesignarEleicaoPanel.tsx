import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Vote, Target, Users2, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Campanha { id: string; nome: string; }
interface Indicador { id: string; nome: string; tipo: string; cidade: string | null; }

const TIPO_LABEL: Record<string, string> = {
  coordenador: "Coordenador",
  lider: "Líder",
  cabo: "Cabo",
};

export default function DesignarEleicaoPanel({ clientId, campanhas, onChanged }: {
  clientId: string;
  campanhas: Campanha[];
  onChanged?: () => void;
}) {
  const [campanhaId, setCampanhaId] = useState<string>("");
  const [tipo, setTipo] = useState<string>("__all__");
  const [indicadorId, setIndicadorId] = useState<string>("__all__");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [status, setStatus] = useState<string>("__all__");
  const [apenasNaoLigados, setApenasNaoLigados] = useState(true);
  const [substituir, setSubstituir] = useState(false);
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [preview, setPreview] = useState<{ total: number; pendentes: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    supabase.rpc("tele_list_indicadores" as any, { _client_id: clientId }).then(({ data }) => {
      setIndicadores((data as any[]) || []);
    });
  }, [clientId]);

  const filtros = () => ({
    cidade: cidade.trim() || "",
    bairro: bairro.trim() || "",
    indicador_tipo: tipo === "__all__" ? "" : tipo,
    indicador_id: indicadorId === "__all__" ? "" : indicadorId,
    status: status === "__all__" ? "" : status,
    apenas_nao_ligados: apenasNaoLigados,
  });

  const doPreview = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("tele_preview_eleicao_indicados" as any, {
      _client_id: clientId,
      _filtros: filtros() as any,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setPreview(data as any);
  };

  const designar = async () => {
    if (!campanhaId) { toast.error("Selecione a campanha"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("tele_designar_eleicao_indicados" as any, {
      _client_id: clientId,
      _campanha_id: campanhaId,
      _filtros: filtros() as any,
      _substituir: substituir,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${(data as any)?.atribuidos ?? 0} indicado(s) designados à campanha`);
    setPreview(null);
    onChanged?.();
  };

  const indicadoresFiltrados = tipo === "__all__"
    ? indicadores
    : indicadores.filter(i => i.tipo === tipo);

  return (
    <Card className="lg:col-span-2 border-primary/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Vote className="w-4 h-4 text-primary" />
          Designar indicados da Eleição
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Selecione subset de indicados (de coordenadores, líderes ou cabos) e atribua a uma campanha de telemarketing.
          A fila do operador passa a incluir esses contatos automaticamente.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Campanha destino *</label>
            <Select value={campanhaId} onValueChange={setCampanhaId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {campanhas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Tipo de indicador</label>
            <Select value={tipo} onValueChange={(v) => { setTipo(v); setIndicadorId("__all__"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="coordenador">Coordenador</SelectItem>
                <SelectItem value="lider">Líder</SelectItem>
                <SelectItem value="cabo">Cabo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Indicador específico</label>
            <Select value={indicadorId} onValueChange={setIndicadorId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {indicadoresFiltrados.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.nome} <span className="text-muted-foreground">· {TIPO_LABEL[i.tipo] ?? i.tipo}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Status atual</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="rejeitado">Rejeitado</SelectItem>
                <SelectItem value="indeciso">Indeciso</SelectItem>
                <SelectItem value="recusou">Recusou</SelectItem>
                <SelectItem value="nao_atendeu">Não atendeu</SelectItem>
                <SelectItem value="invalido">Inválido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block flex items-center gap-1"><MapPin className="w-3 h-3" /> Cidade</label>
            <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: Campo Grande" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Bairro</label>
            <Input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex: Centro" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={apenasNaoLigados} onChange={(e) => setApenasNaoLigados(e.target.checked)} />
            Apenas ainda não ligados
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
            Substituir designação existente
          </label>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={doPreview} disabled={busy}>
            <Target className="w-3.5 h-3.5 mr-1" /> Pré-visualizar
          </Button>
          <Button size="sm" onClick={designar} disabled={busy || !campanhaId}>
            <Users2 className="w-3.5 h-3.5 mr-1" /> Designar à campanha
          </Button>
          {preview && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary">{preview.total} indicados elegíveis</Badge>
              <Badge variant="outline">{preview.pendentes} pendentes</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

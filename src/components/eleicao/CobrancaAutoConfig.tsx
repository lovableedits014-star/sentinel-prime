import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Bot, Calendar, Clock } from "lucide-react";

type Cfg = {
  id?: string;
  client_id: string;
  ativo: boolean;
  frequencia: "diaria" | "semanal";
  dias_semana: number[];
  hora_envio: string;
  filtro_tipo: string | null;
  filtro_status: "all" | "zerados" | "abaixo" | "ok";
  mensagem_template: string;
  janela_horas: number;
  max_por_disparo: number;
  cascata: boolean;
  ultimo_disparo_em?: string | null;
  ultimo_resultado?: string | null;
};

const DEFAULT_TEMPLATE =
  "Olá {primeiro_nome}! Faltam {faltam} indicações para sua meta de {meta} para {candidato}. Use seu link: {link}";

const DIAS = [
  { v: 1, l: "Seg" }, { v: 2, l: "Ter" }, { v: 3, l: "Qua" },
  { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sáb" }, { v: 7, l: "Dom" },
];

export default function CobrancaAutoConfig({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<Cfg>({
    client_id: clientId,
    ativo: false,
    frequencia: "semanal",
    dias_semana: [1, 3, 5],
    hora_envio: "10:00",
    filtro_tipo: null,
    filtro_status: "abaixo",
    mensagem_template: DEFAULT_TEMPLATE,
    janela_horas: 48,
    max_por_disparo: 300,
    cascata: false,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("eleicao_cobranca_auto_config" as any)
        .select("*").eq("client_id", clientId).maybeSingle();
      if (data) setCfg({
        ...(data as any),
        hora_envio: String((data as any).hora_envio).slice(0, 5),
      });
      setLoading(false);
    })();
  }, [clientId]);

  function toggleDia(d: number) {
    setCfg((c) => ({
      ...c,
      dias_semana: c.dias_semana.includes(d)
        ? c.dias_semana.filter((x) => x !== d)
        : [...c.dias_semana, d].sort((a, b) => a - b),
    }));
  }

  async function salvar() {
    setSaving(true);
    const payload = { ...cfg, client_id: clientId, hora_envio: cfg.hora_envio.length === 5 ? cfg.hora_envio + ":00" : cfg.hora_envio };
    const { error } = await supabase
      .from("eleicao_cobranca_auto_config" as any)
      .upsert(payload, { onConflict: "client_id" });
    setSaving(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Cobrança automática salva!");
  }

  if (loading) return <Card className="p-5"><Loader2 className="w-4 h-4 animate-spin" /></Card>;

  return (
    <Card className="p-5 space-y-4 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Bot className="w-4 h-4" />Cobrança automática</h3>
          <p className="text-xs text-muted-foreground mt-1">
            O sistema dispara cobranças por WhatsApp automaticamente nos dias/horários definidos, respeitando os filtros e a janela de não-reenvio.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Label htmlFor="auto-ativo" className="text-sm">Ativa</Label>
          <Switch id="auto-ativo" checked={cfg.ativo} onCheckedChange={(v) => setCfg({ ...cfg, ativo: v })} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
        <div>
          <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" />Frequência</Label>
          <Select value={cfg.frequencia} onValueChange={(v: any) => setCfg({ ...cfg, frequencia: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="diaria">Diária (todo dia)</SelectItem>
              <SelectItem value="semanal">Dias selecionados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs flex items-center gap-1"><Clock className="w-3 h-3" />Horário (fuso BRT)</Label>
          <Input type="time" value={cfg.hora_envio} onChange={(e) => setCfg({ ...cfg, hora_envio: e.target.value })} />
        </div>
      </div>

      {cfg.frequencia === "semanal" && (
        <div>
          <Label className="text-xs">Dias da semana</Label>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {DIAS.map((d) => (
              <Button key={d.v} type="button" size="sm"
                variant={cfg.dias_semana.includes(d.v) ? "default" : "outline"}
                onClick={() => toggleDia(d.v)}>{d.l}</Button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
        <div>
          <Label className="text-xs">Filtrar por tipo</Label>
          <Select value={cfg.filtro_tipo || "all"} onValueChange={(v) => setCfg({ ...cfg, filtro_tipo: v === "all" ? null : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="coordenador">Coordenadores</SelectItem>
              <SelectItem value="lider">Líderes</SelectItem>
              <SelectItem value="cabo">Cabos eleitorais</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Filtrar por status</Label>
          <Select value={cfg.filtro_status} onValueChange={(v: any) => setCfg({ ...cfg, filtro_status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="zerados">Zerados (0 indicações)</SelectItem>
              <SelectItem value="abaixo">Abaixo da meta</SelectItem>
              <SelectItem value="ok">Bateu a meta</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs">Mensagem</Label>
        <Textarea rows={4} value={cfg.mensagem_template}
          onChange={(e) => setCfg({ ...cfg, mensagem_template: e.target.value })} />
        <p className="text-[11px] text-muted-foreground mt-1">
          Variáveis: <code>{"{primeiro_nome}"}</code>, <code>{"{nome}"}</code>, <code>{"{meta}"}</code>, <code>{"{total}"}</code>, <code>{"{faltam}"}</code>, <code>{"{candidato}"}</code>, <code>{"{link}"}</code>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
        <div>
          <Label className="text-xs">Não reenviar nas últimas (horas)</Label>
          <Input type="number" min={0} max={720} value={cfg.janela_horas}
            onChange={(e) => setCfg({ ...cfg, janela_horas: parseInt(e.target.value) || 0 })} />
          <p className="text-[11px] text-muted-foreground mt-1">Pula indicadores cobrados recentemente. 0 = sempre reenvia.</p>
        </div>
        <div>
          <Label className="text-xs">Máximo por disparo</Label>
          <Input type="number" min={1} max={2000} value={cfg.max_por_disparo}
            onChange={(e) => setCfg({ ...cfg, max_por_disparo: parseInt(e.target.value) || 1 })} />
        </div>
      </div>

      <div className="border-t pt-4 flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="auto-cascata" className="text-sm">Cobrar em cascata</Label>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-md">
            Além dos selecionados pelos filtros, inclui também líderes vinculados aos coordenadores e cabos vinculados aos líderes (todos abaixo da meta, conforme o status escolhido).
          </p>
        </div>
        <Switch id="auto-cascata" checked={cfg.cascata}
          onCheckedChange={(v) => setCfg({ ...cfg, cascata: v })} />
      </div>

      {cfg.ultimo_disparo_em && (
        <div className="text-xs text-muted-foreground border-t pt-3">
          Último disparo automático: {new Date(cfg.ultimo_disparo_em).toLocaleString("pt-BR")}
          {cfg.ultimo_resultado && <> — {cfg.ultimo_resultado}</>}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Salvar cobrança automática
        </Button>
      </div>
    </Card>
  );
}

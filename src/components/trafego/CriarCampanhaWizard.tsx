import { useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Rocket, ShieldCheck } from "lucide-react";
import { GuardChecklist, type GuardCheck } from "./GuardChecklist";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  onCreated: () => void;
}

const OBJETIVOS = [
  { value: "OUTCOME_AWARENESS", label: "Reconhecimento", desc: "Mostrar o candidato para o máximo de gente." },
  { value: "OUTCOME_TRAFFIC", label: "Tráfego", desc: "Levar pessoas para um site ou portal." },
  { value: "OUTCOME_ENGAGEMENT", label: "Engajamento", desc: "Mais curtidas, comentários e mensagens." },
  { value: "OUTCOME_LEADS", label: "Leads", desc: "Coletar contatos via formulário." },
];

const CTAS = [
  { value: "LEARN_MORE", label: "Saiba mais" },
  { value: "SIGN_UP", label: "Cadastre-se" },
  { value: "CONTACT_US", label: "Fale conosco" },
  { value: "DOWNLOAD", label: "Baixar" },
  { value: "WATCH_MORE", label: "Assistir mais" },
];

export function CriarCampanhaWizard({ open, onOpenChange, clientId, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [guard, setGuard] = useState<{ checks: GuardCheck[]; canPublish: boolean } | null>(null);

  const [form, setForm] = useState({
    nome: "",
    objetivo: "OUTCOME_AWARENESS",
    texto_principal: "",
    texto_descricao: "",
    call_to_action: "LEARN_MORE",
    link_destino: "",
    imagem_url: "",
    budget_diario_cents: 5000, // R$50
    start_time: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    stop_time: "",
    cidades_texto: "", // será mapeado no Meta depois (versão simples)
    age_min: 18,
    age_max: 65,
    gerado_por_ia: false,
    mencoes_adversarios: "" as string,
  });

  function update<K extends keyof typeof form>(k: K, v: typeof form[K]) { setForm(f => ({ ...f, [k]: v })); }

  async function runGuard() {
    setLoading(true);
    try {
      const adversarios = form.mencoes_adversarios.split(",").map(s => s.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke("ads-guard-check", {
        body: {
          clientId,
          nome: form.nome,
          objetivo: form.objetivo,
          texto_principal: form.texto_principal,
          texto_descricao: form.texto_descricao,
          budget_diario_cents: form.budget_diario_cents,
          budget_total_cents: form.budget_diario_cents * 30,
          imagem_url: form.imagem_url || undefined,
          gerado_por_ia: form.gerado_por_ia,
          mencoes_adversarios: adversarios,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Guard falhou");
      setGuard({ checks: data.checks, canPublish: data.canPublish });
    } catch (e: any) {
      toast.error(e.message || "Erro no Guard");
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    setLoading(true);
    try {
      const adversarios = form.mencoes_adversarios.split(",").map(s => s.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke("ads-create-campaign", {
        body: {
          clientId,
          nome: form.nome,
          objetivo: form.objetivo,
          texto_principal: form.texto_principal,
          texto_descricao: form.texto_descricao,
          call_to_action: form.call_to_action,
          link_destino: form.link_destino || undefined,
          imagem_url: form.imagem_url || undefined,
          budget_diario_cents: form.budget_diario_cents,
          budget_total_cents: 0,
          start_time: new Date(form.start_time).toISOString(),
          stop_time: form.stop_time ? new Date(form.stop_time).toISOString() : undefined,
          audience: { cidades: [], estados: [], radius_km: 10, age_min: form.age_min, age_max: form.age_max, genders: [], interesses: [] },
          gerado_por_ia: form.gerado_por_ia,
          mencoes_adversarios: adversarios,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao criar campanha");
      toast.success("Campanha criada PAUSADA na Meta — ative quando estiver pronto");
      onCreated();
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(e.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep(1);
    setGuard(null);
    setForm({
      nome: "", objetivo: "OUTCOME_AWARENESS", texto_principal: "", texto_descricao: "",
      call_to_action: "LEARN_MORE", link_destino: "", imagem_url: "",
      budget_diario_cents: 5000,
      start_time: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      stop_time: "", cidades_texto: "", age_min: 18, age_max: 65,
      gerado_por_ia: false, mencoes_adversarios: "",
    });
  }

  const canNext1 = form.nome.length >= 3 && form.objetivo;
  const canNext2 = form.age_min >= 18;
  const canNext3 = form.texto_principal.length >= 5;
  const canNext4 = form.budget_diario_cents >= 500 && form.start_time;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Rocket className="h-5 w-5" /> Nova campanha — passo {step}/4</DialogTitle>
          <DialogDescription>O Guard Eleitoral validará antes de publicar.</DialogDescription>
        </DialogHeader>
        <Progress value={step * 25} className="h-2" />

        {step === 1 && (
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome da campanha *</Label>
              <Input value={form.nome} onChange={e => update("nome", e.target.value)} placeholder="Ex: Apresentação João — Capital" />
            </div>
            <div>
              <Label>Objetivo *</Label>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {OBJETIVOS.map(o => (
                  <Card key={o.value} onClick={() => update("objetivo", o.value)} className={`cursor-pointer transition ${form.objetivo === o.value ? "border-primary bg-primary/5" : ""}`}>
                    <CardContent className="p-3">
                      <div className="font-medium">{o.label}</div>
                      <div className="text-xs text-muted-foreground">{o.desc}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-4">
            <div>
              <Label>Idade mínima (≥18 obrigatório)</Label>
              <Input type="number" min={18} max={65} value={form.age_min} onChange={e => update("age_min", Math.max(18, parseInt(e.target.value) || 18))} />
            </div>
            <div>
              <Label>Idade máxima</Label>
              <Input type="number" min={18} max={65} value={form.age_max} onChange={e => update("age_max", parseInt(e.target.value) || 65)} />
            </div>
            <div>
              <Label>Cidades/regiões (texto livre — versão simples)</Label>
              <Input value={form.cidades_texto} onChange={e => update("cidades_texto", e.target.value)} placeholder="Ex: Campo Grande, Dourados (sem efeito ainda — Brasil inteiro)" />
              <p className="text-xs text-muted-foreground mt-1">Próxima iteração: seletor geo-localizado direto da Meta. Por enquanto, campanha é segmentada por BR + faixa de idade.</p>
            </div>
            <Card className="bg-muted/30"><CardContent className="p-3 text-xs space-y-1">
              <p><strong>Bloqueios automáticos TSE:</strong></p>
              <p>• Sem lookalike de eleitores · Sem dados sensíveis · Idade mínima 18 forçada</p>
            </CardContent></Card>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-4">
            <div>
              <Label>Texto principal *</Label>
              <Textarea rows={4} value={form.texto_principal} onChange={e => update("texto_principal", e.target.value)} placeholder="Inclua o número e cargo do candidato." />
              <p className="text-xs text-muted-foreground mt-1">O disclaimer "Pago por..." será injetado automaticamente no final.</p>
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input value={form.texto_descricao} onChange={e => update("texto_descricao", e.target.value)} />
            </div>
            <div>
              <Label>URL da imagem (PNG/JPG hospedado)</Label>
              <Input value={form.imagem_url} onChange={e => update("imagem_url", e.target.value)} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Call to action</Label>
                <Select value={form.call_to_action} onValueChange={v => update("call_to_action", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CTAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Link destino</Label>
                <Input value={form.link_destino} onChange={e => update("link_destino", e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ia" checked={form.gerado_por_ia} onChange={e => update("gerado_por_ia", e.target.checked)} />
              <Label htmlFor="ia" className="cursor-pointer text-sm">Este criativo foi gerado por IA (aplica rótulo TSE)</Label>
            </div>
            <div>
              <Label>Adversários para checar (separados por vírgula)</Label>
              <Input value={form.mencoes_adversarios} onChange={e => update("mencoes_adversarios", e.target.value)} placeholder="Fulano, Sicrano" />
              <p className="text-xs text-muted-foreground mt-1">O Guard bloqueia se o texto citar algum destes nomes.</p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 py-4">
            <div>
              <Label>Orçamento diário (R$)</Label>
              <Input type="number" min={5} value={form.budget_diario_cents / 100} onChange={e => update("budget_diario_cents", Math.round(parseFloat(e.target.value) * 100) || 500)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <Input type="datetime-local" value={form.start_time} onChange={e => update("start_time", e.target.value)} />
              </div>
              <div>
                <Label>Fim (opcional)</Label>
                <Input type="datetime-local" value={form.stop_time} onChange={e => update("stop_time", e.target.value)} />
              </div>
            </div>

            <div className="pt-2">
              {!guard ? (
                <Button onClick={runGuard} disabled={loading} className="w-full">
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                  Rodar Guard Eleitoral
                </Button>
              ) : (
                <div className="space-y-3">
                  <GuardChecklist checks={guard.checks} />
                  {guard.canPublish ? (
                    <Button onClick={publish} disabled={loading} className="w-full" size="lg">
                      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
                      Publicar (criada PAUSADA na Meta)
                    </Button>
                  ) : (
                    <Badge variant="destructive" className="w-full justify-center py-2">Há bloqueios — corrija antes de publicar</Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep(s => Math.max(1, s - 1))}>
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Button>
          {step < 4 && (
            <Button onClick={() => setStep(s => Math.min(4, s + 1))} disabled={
              (step === 1 && !canNext1) || (step === 2 && !canNext2) || (step === 3 && !canNext3)
            }>
              Avançar <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

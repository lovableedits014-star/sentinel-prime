import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Send, Loader2, Play, Pause, Square, CheckCircle2, Clock, Shield, Plus,
} from "lucide-react";
import { toast } from "sonner";
import ContratadosSubNav from "@/components/contratados/ContratadosSubNav";
import { useContratadosData } from "@/components/contratados/useContratadosData";

interface DispatchJob {
  id: string; titulo: string; status: string;
  total_destinatarios: number; enviados: number; falhas: number;
  batch_size: number; delay_min_seconds: number; delay_max_seconds: number; batch_pause_seconds: number;
  mensagem_template: string; link_missao: string | null; created_at: string;
}

function AntiSpamConfig({ batchSize, setBatchSize, delayMin, setDelayMin, delayMax, setDelayMax, batchPause, setBatchPause }: any) {
  return (
    <div className="space-y-4 p-4 rounded-xl border bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-semibold"><Shield className="w-4 h-4 text-primary" />Configuração Anti-Spam</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label className="text-xs">Tamanho do lote</Label>
          <div className="flex items-center gap-2"><Slider value={[batchSize]} onValueChange={([v]) => setBatchSize(v)} min={3} max={30} step={1} /><span className="text-sm font-mono w-8 text-right">{batchSize}</span></div></div>
        <div className="space-y-2"><Label className="text-xs">Pausa entre lotes</Label>
          <div className="flex items-center gap-2"><Slider value={[batchPause]} onValueChange={([v]) => setBatchPause(v)} min={60} max={600} step={30} /><span className="text-sm font-mono w-10 text-right">{batchPause}s</span></div></div>
        <div className="space-y-2"><Label className="text-xs">Delay mín</Label>
          <div className="flex items-center gap-2"><Slider value={[delayMin]} onValueChange={([v]) => { setDelayMin(v); if (v > delayMax) setDelayMax(v); }} min={10} max={120} step={5} /><span className="text-sm font-mono w-10 text-right">{delayMin}s</span></div></div>
        <div className="space-y-2"><Label className="text-xs">Delay máx</Label>
          <div className="flex items-center gap-2"><Slider value={[delayMax]} onValueChange={([v]) => { setDelayMax(v); if (v < delayMin) setDelayMin(v); }} min={10} max={180} step={5} /><span className="text-sm font-mono w-10 text-right">{delayMax}s</span></div></div>
      </div>
      <div className="text-xs text-muted-foreground bg-background p-2 rounded-md border">
        ⏱️ Cada lote de <strong>{batchSize}</strong> msgs ≈ {Math.round(batchSize * ((delayMin + delayMax) / 2))}s + {batchPause}s pausa.
      </div>
    </div>
  );
}

function DispatchRunner({ job, contratados, onComplete }: { job: DispatchJob; contratados: any[]; onComplete: () => void }) {
  const [status, setStatus] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [isPausing, setIsPausing] = useState(false);
  const abortRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const randomDelay = useCallback(() => Math.floor(Math.random() * (job.delay_max_seconds - job.delay_min_seconds + 1) * 1000) + job.delay_min_seconds * 1000, [job]);
  const openWhatsApp = useCallback((tel: string, msg: string) => {
    const p = tel.replace(/\D/g, ""); const fp = p.startsWith("55") ? p : `55${p}`;
    window.open(`https://wa.me/${fp}?text=${encodeURIComponent(msg)}`, "_blank");
  }, []);

  const processQueue = useCallback(async () => {
    const targets = contratados.filter(c => c.status === "ativo");
    for (let i = currentIndex; i < targets.length; i++) {
      if (abortRef.current) { setStatus("paused"); setCurrentIndex(i); return; }
      const c = targets[i];
      openWhatsApp(c.telefone, job.mensagem_template.replace("{nome}", c.nome.split(" ")[0]).replace("{link}", job.link_missao || ""));
      setSentCount(p => p + 1); setCurrentIndex(i + 1);
      await supabase.from("contratado_missao_dispatches").update({ enviados: i + 1, status: "em_andamento" } as any).eq("id", job.id);
      const posInBatch = (i + 1) % job.batch_size;
      if (posInBatch === 0 && i + 1 < targets.length) {
        setIsPausing(true); setCountdown(job.batch_pause_seconds);
        const iv = setInterval(() => setCountdown(p => Math.max(0, p - 1)), 1000);
        await new Promise(r => { timerRef.current = setTimeout(r, job.batch_pause_seconds * 1000); });
        clearInterval(iv); setIsPausing(false);
        if (abortRef.current) { setStatus("paused"); setCurrentIndex(i + 1); return; }
      } else if (i + 1 < targets.length) {
        const d = randomDelay(); setCountdown(Math.ceil(d / 1000));
        const iv = setInterval(() => setCountdown(p => Math.max(0, p - 1)), 1000);
        await new Promise(r => { timerRef.current = setTimeout(r, d); });
        clearInterval(iv);
        if (abortRef.current) { setStatus("paused"); setCurrentIndex(i + 1); return; }
      }
    }
    await supabase.from("contratado_missao_dispatches").update({ status: "concluido", completed_at: new Date().toISOString(), enviados: targets.length } as any).eq("id", job.id);
    setStatus("done"); toast.success("Disparo concluído!"); onComplete();
  }, [currentIndex, contratados, job, openWhatsApp, randomDelay, onComplete]);

  const targets = contratados.filter(c => c.status === "ativo");
  const progress = targets.length > 0 ? Math.round((sentCount / targets.length) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div><CardTitle className="text-base">{job.titulo}</CardTitle>
            <CardDescription>{sentCount}/{targets.length} enviados</CardDescription></div>
          <div className="flex gap-2">
            {(status === "idle" || status === "paused") && <Button size="sm" onClick={() => { abortRef.current = false; setStatus("running"); processQueue(); }} className="gap-1.5"><Play className="w-3.5 h-3.5" />{status === "paused" ? "Retomar" : "Iniciar"}</Button>}
            {status === "running" && (<>
              <Button size="sm" variant="outline" onClick={() => { abortRef.current = true; if (timerRef.current) clearTimeout(timerRef.current); }} className="gap-1.5"><Pause className="w-3.5 h-3.5" />Pausar</Button>
              <Button size="sm" variant="destructive" onClick={async () => { abortRef.current = true; if (timerRef.current) clearTimeout(timerRef.current); setStatus("done"); await supabase.from("contratado_missao_dispatches").update({ status: "cancelado" } as any).eq("id", job.id); onComplete(); }} className="gap-1.5"><Square className="w-3.5 h-3.5" />Parar</Button>
            </>)}
            {status === "done" && <Badge variant="outline" className="gap-1"><CheckCircle2 className="w-3 h-3" />Concluído</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="w-full bg-muted rounded-full h-2.5"><div className="bg-primary h-2.5 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
        {status === "running" && countdown > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5 animate-pulse" />{isPausing ? `⏸️ Pausa: ${countdown}s` : `⏱️ Próximo em ${countdown}s`}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ContratadosDisparos() {
  const { clientId, contratados, loading } = useContratadosData();
  const [dispatches, setDispatches] = useState<DispatchJob[]>([]);
  const [activeDispatch, setActiveDispatch] = useState<DispatchJob | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("Olá {nome}! 🎯 Nova missão:\n\n{link}\n\nAcesse e interaja! 💪");
  const [link, setLink] = useState("");
  const [batchSize, setBatchSize] = useState(10);
  const [delayMin, setDelayMin] = useState(30);
  const [delayMax, setDelayMax] = useState(90);
  const [batchPause, setBatchPause] = useState(300);

  useEffect(() => {
    if (!clientId) return;
    supabase.from("contratado_missao_dispatches").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setDispatches((data || []) as any));
  }, [clientId]);

  const reload = async () => {
    if (!clientId) return;
    const { data } = await supabase.from("contratado_missao_dispatches").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20);
    setDispatches((data || []) as any);
  };

  const ativos = contratados.filter(c => c.status === "ativo");

  async function createDispatch() {
    if (!clientId || !titulo.trim() || !mensagem.trim()) { toast.error("Preencha título e mensagem."); return; }
    const { data, error } = await supabase.from("contratado_missao_dispatches").insert({
      client_id: clientId, titulo: titulo.trim(), mensagem_template: mensagem.trim(),
      link_missao: link.trim() || null, total_destinatarios: ativos.length,
      batch_size: batchSize, delay_min_seconds: delayMin, delay_max_seconds: delayMax, batch_pause_seconds: batchPause,
    } as any).select().single();
    if (error) { toast.error("Erro ao criar disparo."); return; }
    setActiveDispatch(data as any); setDispatches(prev => [data as any, ...prev]);
    setShowDialog(false); toast.success("Disparo criado!");
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6">
      <ContratadosSubNav />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Disparos de Missões</h1>
          <p className="text-sm text-muted-foreground">Envie mensagens em massa via WhatsApp para todos os contratados ativos.</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button className="gap-1.5" disabled={ativos.length === 0}><Plus className="w-4 h-4" />Novo Disparo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo Disparo</DialogTitle><DialogDescription>{ativos.length} contratados ativos</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Título *</Label><Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Missão Instagram" /></div>
              <div className="space-y-2"><Label>Link</Label><Input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." /></div>
              <div className="space-y-2"><Label>Mensagem</Label><Textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={4} /></div>
              <AntiSpamConfig {...{ batchSize, setBatchSize, delayMin, setDelayMin, delayMax, setDelayMax, batchPause, setBatchPause }} />
              <Button onClick={createDispatch} className="w-full gap-2"><Send className="w-4 h-4" />Criar Disparo ({ativos.length})</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {activeDispatch && <DispatchRunner job={activeDispatch} contratados={contratados} onComplete={() => { setActiveDispatch(null); reload(); }} />}

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" />Histórico</CardTitle></CardHeader>
          <CardContent>
            {dispatches.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum disparo realizado ainda.</p>
            ) : (
              <div className="space-y-2">
                {dispatches.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium text-sm">{d.titulo}</p>
                      <p className="text-xs text-muted-foreground">{d.enviados}/{d.total_destinatarios} • {new Date(d.created_at).toLocaleString("pt-BR")}</p>
                    </div>
                    <Badge variant={d.status === "concluido" ? "default" : d.status === "cancelado" ? "destructive" : "secondary"}>{d.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

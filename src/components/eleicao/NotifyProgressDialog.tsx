import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Circle, MinusCircle, RefreshCw, SkipForward } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StepKey = "coordenador" | "secretaria" | "lider";
type StepStatus = "pending" | "sending" | "success" | "error" | "skipped";

interface Step {
  key: StepKey;
  label: string;
  sendingLabel: string;
  doneLabel: string;
  status: StepStatus;
  error?: string;
  reason?: string;
  destinatario?: string | null;
  telefone?: string | null;
  instancia?: string | null;
  messageId?: string | null;
}

const INITIAL_STEPS: Step[] = [
  { key: "coordenador", label: "Coordenador", sendingLabel: "Enviando para Coordenador…", doneLabel: "Enviado para Coordenador", status: "pending" },
  { key: "secretaria", label: "Secretaria", sendingLabel: "Enviando para Secretaria…", doneLabel: "Enviado para Secretaria", status: "pending" },
  { key: "lider", label: "Líder cadastrado", sendingLabel: "Enviando mensagem para o líder…", doneLabel: "Enviado para o líder", status: "pending" },
];

interface Props {
  open: boolean;
  pessoaId: string | null;
  onClose: () => void;
}

export function NotifyProgressDialog({ open, pessoaId, onClose }: Props) {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [paused, setPaused] = useState(false);
  const ranRef = useRef<string | null>(null);

  // Reset ao abrir
  useEffect(() => {
    if (open && pessoaId && ranRef.current !== pessoaId) {
      setSteps(INITIAL_STEPS.map(s => ({ ...s })));
      setCurrentIdx(0);
      setPaused(false);
      ranRef.current = pessoaId;
      // dispara primeira etapa
      void runStep(0, INITIAL_STEPS.map(s => ({ ...s })));
    }
    if (!open) {
      ranRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pessoaId]);

  function updateStep(idx: number, patch: Partial<Step>) {
    setSteps(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  async function runStep(idx: number, base?: Step[]) {
    if (!pessoaId) return;
    const list = base || steps;
    if (idx >= list.length) return;
    const step = list[idx];
    setCurrentIdx(idx);
    setPaused(false);
    updateStep(idx, { status: "sending", error: undefined, reason: undefined });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Sessão expirada — faça login novamente");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/eleicao-notify-novo-lider`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || (import.meta.env as any).VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ pessoa_id: pessoaId, target: step.key }),
        },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || `Falha (status ${resp.status})`);
      }
      const result = data?.result;
      if (result?.sent) {
        updateStep(idx, { status: "success" });
        // próxima etapa
        await sleep(400);
        if (idx + 1 < INITIAL_STEPS.length) {
          await runStep(idx + 1);
        }
      } else {
        // não enviou: distinguir motivo (sem destinatário) vs erro real
        const reason = result?.reason;
        const error = result?.error;
        if (reason && !error) {
          updateStep(idx, { status: "skipped", reason });
          await sleep(300);
          if (idx + 1 < INITIAL_STEPS.length) {
            await runStep(idx + 1);
          }
        } else {
          updateStep(idx, { status: "error", error: error || reason || "Falha desconhecida" });
          setPaused(true);
        }
      }
    } catch (e: any) {
      updateStep(idx, { status: "error", error: e?.message || "Erro inesperado" });
      setPaused(true);
    }
  }

  function retry(idx: number) {
    void runStep(idx);
  }

  function skip(idx: number) {
    updateStep(idx, { status: "skipped", reason: "Ignorado pelo usuário" });
    setPaused(false);
    // continua para a próxima
    setTimeout(() => {
      if (idx + 1 < INITIAL_STEPS.length) {
        void runStep(idx + 1);
      }
    }, 200);
  }

  const allDone = steps.every(s => s.status === "success" || s.status === "skipped" || s.status === "error" ? s.status !== "error" : false);
  const hasFailure = steps.some(s => s.status === "error");
  const canClose = !steps.some(s => s.status === "sending" || s.status === "pending") || allDone;

  function handleClose() {
    if (steps.some(s => s.status === "sending")) return;
    const failed = steps.filter(s => s.status === "error");
    const ok = steps.filter(s => s.status === "success");
    if (failed.length > 0) {
      toast.warning(`Notificações concluídas com ${failed.length} falha(s)`, {
        description: failed.map(f => `${f.label}: ${f.error}`).join("\n"),
        duration: 8000,
      });
    } else if (ok.length > 0) {
      toast.success("Notificações concluídas", {
        description: `${ok.length} mensagem(ns) enviada(s) com sucesso`,
      });
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviando notificações</DialogTitle>
          <DialogDescription>
            Acompanhe o envio das mensagens de WhatsApp para cada destinatário.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 py-2">
          {steps.map((step, idx) => (
            <li
              key={step.key}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                step.status === "sending" && "border-primary/40 bg-primary/5",
                step.status === "success" && "border-emerald-500/30 bg-emerald-500/5",
                step.status === "error" && "border-destructive/40 bg-destructive/5",
                step.status === "skipped" && "border-muted bg-muted/30",
                step.status === "pending" && "border-muted",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {step.status === "pending" && <Circle className="h-5 w-5 text-muted-foreground" />}
                  {step.status === "sending" && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
                  {step.status === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                  {step.status === "error" && <XCircle className="h-5 w-5 text-destructive" />}
                  {step.status === "skipped" && <MinusCircle className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">
                    {step.status === "sending" && step.sendingLabel}
                    {step.status === "success" && `Pronto! ${step.doneLabel}`}
                    {step.status === "error" && `Falha ao enviar para ${step.label}`}
                    {step.status === "skipped" && `${step.label} — ignorado`}
                    {step.status === "pending" && `Aguardando: ${step.label}`}
                  </div>
                  {step.status === "error" && step.error && (
                    <div className="text-xs text-destructive mt-1 break-words">{step.error}</div>
                  )}
                  {step.status === "skipped" && step.reason && (
                    <div className="text-xs text-muted-foreground mt-1">{step.reason}</div>
                  )}
                </div>
                {step.status === "error" && (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => retry(idx)} className="h-7 px-2">
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Tentar novamente
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => skip(idx)} className="h-7 px-2">
                      <SkipForward className="h-3.5 w-3.5 mr-1" /> Ignorar
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button onClick={handleClose} disabled={!canClose} variant={hasFailure ? "outline" : "default"}>
            {canClose ? "Fechar" : "Aguarde…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

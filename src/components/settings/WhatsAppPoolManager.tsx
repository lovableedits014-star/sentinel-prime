import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Smartphone, ShieldCheck, Activity, AlertTriangle, WifiOff } from "lucide-react";
import { toast } from "sonner";
import WhatsAppInstancePoolCard, { type PoolInstance } from "./WhatsAppInstancePoolCard";
import WhatsAppPoolSummary from "./WhatsAppPoolSummary";
import WhatsAppWindowSettings from "./WhatsAppWindowSettings";
import AddInstanceDialog from "./AddInstanceDialog";

interface Props {
  clientId: string;
}

export default function WhatsAppPoolManager({ clientId }: Props) {
  const [instances, setInstances] = useState<PoolInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const fetchInstances = useCallback(async () => {
    // Garante que há sessão ativa antes de chamar a edge function (evita 401 durante refresh)
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
      body: { action: "list_instances", client_id: clientId },
    });

    const msg = (error?.message || data?.error || "") as string;
    const isAuthOrTransient =
      msg.toLowerCase().includes("unauthorized") ||
      msg.toLowerCase().includes("non-2xx");

    if (error || data?.error) {
      if (!isAuthOrTransient) {
        toast.error("Erro ao carregar instâncias: " + (msg || "desconhecido"));
      } else {
        console.warn("[WhatsAppPoolManager] erro transitório (mantendo lista atual):", msg);
      }
    } else {
      setInstances((data?.instances || []) as PoolInstance[]);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    fetchInstances();
    const id = setInterval(fetchInstances, 30000);
    return () => clearInterval(id);
  }, [fetchInstances]);

  const activeCount = instances.filter((i) => i.is_active && i.status === "connected").length;

  // Instâncias ATIVAS desconectadas há mais de 10 minutos
  const TEN_MIN_MS = 10 * 60 * 1000;
  const now = Date.now();
  const stuckDisconnected = instances.filter((i) => {
    if (!i.is_active) return false;
    if (i.status === "connected") return false;
    if (!i.last_disconnected_at) return false;
    return now - new Date(i.last_disconnected_at).getTime() >= TEN_MIN_MS;
  });

  const formatDownTime = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 60) return `há ${diff} min`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `há ${h}h`;
    return `há ${Math.floor(h / 24)}d`;
  };

  const scrollToInstance = (id: string) => {
    const el = document.getElementById(`wa-instance-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-red-500");
      setTimeout(() => el.classList.remove("ring-2", "ring-red-500"), 2500);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              Pool de Instâncias WhatsApp
              <span className="text-xs font-normal text-muted-foreground">(anti-banimento)</span>
            </CardTitle>
            <CardDescription>
              Conecte vários números (chips) para distribuir disparos automaticamente e reduzir risco de banimento.
              O sistema escolhe o chip mais "descansado" e saudável a cada envio.
            </CardDescription>
          </div>
          <Button onClick={() => setAddOpen(true)} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="w-4 h-4 mr-1" />
            Adicionar Instância
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando pool...</span>
          </div>
        ) : (
          <>
            <WhatsAppPoolSummary instances={instances} clientId={clientId} />

            {stuckDisconnected.length > 0 && (
              <div className="rounded-lg border-2 border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-3 space-y-2 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                      {stuckDisconnected.length === 1
                        ? "1 instância está desconectada há mais de 10 minutos"
                        : `${stuckDisconnected.length} instâncias estão desconectadas há mais de 10 minutos`}
                    </p>
                    <p className="text-xs text-red-700/80 dark:text-red-400/80 mt-0.5">
                      Disparos automáticos podem estar sendo afetados. Reconecte agora para evitar falhas.
                    </p>
                  </div>
                </div>
                <ul className="space-y-1.5 pl-7">
                  {stuckDisconnected.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center justify-between gap-2 text-xs bg-white/60 dark:bg-red-950/40 rounded px-2.5 py-1.5"
                    >
                      <span className="flex items-center gap-1.5 text-red-900 dark:text-red-200 min-w-0">
                        <WifiOff className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-medium truncate">{i.apelido}</span>
                        <span className="text-red-600/70 dark:text-red-400/70 whitespace-nowrap">
                          · offline {formatDownTime(i.last_disconnected_at!)}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2.5 text-xs shrink-0"
                        onClick={() => scrollToInstance(i.id)}
                      >
                        Reconectar agora
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activeCount === 1 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Activity className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Você tem apenas <b>1 chip ativo</b>. Adicione mais instâncias para distribuir o volume de disparos
                  e reduzir significativamente o risco de banimento pelo WhatsApp.
                </span>
              </div>
            )}

            {instances.length === 0 ? (
              <div className="text-center py-10 border rounded-lg border-dashed">
                <Smartphone className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">Nenhuma instância cadastrada</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Adicione seu primeiro chip para começar a enviar mensagens.
                </p>
                <Button onClick={() => setAddOpen(true)} variant="outline">
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar Primeira Instância
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {instances.map((inst) => (
                  <WhatsAppInstancePoolCard
                    key={inst.id}
                    clientId={clientId}
                    instance={inst}
                    onChange={fetchInstances}
                  />
                ))}
              </div>
            )}

            <WhatsAppWindowSettings clientId={clientId} />
          </>
        )}
      </CardContent>

      <AddInstanceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        clientId={clientId}
        onCreated={fetchInstances}
      />
    </Card>
  );
}
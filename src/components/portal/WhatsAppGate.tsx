import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MessageCircle, ShieldCheck, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

type WhatsAppLink = {
  webUrl: string;
};

interface WhatsAppGateProps {
  clientId: string;
  clientName?: string;
  clientLogo?: string | null;
  role: "apoiador" | "funcionario" | "contratado";
  userName: string;
  /** Called after the user confirms — parent should refetch / unlock the portal */
  onConfirmed: () => void;
  /**
   * Opcional: função que verifica no banco se o WhatsApp já foi confirmado
   * (pelo webhook automático). Se retornar true, o portal é liberado sem clique.
   */
  checkConfirmed?: () => Promise<boolean>;
}

/**
 * Full-screen blocking overlay shown the first time a user accesses the portal.
 * Forces the user to send a message to the campaign's official WhatsApp number
 * before unlocking the portal — protects the main number from being banned.
 */
export default function WhatsAppGate({
  clientId,
  clientName,
  clientLogo,
  role,
  userName,
  onConfirmed,
  checkConfirmed,
}: WhatsAppGateProps) {
  const [loading, setLoading] = useState(false);
  const openedKey = `whatsapp_gate_opened_${clientId}_${role}_${userName}`;
  const [opened, setOpened] = useState(() => {
    try { return localStorage.getItem(openedKey) === "true"; } catch { return false; }
  });
  const [autoChecking, setAutoChecking] = useState(false);
  const [whatsAppLink, setWhatsAppLink] = useState<WhatsAppLink | null>(null);
  const intervalRef = useRef<number | null>(null);

  const roleLabel =
    role === "funcionario" ? "funcionário" : role === "contratado" ? "contratado" : "apoiador";

  useEffect(() => {
    let cancelled = false;

    const resolveLink = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("resolve-whatsapp-link", {
          body: { client_id: clientId, role },
        });
        if (error) throw error;
        const waUrl = data?.wa_url as string | undefined;
        if (!waUrl || cancelled) return;
        const msg = `Olá! Sou ${userName}, confirmando meu cadastro como ${roleLabel}${
          clientName ? ` em ${clientName}` : ""
        }.`;
        const phone = waUrl.replace(/\D/g, "");
        const text = encodeURIComponent(msg);
        setWhatsAppLink({
          webUrl: `https://wa.me/${phone}?text=${text}`,
        });
      } catch (err) {
        console.error("[WhatsAppGate] resolve link error:", err);
      }
    };

    resolveLink();
    return () => {
      cancelled = true;
    };
  }, [clientId, role, userName, roleLabel, clientName]);

  // Polling automático: depois que o usuário abre o WhatsApp, verificamos a cada 4s
  // se o webhook da bridge já confirmou a mensagem recebida.
  useEffect(() => {
    if (!opened || !checkConfirmed) return;

    setAutoChecking(true);
    let stopped = false;

    const tick = async () => {
      try {
        const ok = await checkConfirmed();
        if (ok && !stopped) {
          stopped = true;
          if (intervalRef.current) window.clearInterval(intervalRef.current);
          toast.success("Mensagem recebida! Liberando portal automaticamente...");
          onConfirmed();
        }
      } catch (err) {
        console.error("[WhatsAppGate] auto-check error:", err);
      }
    };

    intervalRef.current = window.setInterval(tick, 4000);
    return () => {
      stopped = true;
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      setAutoChecking(false);
    };
  }, [opened, checkConfirmed, onConfirmed]);

  const openResolvedWhatsApp = (link: WhatsAppLink) => {
    setOpened(true);
    try { localStorage.setItem(openedKey, "true"); } catch {}
    toast.success("Envie a mensagem no WhatsApp e volte aqui para liberar o portal.");
    // Abre em nova aba/app (não navega a página atual). Isso evita que, ao voltar,
    // o navegador dispare novamente o popup nativo "Abrir no WhatsApp?" e mantém
    // o polling automático rodando nesta aba.
    const w = window.open(link.webUrl, "_blank", "noopener,noreferrer");
    if (!w) {
      // Se o navegador bloqueou o popup, faz fallback para a navegação direta.
      window.location.href = link.webUrl;
    }
  };

  const handleOpenWhatsApp = async () => {
    if (whatsAppLink) {
      openResolvedWhatsApp(whatsAppLink);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-whatsapp-link", {
        body: { client_id: clientId, role },
      });
      if (error) throw error;
      const waUrl = data?.wa_url as string | undefined;
      if (!waUrl) {
        toast.error("WhatsApp Oficial não configurado para esta campanha.");
        return;
      }
      const msg = `Olá! Sou ${userName}, confirmando meu cadastro como ${roleLabel}${
        clientName ? ` em ${clientName}` : ""
      }.`;
      const phone = waUrl.replace(/\D/g, "");
      const text = encodeURIComponent(msg);
      const link = {
        webUrl: `https://wa.me/${phone}?text=${text}`,
      };
      setWhatsAppLink(link);
      openResolvedWhatsApp(link);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao abrir WhatsApp");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    try { localStorage.removeItem(openedKey); } catch {}
    toast.success("WhatsApp confirmado! Liberando portal...");
    onConfirmed();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <Card className="w-full max-w-md shadow-2xl border-primary/30">
        <CardContent className="pt-8 pb-6 space-y-5 text-center">
          <div className="w-20 h-20 rounded-2xl mx-auto overflow-hidden bg-primary flex items-center justify-center shadow-lg">
            {clientLogo ? (
              <img src={clientLogo} alt="" className="w-full h-full object-cover" />
            ) : (
              <ShieldCheck className="w-10 h-10 text-primary-foreground" />
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Confirme seu WhatsApp</h2>
            <p className="text-sm text-muted-foreground">
              Para liberar seu portal, envie uma mensagem no WhatsApp Oficial da campanha
              {clientName ? ` ${clientName}` : ""}.
            </p>
          </div>

          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-4 text-left space-y-2">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
              Como funciona
            </p>
            <ol className="text-sm text-emerald-900 dark:text-emerald-200 space-y-1 list-decimal list-inside">
              <li>Toque no botão verde abaixo</li>
              <li>Envie a mensagem que aparecerá automaticamente</li>
              <li>{checkConfirmed ? "Volte aqui — liberamos automaticamente" : "Volte aqui e toque em \"Já enviei\""}</li>
            </ol>
          </div>

          <Button
            onClick={handleOpenWhatsApp}
            disabled={loading}
            size="lg"
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <MessageCircle className="w-5 h-5" />
            )}
            {opened ? "Reabrir WhatsApp" : "Abrir WhatsApp Oficial"}
          </Button>

          {opened && autoChecking && (
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
              <Sparkles className="w-4 h-4 animate-pulse" />
              Aguardando sua mensagem chegar...
            </div>
          )}

          <Button
            onClick={handleConfirm}
            variant="outline"
            size="lg"
            className="w-full gap-2 border-emerald-500 text-emerald-700 hover:bg-emerald-50"
          >
            <CheckCircle2 className="w-5 h-5" />
            Já enviei — liberar portal
          </Button>

          {!opened && (
            <p className="text-xs text-muted-foreground -mt-2">
              Se o WhatsApp já foi enviado em outro momento, toque acima para continuar.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            🔒 Essa etapa protege o número principal da campanha contra bloqueios e garante
            comunicação ativa com você.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MessageCircle } from "lucide-react";
import { readPortalClientId } from "@/lib/pwa-client";

/**
 * Página de entrada do PWA instalado na tela inicial.
 * Lê o clientId salvo no localStorage e redireciona para o portal correto.
 * Se não encontrar, mostra opção de escolha (apoiador ou admin).
 */
export default function PwaStart() {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const clientId = readPortalClientId();
    if (clientId) {
      navigate(`/portal/${clientId}`, { replace: true });
    } else {
      // Sem clientId salvo: o usuário instalou o PWA antes de abrir um portal.
      // NÃO mandamos para a landing page institucional — mostramos instrução
      // clara para usar o link recebido do coordenador.
      setShowHelp(true);
    }
  }, [navigate]);

  if (!showHelp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 to-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Carregando portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary/10 to-background p-6">
      <div className="w-full max-w-sm space-y-5 text-center">
        <img src="/sentinelle-logo.png" alt="" className="w-20 h-20 object-contain mx-auto drop-shadow-xl" />
        <div>
          <h1 className="text-2xl font-bold">Quase lá!</h1>
          <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
            Para acessar seu portal, abra o <strong>link específico</strong> que
            você recebeu do seu coordenador no WhatsApp.
          </p>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-left space-y-2">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <MessageCircle className="w-4 h-4" />
            Como achar seu link
          </div>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Abra a conversa com seu coordenador</li>
            <li>Toque no link do portal que ele te enviou</li>
            <li>Após abrir uma vez, este atalho passa a funcionar sozinho</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

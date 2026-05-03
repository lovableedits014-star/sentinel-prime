import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Download, Share, Plus, X, Smartphone } from "lucide-react";
import { rememberPortalClientId } from "@/lib/pwa-client";

/**
 * Floating action button that prompts the user to install the app
 * to their home screen. Works as a true PWA install on Android/Chrome
 * (via beforeinstallprompt) and shows step-by-step instructions on iOS
 * Safari (which has no programmatic install).
 *
 * Hides itself once the app is already installed (display-mode: standalone).
 */

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "install_fab_dismissed_at";
const DISMISS_DAYS = 7;

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

function isInIframe() {
  try { return window.self !== window.top; } catch { return true; }
}

function recentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!ts) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

export default function InstallAppFab() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    const match = window.location.pathname.match(/\/(?:portal|portal-apoiador|portal-funcionario|portal-contratado)\/([^/?#]+)/);
    if (match?.[1]) rememberPortalClientId(decodeURIComponent(match[1]));
  }, []);

  useEffect(() => {
    if (isInIframe()) return; // never show inside the editor preview
    if (isStandalone()) return;
    if (recentlyDismissed()) return;

    // iOS Safari has no install event — show the button anyway with help dialog
    if (ios) {
      setVisible(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installed = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", installed);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, [ios]);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  async function handleInstall() {
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === "accepted") {
          setVisible(false);
        }
      } catch (e) {
        console.warn("install prompt failed", e);
      } finally {
        setDeferred(null);
      }
      return;
    }
    if (ios) {
      setShowIosHelp(true);
    }
  }

  if (!visible) return null;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
        <button
          onClick={dismiss}
          aria-label="Fechar"
          className="w-8 h-8 rounded-full bg-background/80 border border-border text-muted-foreground shadow-md hover:bg-background flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
        <Button
          onClick={handleInstall}
          size="lg"
          className="rounded-full shadow-lg gap-2 pl-4 pr-5 h-12"
        >
          <Download className="w-5 h-5" />
          Instalar app
        </Button>
      </div>

      <Dialog open={showIosHelp} onOpenChange={setShowIosHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              Instalar no iPhone
            </DialogTitle>
            <DialogDescription>
              No iPhone, primeiro abra o link do portal no Safari. Depois instale em 3 passos rápidos.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <span>
                Toque no ícone de <span className="inline-flex items-center gap-1 font-medium"><Share className="w-4 h-4" />Compartilhar</span> na barra do Safari.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">2</span>
              <span>
                Role para baixo e toque em <span className="inline-flex items-center gap-1 font-medium"><Plus className="w-4 h-4" />Adicionar à Tela de Início</span>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">3</span>
              <span>Confirme tocando em <span className="font-medium">Adicionar</span>. Pronto, o app fica no seu celular!</span>
            </li>
          </ol>
          <Button onClick={() => setShowIosHelp(false)} className="w-full">Entendi</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
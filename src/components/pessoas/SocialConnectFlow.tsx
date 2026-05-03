import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Facebook,
  Instagram,
  ClipboardPaste,
  Loader2,
  CheckCircle2,
  RotateCw,
  X,
  HelpCircle,
  ArrowLeft,
  Share2,
  Link2,
  MoreHorizontal,
  User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { extractHandleFromUrl } from "@/lib/social-url";
import { toast } from "sonner";

type Platform = "facebook" | "instagram";

export type ConnectedSocial = {
  platform: Platform;
  handle: string;
  url: string;
  name?: string | null;
  avatarUrl?: string | null;
};

interface Props {
  platform: Platform;
  /** Nome digitado no formulário — não usado no novo fluxo, mas mantido para compatibilidade */
  searchName?: string;
  value: ConnectedSocial | null;
  onChange: (value: ConnectedSocial | null) => void;
}

type Step = "paste" | "tutorial" | "previewing" | "confirm";

const PLATFORM_META: Record<Platform, { label: string; color: string; icon: typeof Facebook; bgChip: string }> = {
  facebook: {
    label: "Facebook",
    color: "text-blue-600",
    icon: Facebook,
    bgChip: "bg-blue-50 dark:bg-blue-950/30",
  },
  instagram: {
    label: "Instagram",
    color: "text-pink-500",
    icon: Instagram,
    bgChip: "bg-pink-50 dark:bg-pink-950/30",
  },
};

export default function SocialConnectFlow({ platform, value, onChange }: Props) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.icon;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("paste");
  const [pastedLink, setPastedLink] = useState("");
  const [preview, setPreview] = useState<ConnectedSocial | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("paste");
      setPastedLink("");
      setPreview(null);
      setPreviewError(null);
    }
  }, [open]);

  async function tryAutoPaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setPastedLink(text.trim());
        await resolveLink(text.trim());
        return;
      }
      toast.info("A área de transferência está vazia. Cole manualmente no campo abaixo.");
    } catch {
      toast.info("Seu navegador não permitiu colar automaticamente. Cole manualmente no campo abaixo.");
    }
  }

  async function resolveLink(rawLink: string) {
    if (!rawLink.trim()) return;
    setPreviewError(null);
    setStep("previewing");

    let handle = extractHandleFromUrl(platform, rawLink);
    let canonicalUrl: string | null = null;

    if (!handle) {
      try {
        const { data, error } = await supabase.functions.invoke("resolve-social-link", {
          body: { url: rawLink, platform },
        });
        if (error) throw error;
        if (data?.resolved && data?.usuario) {
          handle = data.usuario as string;
          canonicalUrl = (data.url as string) || null;
        }
      } catch (e) {
        console.warn("resolve-social-link falhou:", e);
      }
    }

    if (!handle) {
      setPreviewError(
        "Não consegui identificar o perfil neste link. Confira se você copiou o link do SEU perfil (não de uma postagem ou foto).",
      );
      setStep("paste");
      return;
    }

    let name: string | null = null;
    let avatarUrl: string | null = null;
    let resolvedCanonical = canonicalUrl;
    try {
      const { data, error } = await supabase.functions.invoke("preview-social-profile", {
        body: { platform, handle },
      });
      if (!error && data) {
        name = data.name || null;
        avatarUrl = data.avatarUrl || null;
        resolvedCanonical = resolvedCanonical || data.canonicalUrl || null;
      }
    } catch (e) {
      console.warn("preview-social-profile falhou:", e);
    }

    if (!resolvedCanonical) {
      resolvedCanonical =
        platform === "instagram"
          ? `https://www.instagram.com/${handle.replace(/^@/, "")}`
          : /^\d+$/.test(handle)
            ? `https://www.facebook.com/profile.php?id=${handle}`
            : `https://www.facebook.com/${handle}`;
    }

    setPreview({ platform, handle, url: resolvedCanonical, name, avatarUrl });
    setStep("confirm");
  }

  function confirmIsMe() {
    if (!preview) return;
    onChange(preview);
    setOpen(false);
    toast.success(`${meta.label} conectado!`);
  }

  function rejectAndRetry() {
    setPreview(null);
    setPastedLink("");
    setStep("paste");
  }

  function disconnect() {
    onChange(null);
  }

  // ===== Estado conectado =====
  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border-2 border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
        <Avatar className="h-12 w-12 shrink-0">
          {value.avatarUrl ? <AvatarImage src={value.avatarUrl} alt={value.name || value.handle} /> : null}
          <AvatarFallback className={meta.color}>
            <Icon className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">{meta.label} conectado</span>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {value.name ? <strong className="text-foreground">{value.name}</strong> : null}
            {value.name ? " · " : ""}
            {platform === "instagram" ? `@${value.handle.replace(/^@/, "")}` : value.handle}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
            <RotateCw className="h-3.5 w-3.5 mr-1" />
            Trocar
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={disconnect} aria-label="Remover">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full h-14 justify-start gap-3 border-2"
        onClick={() => setOpen(true)}
      >
        <Icon className={`h-5 w-5 ${meta.color}`} />
        <span className="flex-1 text-left">
          <span className="block text-sm font-semibold">Conectar meu {meta.label}</span>
          <span className="block text-xs text-muted-foreground font-normal">Cole o link do seu perfil</span>
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {step === "tutorial" && (
                <button
                  type="button"
                  onClick={() => setStep("paste")}
                  className="p-1 -ml-1 rounded hover:bg-muted"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <Icon className={`h-5 w-5 ${meta.color}`} />
              {step === "tutorial" ? `Como pegar meu link` : `Conectar meu ${meta.label}`}
            </DialogTitle>
            <DialogDescription>
              {step === "paste" && `Cole abaixo o link do seu perfil do ${meta.label}.`}
              {step === "tutorial" && `Siga os passos no app do ${meta.label}:`}
              {step === "previewing" && "Buscando seu perfil..."}
              {step === "confirm" && "Confirme se este é o seu perfil:"}
            </DialogDescription>
          </DialogHeader>

          {/* ============ PASTE ============ */}
          {step === "paste" && (
            <div className="space-y-4">
              <Button
                type="button"
                variant="default"
                size="lg"
                className="w-full h-14"
                onClick={tryAutoPaste}
              >
                <ClipboardPaste className="h-5 w-5 mr-2" />
                Já copiei — colar agora
              </Button>

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground text-center">ou cole manualmente:</p>
                <Input
                  value={pastedLink}
                  onChange={(e) => setPastedLink(e.target.value)}
                  placeholder={
                    platform === "facebook"
                      ? "https://facebook.com/seu.perfil"
                      : "https://instagram.com/seu_usuario"
                  }
                  className="h-12 text-sm"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  disabled={!pastedLink.trim()}
                  onClick={() => resolveLink(pastedLink)}
                >
                  Continuar
                </Button>
              </div>

              {previewError && (
                <div className="text-xs text-destructive bg-destructive/10 rounded-md p-2.5">
                  {previewError}
                </div>
              )}

              <button
                type="button"
                className="flex items-center justify-center gap-1.5 text-sm text-primary hover:underline w-full pt-2 border-t"
                onClick={() => setStep("tutorial")}
              >
                <HelpCircle className="h-4 w-4" />
                Não sei como pegar meu link
              </button>
            </div>
          )}

          {/* ============ TUTORIAL ============ */}
          {step === "tutorial" && (
            <div className="space-y-3">
              <TutorialStep
                number={1}
                icon={<Icon className={`h-5 w-5 ${meta.color}`} />}
                title={`Abra o app do ${meta.label}`}
                description={`No seu celular, abra o aplicativo oficial do ${meta.label}.`}
              />
              <TutorialStep
                number={2}
                icon={<User className="h-5 w-5 text-muted-foreground" />}
                title="Vá no SEU perfil"
                description={
                  platform === "facebook"
                    ? "Toque na sua foto no canto da tela ou no menu (☰) → seu nome."
                    : "Toque na sua foto no canto inferior direito da tela."
                }
              />
              <TutorialStep
                number={3}
                icon={<MoreHorizontal className="h-5 w-5 text-muted-foreground" />}
                title={
                  platform === "facebook"
                    ? 'Toque nos três pontinhos "⋯" no seu perfil'
                    : 'Toque no botão "Compartilhar perfil"'
                }
                description={
                  platform === "facebook"
                    ? 'Geralmente fica perto do botão "Editar perfil".'
                    : 'Fica logo abaixo da sua bio, ao lado de "Editar perfil".'
                }
              />
              <TutorialStep
                number={4}
                icon={<Share2 className="h-5 w-5 text-muted-foreground" />}
                title={
                  platform === "facebook"
                    ? 'Toque em "Copiar link do perfil"'
                    : 'Toque em "Copiar link" (abaixo do QR code)'
                }
                description={
                  platform === "facebook"
                    ? "Pronto, o link foi copiado para a área de transferência."
                    : "Vai aparecer um QR code grande — a opção 'Copiar link' fica logo abaixo dele."
                }
              />
              <TutorialStep
                number={5}
                icon={<Link2 className="h-5 w-5 text-primary" />}
                title="Volte aqui e cole"
                description='Toque no botão verde "Já copiei — colar agora" e a gente confirma com sua foto.'
                highlight
              />

              <Button
                type="button"
                variant="default"
                size="lg"
                className="w-full mt-4"
                onClick={() => setStep("paste")}
              >
                Entendi, vou copiar agora
              </Button>
            </div>
          )}

          {/* ============ PREVIEWING ============ */}
          {step === "previewing" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Buscando seu perfil no {meta.label}...</p>
            </div>
          )}

          {/* ============ CONFIRM ============ */}
          {step === "confirm" && preview && (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 flex items-center gap-3">
                <Avatar className="h-16 w-16 shrink-0">
                  {preview.avatarUrl ? (
                    <AvatarImage src={preview.avatarUrl} alt={preview.name || preview.handle} />
                  ) : null}
                  <AvatarFallback className={meta.color}>
                    <Icon className="h-7 w-7" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-foreground truncate">
                    {preview.name ||
                      (platform === "instagram"
                        ? `@${preview.handle.replace(/^@/, "")}`
                        : preview.handle)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {preview.url.replace(/^https?:\/\//, "")}
                  </div>
                </div>
              </div>

              {!preview.avatarUrl && !preview.name && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                  Não consegui carregar a foto, mas o link foi reconhecido. Confirme se este é o seu perfil.
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Button type="button" size="lg" className="w-full" onClick={confirmIsMe}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Sim, sou eu
                </Button>
                <Button type="button" variant="outline" size="lg" className="w-full" onClick={rejectAndRetry}>
                  Não — tentar outro link
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TutorialStep({
  number,
  icon,
  title,
  description,
  highlight,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex gap-3 rounded-lg border p-3 ${
        highlight
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-muted/30"
      }`}
    >
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div
          className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
            highlight ? "bg-primary text-primary-foreground" : "bg-foreground/10 text-foreground"
          }`}
        >
          {number}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {icon}
          <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
        </div>
        <p className="text-xs text-muted-foreground leading-snug">{description}</p>
      </div>
    </div>
  );
}
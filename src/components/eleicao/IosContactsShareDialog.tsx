import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Share2, Link as LinkIcon, FileText, Download, Copy, MessageCircle, Apple, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { isIOS, isInAppBrowser } from "@/lib/mobile-download";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vcfBlob: Blob;
  vcfFilename: string;
  totalContatos: number;
  /** URL pública opcional (caso já tenha subido o arquivo). */
  publicUrl?: string | null;
  /** Plano B — CSV pronto pra Google/iCloud. */
  csvBlob?: Blob | null;
  csvFilename?: string;
  /** Telefone do destinatário (opcional) pra abrir WhatsApp com link. */
  whatsappTel?: string | null;
  whatsappTexto?: string;
}

export default function IosContactsShareDialog({
  open,
  onOpenChange,
  vcfBlob,
  vcfFilename,
  totalContatos,
  publicUrl,
  csvBlob,
  csvFilename,
  whatsappTel,
  whatsappTexto,
}: Props) {
  const [shareSupported, setShareSupported] = useState(false);
  const ios = isIOS();
  const inApp = isInAppBrowser();

  useEffect(() => {
    try {
      const file = new File([vcfBlob], vcfFilename, { type: "text/vcard" });
      setShareSupported(
        typeof (navigator as any).canShare === "function" &&
        (navigator as any).canShare({ files: [file] })
      );
    } catch {
      setShareSupported(false);
    }
  }, [vcfBlob, vcfFilename]);

  const handleShareNative = async () => {
    try {
      const file = new File([vcfBlob], vcfFilename, { type: "text/vcard" });
      await (navigator as any).share({
        files: [file],
        title: "Lista de contatos",
        text: `${totalContatos} contatos`,
      });
      toast.success("Compartilhamento aberto");
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast.error("Falha ao compartilhar", { description: err?.message });
      }
    }
  };

  const handleDownloadVcf = () => {
    const url = URL.createObjectURL(vcfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = vcfFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleDownloadCsv = () => {
    if (!csvBlob) return;
    const url = URL.createObjectURL(csvBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename || "contatos.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleCopyUrl = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copiado", { description: "Cole no Safari (fora do WhatsApp) e o iPhone vai oferecer 'Adicionar contatos'." });
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleOpenInSafari = () => {
    if (!publicUrl) return;
    window.open(publicUrl, "_blank");
  };

  const handleWhatsApp = () => {
    if (!whatsappTel || !publicUrl) return;
    const tel = whatsappTel.replace(/\D/g, "");
    const text = encodeURIComponent(`${whatsappTexto || "Segue a lista de contatos"}\n\n${publicUrl}`);
    window.open(`https://wa.me/${tel}?text=${text}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Apple className="w-5 h-5" />
            Importar no iPhone — {totalContatos} contatos
          </DialogTitle>
          <DialogDescription>
            O Safari/iOS limita a abertura direta de listas grandes. Escolha o caminho que funciona melhor para você:
          </DialogDescription>
        </DialogHeader>

        {inApp && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              Você está no navegador interno do WhatsApp/Instagram/Facebook. Toque em <strong>"Abrir no Safari"</strong> (menu ⋯) antes de continuar — o WebView interno bloqueia salvar arquivos.
            </div>
          </div>
        )}

        <div className="space-y-2">
          {shareSupported && (
            <Button onClick={handleShareNative} className="w-full justify-start h-auto py-3" size="lg">
              <Share2 className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">Compartilhar arquivo (recomendado)</div>
                <div className="text-xs opacity-80">Abre a folha do iOS: Salvar em Arquivos / Contatos / WhatsApp</div>
              </div>
            </Button>
          )}

          {publicUrl && (
            <>
              <Button onClick={handleOpenInSafari} variant="outline" className="w-full justify-start h-auto py-3">
                <LinkIcon className="w-5 h-5 mr-3" />
                <div className="text-left">
                  <div className="font-semibold">Abrir o .vcf no Safari</div>
                  <div className="text-xs opacity-70">O Safari oferece "Adicionar todos os {totalContatos} contatos"</div>
                </div>
              </Button>
              <Button onClick={handleCopyUrl} variant="outline" className="w-full justify-start h-auto py-3">
                <Copy className="w-5 h-5 mr-3" />
                <div className="text-left">
                  <div className="font-semibold">Copiar link do arquivo</div>
                  <div className="text-xs opacity-70">Cole no Safari pra abrir fora do WebView</div>
                </div>
              </Button>
              {whatsappTel && (
                <Button onClick={handleWhatsApp} variant="outline" className="w-full justify-start h-auto py-3">
                  <MessageCircle className="w-5 h-5 mr-3" />
                  <div className="text-left">
                    <div className="font-semibold">Enviar link pelo WhatsApp</div>
                    <div className="text-xs opacity-70">O destinatário abre no Safari pra importar</div>
                  </div>
                </Button>
              )}
            </>
          )}

          {csvBlob && (
            <div className="border-t pt-2 mt-2">
              <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Plano B (100% confiável no iPhone)
              </div>
              <Button onClick={handleDownloadCsv} variant="secondary" className="w-full justify-start h-auto py-3">
                <FileText className="w-5 h-5 mr-3" />
                <div className="text-left">
                  <div className="font-semibold">Baixar CSV pra iCloud / Google</div>
                  <div className="text-xs opacity-70">Importa em contacts.google.com ou icloud.com → sincroniza no iPhone</div>
                </div>
              </Button>
            </div>
          )}

          {!ios && (
            <Button onClick={handleDownloadVcf} variant="ghost" className="w-full justify-start">
              <Download className="w-4 h-4 mr-2" />
              Baixar .vcf direto (Android/PC)
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

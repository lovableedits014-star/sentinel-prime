import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Link2, UserPlus, LogIn, Phone, QrCode, Printer, Download, Star, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PublicLinksCardProps {
  clientId: string;
}

interface LinkEntry {
  label: string;
  description: string;
  detail: string;
  path: string;
  icon: React.ReactNode;
  color: string;
}

interface InviteToken {
  id: string;
  token: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  note: string | null;
}

export default function PublicLinksCard({ clientId }: PublicLinksCardProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [qrLink, setQrLink] = useState<LinkEntry | null>(null);
  const [invites, setInvites] = useState<InviteToken[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteNote, setInviteNote] = useState("");
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  const baseUrl = window.location.origin;

  const links: LinkEntry[] = [
    {
      label: "Cadastro Geral",
      description: "Link único para Apoiadores e Funcionários se cadastrarem",
      detail: "Link unificado de entrada na campanha. Ao acessar, o visitante escolhe se quer participar como Apoiador (engajamento + indicações) ou Funcionário (equipe oficial com check-in). Há ainda um modo opcional de Cadastro de Campo (cabos eleitorais — coleta endereço, zona/seção e intenção de voto). Este é o ÚNICO link de cadastro público que você precisa compartilhar — ele substitui os antigos links separados de Apoiador, Funcionário e Registro de Pessoa.",
      path: `/cadastro/${clientId}`,
      icon: <UserPlus className="w-4 h-4" />,
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      label: "Portal de Acesso",
      description: "Login único — funciona para apoiadores, funcionários e líderes",
      detail: "Painel de acesso onde pessoas já cadastradas fazem login para realizar missões de engajamento, check-in e gerenciar suas indicações. O sistema detecta automaticamente o papel da pessoa (apoiador, funcionário ou líder) e mostra as funcionalidades correspondentes. Funciona como PWA — pode ser instalado no celular como um app.",
      path: `/portal/${clientId}`,
      icon: <LogIn className="w-4 h-4" />,
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      label: "Central de Telemarketing",
      description: "Acesso dos operadores à fila unificada de ligações",
      detail: "Link interno para os operadores de telemarketing acessarem a central de ligações. A fila exibe todos os contatos pendentes: líderes, liderados e indicados que ainda não receberam ligação. O operador registra o resultado de cada chamada, a intenção de voto e observações. O acesso é controlado pelos operadores cadastrados em Configurações > Central de Telemarketing.",
      path: `/telemarketing/${clientId}`,
      icon: <Phone className="w-4 h-4" />,
      color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    },
  ];

  // ─── Convites de Líder ──────────────────────────────────────────────────
  const loadInvites = async () => {
    setLoadingInvites(true);
    const { data, error } = await supabase
      .from("lider_invite_tokens" as any)
      .select("id, token, created_at, expires_at, used_at, note")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (!error && data) setInvites(data as any);
    setLoadingInvites(false);
  };

  useEffect(() => {
    loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleCreateInvite = async () => {
    setCreatingInvite(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      toast.error("Faça login para gerar convites");
      setCreatingInvite(false);
      return;
    }
    const { error } = await supabase.from("lider_invite_tokens" as any).insert({
      client_id: clientId,
      created_by: userData.user.id,
      note: inviteNote.trim() || null,
    });
    if (error) {
      toast.error("Erro ao gerar convite");
      console.error(error);
    } else {
      toast.success("Convite criado!");
      setInviteNote("");
      await loadInvites();
    }
    setCreatingInvite(false);
  };

  const handleDeleteInvite = async (id: string) => {
    const { error } = await supabase.from("lider_invite_tokens" as any).delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover convite");
      return;
    }
    toast.success("Convite removido");
    setInvites((prev) => prev.filter((i) => i.id !== id));
  };

  const handleCopyInvite = (token: string, id: string) => {
    const url = `${baseUrl}/cadastro-lider/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedInviteId(id);
    toast.success("Link de convite copiado!");
    setTimeout(() => setCopiedInviteId(null), 2000);
  };

  const handleCopy = (url: string, index: number) => {
    navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    toast.success("Link copiado!");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const qrUrl = qrLink ? `${baseUrl}${qrLink.path}` : "";

  const handleDownloadQr = () => {
    const canvas = document.getElementById("qr-print-canvas") as HTMLCanvasElement | null;
    if (!canvas || !qrLink) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qrcode-${qrLink.label.toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  };

  const handlePrintQr = () => {
    const canvas = document.getElementById("qr-print-canvas") as HTMLCanvasElement | null;
    if (!canvas || !qrLink) return;
    const dataUrl = canvas.toDataURL("image/png");
    const w = window.open("", "_blank", "width=600,height=700");
    if (!w) {
      toast.error("Permita pop-ups para imprimir");
      return;
    }
    w.document.write(`
      <html><head><title>QR Code - ${qrLink.label}</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        p { color: #555; font-size: 13px; margin: 4px 0 24px; }
        img { width: 320px; height: 320px; }
        .url { margin-top: 20px; font-family: monospace; font-size: 12px; word-break: break-all; color: #333; }
        @media print { body { padding: 0; } }
      </style></head><body>
        <h1>${qrLink.label}</h1>
        <p>${qrLink.description}</p>
        <img src="${dataUrl}" alt="QR Code" />
        <div class="url">${qrUrl}</div>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
      </body></html>
    `);
    w.document.close();
  };

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Links de Acesso Público</CardTitle>
            <CardDescription>
              Compartilhe esses 3 links com sua equipe e apoiadores. Líderes contratados são cadastrados apenas por convite (seção abaixo).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {links.map((link, i) => {
            const fullUrl = `${baseUrl}${link.path}`;
            const isCopied = copiedIndex === i;
            return (
              <div
                key={i}
                className="rounded-lg border bg-muted/30 overflow-hidden"
              >
                <div className="flex items-center gap-3 p-3">
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${link.color}`}>
                    {link.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{link.label}</p>
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  </div>
                  <Input
                    readOnly
                    value={fullUrl}
                    className="max-w-[320px] text-xs font-mono bg-background h-8 hidden sm:block"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-8 w-8 p-0"
                    onClick={() => handleCopy(fullUrl, i)}
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-8 w-8 p-0"
                    onClick={() => setQrLink(link)}
                    title="Gerar QR Code"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="px-3 pb-3 pt-0">
                  <p className="text-xs text-muted-foreground/80 leading-relaxed bg-background/50 rounded-md p-2 border border-border/50">
                    {link.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
      <Dialog open={!!qrLink} onOpenChange={(open) => !open && setQrLink(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code — {qrLink?.label}</DialogTitle>
            <DialogDescription>
              Escaneie com a câmera do celular ou imprima para distribuir.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="bg-white p-4 rounded-lg border">
              {qrLink && (
                <QRCodeCanvas
                  id="qr-print-canvas"
                  value={qrUrl}
                  size={256}
                  level="H"
                  includeMargin={false}
                />
              )}
            </div>
            <p className="text-xs font-mono text-muted-foreground text-center break-all px-2">
              {qrUrl}
            </p>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={handleDownloadQr}>
                <Download className="w-4 h-4 mr-2" /> Baixar PNG
              </Button>
              <Button className="flex-1" onClick={handlePrintQr}>
                <Printer className="w-4 h-4 mr-2" /> Imprimir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>

    </div>
  );
}

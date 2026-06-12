import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Crown, User, Building2, MessageCircle, Copy, Send, Loader2, AlertCircle, CheckCircle2, KeyRound, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import {
  resolverFluxoCadastro,
  type FluxoPessoa,
  type FluxoResolvido,
  type FluxoDestino,
} from "@/lib/eleicao-fluxo-cadastro";
import { cn } from "@/lib/utils";

const DEFAULT_PASSWORD = "coringa15111";

export interface PosCadastroEnvioPessoa extends FluxoPessoa {
  email?: string | null;
  user_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pessoa: PosCadastroEnvioPessoa | null;
  /** Quando true, mostra a opção "também disparar pela instância" (apenas para líder). */
  showInstanceOption?: boolean;
  /** Callback opcional para disparar o fluxo automático pela instância (Coord→Sec→Líder). */
  onTriggerInstanceFlow?: (pessoa: PosCadastroEnvioPessoa) => void;
}

type DestKey = "cadastrado" | "coordenador" | "secretaria" | "portal";

function fmtPhoneBr(s: string | null | undefined) {
  const d = (s ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 13 && d.startsWith("55")) return fmtPhoneBr(d.slice(2));
  if (d.length === 12 && d.startsWith("55")) return fmtPhoneBr(d.slice(2));
  return s ?? "";
}

function waLink(phone: string | null | undefined, message: string): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return null;
  const full = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

const TIPO_LABEL: Record<string, string> = {
  coordenador: "Coordenador",
  lider: "Líder",
  cabo: "Cabo Eleitoral",
};

export default function PosCadastroEnvioDialog({
  open,
  onOpenChange,
  pessoa,
  showInstanceOption,
  onTriggerInstanceFlow,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<FluxoResolvido | null>(null);
  const [sent, setSent] = useState<Set<DestKey>>(new Set());

  // Portal (apenas coordenador)
  const [portalEmail, setPortalEmail] = useState("");
  const [portalPassword, setPortalPassword] = useState(DEFAULT_PASSWORD);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalData, setPortalData] = useState<{ portal_url: string; message: string; password: string | null } | null>(null);

  // Instância automática
  const [alsoInstance, setAlsoInstance] = useState(false);

  useEffect(() => {
    if (!open || !pessoa) return;
    setResolved(null);
    setSent(new Set());
    setPortalData(null);
    setPortalEmail(pessoa.email || "");
    setPortalPassword(DEFAULT_PASSWORD);
    setAlsoInstance(false);
    setLoading(true);
    resolverFluxoCadastro(pessoa)
      .then((r) => setResolved(r))
      .catch((e) => toast.error("Falha ao montar mensagens: " + (e?.message || "erro")))
      .finally(() => setLoading(false));
  }, [open, pessoa]);

  const isCoord = pessoa?.tipo === "coordenador";

  function markSent(key: DestKey) {
    setSent((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  function openWa(key: DestKey, dest: FluxoDestino) {
    if (!dest.waUrl) {
      toast.info(dest.motivo || "Não foi possível abrir.");
      return;
    }
    window.open(dest.waUrl, "_blank", "noopener,noreferrer");
    markSent(key);
  }

  async function copyMessage(message: string) {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function gerarLinkPortal() {
    if (!pessoa) return;
    if (!portalEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(portalEmail.trim())) {
      toast.error("Informe um e-mail válido para o coordenador.");
      return;
    }
    if (portalPassword.length < 6) {
      toast.error("Senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("eleicao-send-credentials", {
        body: {
          pessoa_id: pessoa.id,
          channel: "link_only",
          app_url: window.location.origin,
          email: portalEmail.trim(),
          password: portalPassword,
          // Só reseta a senha se o usuário trocou o valor padrão.
          reset_password: portalPassword !== DEFAULT_PASSWORD ? true : !pessoa.user_id,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao gerar acesso");
      setPortalData({ portal_url: data.portal_url, message: data.message, password: data.password ?? null });
      toast.success("Link de acesso pronto — clique em abrir no WhatsApp.");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar acesso");
    } finally {
      setPortalLoading(false);
    }
  }

  function openPortalWa() {
    if (!portalData || !pessoa?.telefone) {
      toast.info("Gere o link primeiro.");
      return;
    }
    const url = waLink(pessoa.telefone, portalData.message);
    if (!url) {
      toast.info("Coordenador sem telefone válido.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    markSent("portal");
  }

  function skipSession() {
    try { sessionStorage.setItem("eleicao:skip-pos-cadastro", "1"); } catch {}
    onOpenChange(false);
    toast.info("Popup desativado nesta sessão. Você pode reenviar pelo menu da linha.");
  }

  function concluir() {
    if (alsoInstance && pessoa && onTriggerInstanceFlow) {
      onTriggerInstanceFlow(pessoa);
    }
    onOpenChange(false);
  }

  const tipoLabel = pessoa ? (TIPO_LABEL[pessoa.tipo] || pessoa.tipo) : "";
  const regiaoLabel = pessoa?.regiao || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Cadastro concluído — enviar mensagens
          </DialogTitle>
          <DialogDescription>
            Envie pelo <strong>seu próprio WhatsApp</strong> (sem usar a instância). Clique em cada
            botão para abrir a conversa com a mensagem pronta.
          </DialogDescription>
        </DialogHeader>

        {pessoa && (
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <Badge variant="outline">{tipoLabel}</Badge>
            <span className="font-medium">{pessoa.nome}</span>
            {pessoa.regiao && (
              <span className="text-muted-foreground">· região <strong>{regiaoLabel}</strong></span>
            )}
            {pessoa.telefone && (
              <span className="text-muted-foreground">· {fmtPhoneBr(pessoa.telefone)}</span>
            )}
          </div>
        )}

        {loading && (
          <div className="py-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando mensagens…
          </div>
        )}

        {!loading && resolved && (
          <div className="space-y-3">
            <DestinoCard
              icon={User}
              titulo="Para o Cadastrado"
              destino={resolved.cadastrado}
              done={sent.has("cadastrado")}
              onSend={(d) => openWa("cadastrado", d)}
              onCopy={(d) => copyMessage(d.mensagem)}
            />
            <DestinoCard
              icon={Crown}
              titulo="Para o Coordenador"
              destino={resolved.coordenador}
              done={sent.has("coordenador")}
              onSend={(d) => openWa("coordenador", d)}
              onCopy={(d) => copyMessage(d.mensagem)}
            />
            <DestinoCard
              icon={Building2}
              titulo="Para a Secretaria"
              destino={resolved.secretaria}
              done={sent.has("secretaria")}
              onSend={(d) => openWa("secretaria", d)}
              onCopy={(d) => copyMessage(d.mensagem)}
            />

            {isCoord && (
              <div className={cn(
                "rounded-lg border p-3 space-y-3",
                sent.has("portal") ? "border-emerald-500/40 bg-emerald-500/5" : "border-border"
              )}>
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Acesso ao portal (coordenador)</span>
                  {sent.has("portal") && (
                    <Badge variant="outline" className="ml-auto border-emerald-500/40 text-emerald-700 bg-emerald-500/10 text-[10px]">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> enviado
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">E-mail</Label>
                    <Input
                      value={portalEmail}
                      onChange={(e) => setPortalEmail(e.target.value)}
                      placeholder="coordenador@exemplo.com"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Senha</Label>
                    <Input
                      value={portalPassword}
                      onChange={(e) => setPortalPassword(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Padrão <code className="font-mono">{DEFAULT_PASSWORD}</code>. Só altera a senha se você mudar este valor (ou se for a primeira vez).
                </p>

                {!portalData ? (
                  <Button size="sm" disabled={portalLoading} onClick={gerarLinkPortal} className="w-full">
                    {portalLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                    Gerar link de acesso
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1.5">
                      <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] break-all flex-1">{portalData.portal_url}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(portalData.portal_url); toast.success("Link copiado"); }}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    {portalData.password && (
                      <div className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1.5">
                        <KeyRound className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-[11px] font-mono flex-1">{portalData.password}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(portalData.password!); toast.success("Senha copiada"); }}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                    {!portalData.password && (
                      <p className="text-[10px] text-muted-foreground">Senha atual mantida (não foi alterada).</p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => copyMessage(portalData.message)}>
                        <Copy className="w-3.5 h-3.5 mr-1" /> Copiar mensagem
                      </Button>
                      <Button size="sm" className="flex-1" onClick={openPortalWa}>
                        <Send className="w-3.5 h-3.5 mr-1" /> Abrir no WhatsApp
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showInstanceOption && onTriggerInstanceFlow && (
          <div className="flex items-start gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-2.5">
            <Checkbox
              id="also-instance"
              checked={alsoInstance}
              onCheckedChange={(c) => setAlsoInstance(c === true)}
              className="mt-0.5"
            />
            <Label htmlFor="also-instance" className="text-xs leading-snug cursor-pointer">
              Também disparar pela <strong>instância automática</strong> ao concluir (Coordenador → Secretaria → Líder).
              <span className="block text-[10px] text-muted-foreground mt-0.5">
                Use se você não vai mandar manualmente. Caso contrário, desligue para evitar mensagens duplicadas.
              </span>
            </Label>
          </div>
        )}

        <DialogFooter className="flex sm:justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={skipSession} className="text-xs text-muted-foreground">
            Não mostrar nesta sessão
          </Button>
          <Button onClick={concluir}>
            <CheckCircle2 className="w-4 h-4 mr-2" /> Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DestinoCard({
  icon: Icon,
  titulo,
  destino,
  done,
  onSend,
  onCopy,
}: {
  icon: any;
  titulo: string;
  destino: FluxoDestino;
  done: boolean;
  onSend: (d: FluxoDestino) => void;
  onCopy: (d: FluxoDestino) => void;
}) {
  if (destino.disabled) {
    return (
      <div className="rounded-lg border border-dashed p-3 flex items-start gap-2 opacity-70">
        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{titulo}</p>
          <p className="text-[11px] text-muted-foreground">{destino.motivo || "Indisponível"}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-2",
      done ? "border-emerald-500/40 bg-emerald-500/5" : "border-border"
    )}>
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{titulo}</p>
            {done && (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 bg-emerald-500/10 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> enviado
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
            <MessageCircle className="w-3 h-3 shrink-0" />
            <span className="truncate">{destino.nome}</span>
            {destino.telefoneFmt && <span className="tabular-nums shrink-0">· {destino.telefoneFmt}</span>}
          </p>
        </div>
      </div>
      <details className="text-[11px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
        <summary className="cursor-pointer select-none">Pré-visualizar mensagem</summary>
        <pre className="whitespace-pre-wrap font-sans mt-1.5 text-foreground/80">{destino.mensagem}</pre>
      </details>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => onCopy(destino)}>
          <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
        </Button>
        <Button size="sm" className="flex-1" onClick={() => onSend(destino)}>
          <Send className="w-3.5 h-3.5 mr-1" /> Abrir no WhatsApp
        </Button>
      </div>
    </div>
  );
}

import { useState } from "react";
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Send, MessageCircle, Crown, User, Building2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  resolverFluxoCadastro,
  type FluxoPessoa,
  type FluxoResolvido,
  type FluxoDestino,
} from "@/lib/eleicao-fluxo-cadastro";

interface Props {
  pessoa: FluxoPessoa;
}

/**
 * Sub-menu para reenviar manualmente o fluxo de cadastro pelo WhatsApp Web
 * do usuário (sem depender da instância da campanha). Usa as MESMAS mensagens
 * que o envio automático.
 */
export default function EnviarFluxoMenu({ pessoa }: Props) {
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<FluxoResolvido | null>(null);

  async function ensureResolved(): Promise<FluxoResolvido | null> {
    if (resolved) return resolved;
    setLoading(true);
    try {
      const r = await resolverFluxoCadastro(pessoa);
      setResolved(r);
      return r;
    } catch (e: any) {
      toast.error("Não consegui montar o fluxo: " + (e?.message || "erro desconhecido"));
      return null;
    } finally {
      setLoading(false);
    }
  }

  function openDestino(d: FluxoDestino, labelDestinatario: string) {
    if (d.disabled || !d.waUrl) {
      toast.info(d.motivo || `Não foi possível abrir o envio para ${labelDestinatario}.`);
      return;
    }
    window.open(d.waUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        onClick={(e) => {
          e.stopPropagation();
          void ensureResolved();
        }}
        onPointerEnter={() => { void ensureResolved(); }}
      >
        <Send className="w-3.5 h-3.5 mr-2" />
        Enviar fluxo pelo MEU WhatsApp
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Manda do seu próprio WhatsApp
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {loading && !resolved ? (
          <DropdownMenuItem disabled>
            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            Carregando mensagens…
          </DropdownMenuItem>
        ) : (
          <>
            <DestinoItem
              icon={Crown}
              titulo="Para o Coordenador"
              destino={resolved?.coordenador}
              onClick={(d) => openDestino(d, "o coordenador")}
            />
            <DestinoItem
              icon={User}
              titulo="Para o Cadastrado"
              destino={resolved?.cadastrado}
              onClick={(d) => openDestino(d, "o cadastrado")}
            />
            <DestinoItem
              icon={Building2}
              titulo="Para a Secretaria"
              destino={resolved?.secretaria}
              onClick={(d) => openDestino(d, "a secretaria")}
            />
          </>
        )}

        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[10px] text-muted-foreground leading-snug">
          Abre o WhatsApp Web/celular numa nova aba com a mensagem já pronta.
          Não depende da instância da campanha.
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function DestinoItem({
  icon: Icon,
  titulo,
  destino,
  onClick,
}: {
  icon: any;
  titulo: string;
  destino: FluxoDestino | undefined;
  onClick: (d: FluxoDestino) => void;
}) {
  // Sem dado resolvido ainda — mostra placeholder neutro
  if (!destino) {
    return (
      <DropdownMenuItem disabled>
        <Icon className="w-3.5 h-3.5 mr-2 opacity-60" />
        <div className="flex flex-col items-start min-w-0">
          <span className="text-xs">{titulo}</span>
          <span className="text-[10px] text-muted-foreground">aguardando…</span>
        </div>
      </DropdownMenuItem>
    );
  }

  if (destino.disabled) {
    return (
      <DropdownMenuItem disabled title={destino.motivo}>
        <AlertCircle className="w-3.5 h-3.5 mr-2 text-amber-500" />
        <div className="flex flex-col items-start min-w-0">
          <span className="text-xs">{titulo}</span>
          <span className="text-[10px] text-muted-foreground truncate max-w-[14rem]">
            {destino.motivo}
          </span>
        </div>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem onClick={() => onClick(destino)}>
      <Icon className="w-3.5 h-3.5 mr-2" />
      <div className="flex flex-col items-start min-w-0">
        <span className="text-xs">{titulo}</span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 truncate max-w-[14rem]">
          <MessageCircle className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{destino.nome}</span>
          {destino.telefoneFmt && (
            <span className="tabular-nums shrink-0">· {destino.telefoneFmt}</span>
          )}
        </span>
      </div>
    </DropdownMenuItem>
  );
}

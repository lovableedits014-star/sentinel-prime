import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import {
  buildPromptArteFeriado,
  buildPromptArteTemaMes,
  type ContextoArte,
} from "@/lib/prompt-arte-feriado";
import { useContextoArte } from "@/hooks/useContextoArte";

type CandidateContext = {
  name: string | null;
  cargo: string | null;
};

type Props =
  | {
      tipo: "feriado";
      feriado: { localName: string; name?: string; date?: string };
      size?: "sm" | "default";
      variant?: "outline" | "ghost" | "default" | "secondary";
      label?: string;
      compact?: boolean;
    }
  | {
      tipo: "tema-mes";
      tema: { titulo: string; descricao: string; emoji?: string };
      size?: "sm" | "default";
      variant?: "outline" | "ghost" | "default" | "secondary";
      label?: string;
      compact?: boolean;
    };

function buildPrompt(props: Props, ctx: ContextoArte) {
  if (props.tipo === "feriado") return buildPromptArteFeriado(props.feriado, ctx);
  return buildPromptArteTemaMes(props.tema, ctx);
}

function getTitulo(props: Props) {
  return props.tipo === "feriado" ? props.feriado.localName : props.tema.titulo;
}

export function PromptArteButton(props: Props) {
  const { ctx, update } = useContextoArte();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState<ContextoArte>(ctx);
  const [clientId, setClientId] = useState<string | null>(null);

  // Descobre clientId do usuário logado (1x)
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!cancel && data?.id) setClientId(data.id);
    })();
    return () => { cancel = true; };
  }, []);

  const identityQuery = useQuery({
    queryKey: ["arte-candidate-context", clientId],
    queryFn: async (): Promise<CandidateContext> => {
      const { data: client } = await supabase
        .from("clients")
        .select("name, cargo")
        .eq("id", clientId!)
        .maybeSingle();
      return {
        name: client?.name ?? null,
        cargo: client?.cargo ?? null,
      };
    },
    enabled: !!clientId && open,
  });

  const candidateCtx = identityQuery.data;

  // Quando a Identidade da Campanha carrega, hidrata o draft com nome+cargo automaticamente
  useEffect(() => {
    if (!open || !candidateCtx) return;
    setDraft((d) => ({
      ...d,
      nomeCandidato: candidateCtx.name ?? d.nomeCandidato,
      cargo: candidateCtx.cargo ?? d.cargo,
    }));
  }, [open, candidateCtx]);

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) setDraft(ctx);
    if (!v) setCopied(false);
  };

  const prompt = buildPrompt(props, draft);

  const copy = async () => {
    try {
      update(draft);
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success("Prompt copiado! Cole no ChatGPT, Midjourney, Ideogram ou Canva Magic Media.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };

  const size = props.size ?? "sm";
  const variant = props.variant ?? "outline";

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant} className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {props.compact ? null : <span>{props.label ?? "Prompt de arte"}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Prompt de arte — {getTitulo(props)}
          </DialogTitle>
          <DialogDescription>
            Copie o prompt abaixo e cole em uma ferramenta especializada de geração de imagem
            (ChatGPT/DALL·E, Midjourney, Ideogram) ou entregue ao seu designer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            ✨ Nome e cargo são puxados automaticamente de{" "}
            <strong>Configurações → Identidade da Campanha</strong>.
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="prompt-out" className="text-xs">Prompt gerado</Label>
              <Badge variant="secondary" className="text-[10px]">Estilo: institucional / candidato</Badge>
            </div>
            <Textarea
              id="prompt-out"
              value={prompt}
              readOnly
              className="min-h-[300px] font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="text-[11px] text-muted-foreground">
              Recomendado: <strong>Ideogram</strong> (acerta texto em português),{" "}
              <strong>Midjourney v6</strong> (qualidade artística) ou <strong>Canva Magic Media</strong>{" "}
              (mais simples). Para Story Instagram, peça formato 1080×1920 (9:16) na ferramenta.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" asChild>
            <a href="https://ideogram.ai/" target="_blank" rel="noopener noreferrer" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir Ideogram
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir ChatGPT
            </a>
          </Button>
          <Button onClick={copy} className="gap-1.5">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado!" : "Copiar prompt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

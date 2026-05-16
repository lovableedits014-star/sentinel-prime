import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, BookOpen } from "lucide-react";
import { toast } from "sonner";

interface Props {
  clientId: string;
  trigger?: React.ReactNode;
}

type WindowOpt = "30" | "90" | "365" | "all";

export function ImportPostsDialog({ clientId, trigger }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [windowOpt, setWindowOpt] = useState<WindowOpt>("90");
  const [limit, setLimit] = useState<number>(25);

  const sinceDateFor = (w: WindowOpt) => {
    if (w === "all") return undefined;
    const days = Number(w);
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  };

  const mut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ic-import-posts", {
        body: {
          clientId,
          sinceDate: sinceDateFor(windowOpt),
          limit,
        },
      });
      if (error) throw error;
      return data as {
        eligible: number;
        processed: number;
        skipped_existing: number;
        skipped_empty: number;
        failed: number;
        remaining: number;
      };
    },
    onSuccess: (r) => {
      toast.success(
        `${r.processed} post(s) importado(s) à memória. ${r.skipped_existing} já existiam, ${r.skipped_empty} sem legenda, ${r.failed} falharam.${
          r.remaining > 0 ? ` Restam ${r.remaining} — rode novamente para processar mais.` : ""
        }`,
      );
      qc.invalidateQueries({ queryKey: ["ic-knowledge-documents-timeline", clientId] });
      qc.invalidateQueries({ queryKey: ["ic-knowledge-documents", clientId] });
      qc.invalidateQueries({ queryKey: ["posts-timeline", clientId] });
      qc.invalidateQueries({ queryKey: ["ic-memoria-insights", clientId] });
    },
    onError: (e: any) => {
      toast.error(e?.message || "Falha ao importar posts.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Sparkles className="w-4 h-4 mr-1.5" />
            Importar posts para memória
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Importar posts para a memória
          </DialogTitle>
          <DialogDescription>
            Cada post vira um documento estruturado (resumo, propostas, promessas, bandeiras,
            bordões) e passa a aparecer no DNA, Livro de Campanha e busca semântica. Posts sem
            legenda são ignorados — eles ficam apenas na Timeline visual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Janela de tempo</Label>
            <Select value={windowOpt} onValueChange={(v) => setWindowOpt(v as WindowOpt)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="365">Último ano</SelectItem>
                <SelectItem value="all">Tudo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Máximo por execução</Label>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 posts</SelectItem>
                <SelectItem value="25">25 posts</SelectItem>
                <SelectItem value="50">50 posts</SelectItem>
                <SelectItem value="100">100 posts</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Cada post consome 1 chamada ao LLM. Comece pequeno se for a primeira importação.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={mut.isPending}>
            Fechar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Importando…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1.5" /> Importar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

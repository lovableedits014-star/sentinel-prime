import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Eye, XCircle, Loader2 } from "lucide-react";

type Props = {
  clientId: string;
  pessoa: { id: string; nome: string } | null;
  onClose: () => void;
};

type Row = {
  mission_id: string;
  title: string | null;
  publicado_em: string;
  primeiro_acesso_em: string | null;
  concluido_em: string | null;
  status: "cumpriu" | "abriu" | "nao_abriu";
};

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export default function MissionPessoaHistorico({ clientId, pessoa, onClose }: Props) {
  const open = !!pessoa;

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["mission-historico", clientId, pessoa?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("mission_checkin_pessoa_historico", {
        p_client_id: clientId,
        p_pessoa_id: pessoa!.id,
        p_limit: 30,
      });
      if (error) throw error;
      return (data || []) as Row[];
    },
    enabled: open,
  });

  const cumpriu = rows.filter((r) => r.status === "cumpriu").length;
  const total = rows.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{pessoa?.nome}</DialogTitle>
          <DialogDescription>
            Histórico das últimas missões — {cumpriu} de {total} cumpridas
            {total > 0 && ` (${Math.round((cumpriu / total) * 100)}%)`}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma missão registrada.</p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {rows.map((r) => (
              <div key={r.mission_id} className="flex items-start gap-3 rounded-lg border p-2.5">
                {r.status === "cumpriu" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                ) : r.status === "abriu" ? (
                  <Eye className="mt-0.5 h-4 w-4 text-amber-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title || "Missão"}</p>
                  <p className="text-xs text-muted-foreground">
                    Publicada em {fmt(r.publicado_em)}
                    {r.primeiro_acesso_em && ` · abriu ${fmt(r.primeiro_acesso_em)}`}
                    {r.concluido_em && ` · concluiu ${fmt(r.concluido_em)}`}
                  </p>
                </div>
                <Badge
                  variant={r.status === "cumpriu" ? "default" : r.status === "abriu" ? "secondary" : "destructive"}
                  className="shrink-0 text-[10px]"
                >
                  {r.status === "cumpriu" ? "Cumpriu" : r.status === "abriu" ? "Abriu" : "Não abriu"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

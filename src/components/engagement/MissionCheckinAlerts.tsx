import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, MessageCircle, UserPlus } from "lucide-react";
import { fmtPhoneBR, toWhatsAppBR } from "@/lib/phone-utils";
import { toast } from "sonner";

type Reincidente = {
  pessoa_id: string;
  nome: string;
  telefone: string | null;
  cargo: string | null;
  regiao: string | null;
  missoes: number;
  faltas: number;
};

type NaoIdentificado = {
  participant_id: string;
  nome: string | null;
  telefone: string | null;
  primeiro_acesso_em: string | null;
  grupo: string | null;
};

type AbertoSemConfirmar = {
  pessoa_id: string;
  nome: string;
  telefone: string | null;
  cargo: string | null;
  regiao: string | null;
};

export default function MissionCheckinAlerts({
  clientId,
  missionId,
  missionTitle,
  missionLink,
  abertosSemConfirmar = [],
}: {
  clientId: string;
  missionId: string;
  missionTitle: string | null;
  missionLink: string | null;
  abertosSemConfirmar?: AbertoSemConfirmar[];
}) {
  const { data: reincidentes = [], isLoading: loadingR } = useQuery<Reincidente[]>({
    queryKey: ["mission-checkin-reincidentes", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("mission_checkin_reincidentes", {
        p_client_id: clientId,
        p_limit: 15,
      });
      if (error) throw error;
      return (data || []) as Reincidente[];
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });

  const { data: naoIdent = [], isLoading: loadingN } = useQuery<NaoIdentificado[]>({
    queryKey: ["mission-nao-identificados", clientId, missionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("mission_participantes_nao_identificados", {
        p_client_id: clientId,
        p_mission_id: missionId,
      });
      if (error) throw error;
      return (data || []) as NaoIdentificado[];
    },
    enabled: !!clientId && !!missionId,
    staleTime: 30_000,
  });

  const cobrar = (nome: string, telefone: string | null) => {
    const phone = toWhatsAppBR(telefone);
    if (!phone) {
      toast.error("Telefone inválido ou ausente neste cadastro");
      return;
    }
    const texto = [
      `Olá ${nome.split(" ")[0]}, tudo bem?`,
      "",
      `Notamos que você tem faltado nas últimas missões da campanha${missionTitle ? ` (a atual é "${missionTitle}")` : ""}.`,
      missionLink ? `Participe agora: ${missionLink}` : "",
      "",
      "Contamos com você!",
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="border-destructive/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Alertas — quem mais falta
          </CardTitle>
          <CardDescription>
            Reincidentes nas últimas missões. Cobre com um clique no WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingR ? (
            <div className="py-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : reincidentes.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Ninguém em situação crítica. Bom sinal.</p>
          ) : (
            <div className="space-y-2">
              {reincidentes.map((r) => (
                <div key={r.pessoa_id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[r.cargo, r.regiao, fmtPhoneBR(r.telefone)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge variant="destructive" className="shrink-0 text-[10px]">
                    {r.faltas}/{r.missoes} faltas
                  </Badge>
                  <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs"
                    onClick={() => cobrar(r.nome, r.telefone)}>
                    <MessageCircle className="h-3.5 w-3.5" /> Cobrar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" /> Entraram no link e não estão no sistema
          </CardTitle>
          <CardDescription>
            Pessoas que participaram desta missão mas o telefone não bateu com nenhum cadastro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingN ? (
            <div className="py-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : naoIdent.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Todos os acessos foram identificados.</p>
          ) : (
            <div className="space-y-2">
              {naoIdent.map((n) => (
                <div key={n.participant_id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{n.nome || "Sem nome"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[fmtPhoneBR(n.telefone), n.grupo].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">Não identificado</Badge>
                  {n.telefone && (
                    <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"
                      onClick={() => cobrar(n.nome || "amigo", n.telefone)}>
                      <MessageCircle className="h-3.5 w-3.5" /> Falar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

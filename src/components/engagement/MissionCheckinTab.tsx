import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BarChart3, Filter, Link2, ListChecks, Loader2, Target, ExternalLink } from "lucide-react";
import { FacebookIcon, InstagramIcon } from "@/components/icons/SocialIcons";
import { resolvePublicBaseUrl } from "@/lib/public-base-url";
import { fetchAudiences, setMissionAudience, type MissionAudience } from "@/lib/mission-audiences";
import MissionLinksPanel from "./MissionLinksPanel";
import MissionLinksEditor from "./MissionLinksEditor";
import MissionCheckinDashboard from "./MissionCheckinDashboard";
import MissionFromPostDialog from "./MissionFromPostDialog";
import MissionAudiencesTab from "./MissionAudiencesTab";

type Mission = {
  id: string;
  title: string | null;
  created_at: string;
  publicado_em: string | null;
  post_url: string | null;
  link_facebook: string | null;
  link_instagram: string | null;
  instructions: string | null;
  audience_id?: string | null;
  audience_snapshotted_at?: string | null;
  eligible_count?: number | null;
};


export default function MissionCheckinTab({ clientId }: { clientId: string }) {
  const [missionId, setMissionId] = useState<string>("");
  const qc = useQueryClient();

  const { data: client } = useQuery({
    queryKey: ["client-public-base", clientId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("clients")
        .select("id, name, public_base_url")
        .eq("id", clientId)
        .maybeSingle();
      return data;
    },
    enabled: !!clientId,
  });

  const { data: missions = [], isLoading } = useQuery<Mission[]>({
    queryKey: ["checkin-missions", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("portal_missions")
        .select("id, title, created_at, publicado_em, post_url, link_facebook, link_instagram, instructions, audience_id, audience_snapshotted_at, eligible_count")
        .eq("client_id", clientId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as Mission[];
    },
    enabled: !!clientId,
  });

  const { data: audiences = [] } = useQuery<MissionAudience[]>({
    queryKey: ["mission-audiences", clientId],
    queryFn: () => fetchAudiences(clientId),
    enabled: !!clientId,
  });

  useEffect(() => {
    if (!missionId && missions.length > 0) setMissionId(missions[0].id);
  }, [missions, missionId]);

  const mission = useMemo(() => missions.find((m) => m.id === missionId) || null, [missions, missionId]);
  const base = useMemo(() => resolvePublicBaseUrl(client), [client]);
  const missionLink = mission ? `${base.url}/missao/${mission.id}` : null;
  const audienceId = mission?.audience_id ?? null;
  const audienceNome = useMemo(
    () => audiences.find((a) => a.id === audienceId)?.nome ?? null,
    [audiences, audienceId],
  );

  const escolherLista = async (value: string) => {
    if (!missionId) return;
    const next = value === "__none" ? null : value;
    try {
      const total = await setMissionAudience(clientId, missionId, next);
      await qc.invalidateQueries({ queryKey: ["checkin-missions", clientId] });
      toast.success(`Missão iniciada com ${total} contratado(s) no disparo`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao aplicar a lista");
    }
  };



  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="missao" className="space-y-4">
      <TabsList>
        <TabsTrigger value="missao" className="gap-1.5">
          <Target className="h-4 w-4" /> Missão e dashboard
        </TabsTrigger>
        <TabsTrigger value="listas" className="gap-1.5">
          <ListChecks className="h-4 w-4" /> Listas de obrigados
        </TabsTrigger>
      </TabsList>

      <TabsContent value="listas" className="mt-0">
        <MissionAudiencesTab clientId={clientId} />
      </TabsContent>

      <TabsContent value="missao" className="mt-0 space-y-4">
        {missions.length === 0 ? (
          <Card>
            <CardContent className="space-y-4 py-12 text-center text-sm text-muted-foreground">
              <p>
                Nenhuma missão criada ainda. Crie uma missão com publicação do Facebook/Instagram ou com links
                externos manuais; depois o link rastreado aparece aqui para enviar no grupo.
              </p>
              <div className="flex justify-center">
                <MissionFromPostDialog clientId={clientId} onCreated={setMissionId} />
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Target className="h-4 w-4" /> Missões, links e dashboard
                    </CardTitle>
                    <CardDescription>
                      Escolha ou crie a missão, defina qual lista de obrigados vale para ela e acompanhe abaixo
                      o link do grupo, os links externos e o dashboard de cumprimento.
                    </CardDescription>
                  </div>
                  <MissionFromPostDialog clientId={clientId} onCreated={setMissionId} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Missão</Label>
                    <Select value={missionId} onValueChange={setMissionId}>
                      <SelectTrigger><SelectValue placeholder="Selecione a missão" /></SelectTrigger>
                      <SelectContent>
                        {missions.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.title || "Missão sem título"} ·{" "}
                            {new Date(m.publicado_em || m.created_at).toLocaleDateString("pt-BR")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Quem é obrigado nesta missão</Label>
                    <Select disabled={!!mission?.audience_snapshotted_at} value={audienceId ?? "__none"} onValueChange={escolherLista}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Público padrão (contratos + voluntários)</SelectItem>
                        {audiences.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.nome}{a.is_default ? " (padrão)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mission?.audience_snapshotted_at && (
                      <p className="text-[11px] text-emerald-700">
                        Contratados no momento do disparo: {mission.eligible_count ?? 0}. Novos contratos entram somente nas próximas missões.
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Crie e edite listas na aba “Listas de obrigados”.
                    </p>
                  </div>
                </div>

                {mission && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                    <p className="mb-2 font-medium">Publicação principal desta missão</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {mission.link_facebook ? (
                        <a href={mission.link_facebook} target="_blank" rel="noreferrer">
                          <Badge variant="secondary" className="gap-1">
                            <FacebookIcon className="h-3 w-3" /> Facebook <ExternalLink className="h-3 w-3" />
                          </Badge>
                        </a>
                      ) : null}
                      {mission.link_instagram ? (
                        <a href={mission.link_instagram} target="_blank" rel="noreferrer">
                          <Badge variant="secondary" className="gap-1">
                            <InstagramIcon className="h-3 w-3" /> Instagram <ExternalLink className="h-3 w-3" />
                          </Badge>
                        </a>
                      ) : null}
                      {!mission.link_facebook && !mission.link_instagram && mission.post_url ? (
                        <a href={mission.post_url} target="_blank" rel="noreferrer">
                          <Badge variant="secondary" className="gap-1">
                            Publicação <ExternalLink className="h-3 w-3" />
                          </Badge>
                        </a>
                      ) : null}
                      {!mission.link_facebook && !mission.link_instagram && !mission.post_url && (
                        <span className="text-muted-foreground">
                          Esta missão foi criada sem publicação principal. Use “Links externos da missão” para
                          cadastrar os botões que aparecerão na tela da pessoa.
                        </span>
                      )}
                    </div>
                    {mission.instructions && (
                      <p className="mt-2 text-muted-foreground">{mission.instructions}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {missionId && (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> 1. Link para o grupo</p>
                    <p className="mt-1 text-xs text-muted-foreground">Gere e copie a mensagem rastreada.</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold"><ExternalLink className="h-4 w-4" /> 2. Links externos</p>
                    <p className="mt-1 text-xs text-muted-foreground">Adicione site, notícia, YouTube, TikTok ou formulário.</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold"><Filter className="h-4 w-4" /> 3. Dashboard e filtros</p>
                    <p className="mt-1 text-xs text-muted-foreground">Veja quem cumpriu, quem faltou e o histórico de cada pessoa.</p>
                  </div>
                </div>
                <MissionLinksPanel clientId={clientId} missionId={missionId} missionTitle={mission?.title ?? null} />
                <MissionLinksEditor clientId={clientId} missionId={missionId} />
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4" /> Dashboard da missão selecionada</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {audienceNome
                      ? `Medindo a lista “${audienceNome}”.`
                      : "Medindo o público padrão: contratos vigentes + voluntários."}
                  </p>
                </div>
                <MissionCheckinDashboard
                  clientId={clientId}
                  missionId={missionId}
                  missionTitle={mission?.title ?? null}
                  missionLink={missionLink}
                  audienceId={audienceId}
                  audienceNome={audienceNome}
                />
              </>
            )}
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

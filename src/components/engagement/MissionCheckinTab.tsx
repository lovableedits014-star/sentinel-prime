import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Target, ExternalLink } from "lucide-react";
import { FacebookIcon, InstagramIcon } from "@/components/icons/SocialIcons";
import { resolvePublicBaseUrl } from "@/lib/public-base-url";
import MissionLinksPanel from "./MissionLinksPanel";
import MissionLinksEditor from "./MissionLinksEditor";
import MissionCheckinDashboard from "./MissionCheckinDashboard";
import MissionFromPostDialog from "./MissionFromPostDialog";

type Mission = {
  id: string;
  title: string | null;
  created_at: string;
  publicado_em: string | null;
  post_url: string | null;
  link_facebook: string | null;
  link_instagram: string | null;
  instructions: string | null;
};

export default function MissionCheckinTab({ clientId }: { clientId: string }) {
  const [missionId, setMissionId] = useState<string>("");

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
        .select("id, title, created_at, publicado_em, post_url, link_facebook, link_instagram, instructions")
        .eq("client_id", clientId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as Mission[];
    },
    enabled: !!clientId,
  });

  useEffect(() => {
    if (!missionId && missions.length > 0) setMissionId(missions[0].id);
  }, [missions, missionId]);

  const mission = useMemo(() => missions.find((m) => m.id === missionId) || null, [missions, missionId]);
  const base = useMemo(() => resolvePublicBaseUrl(client), [client]);
  const missionLink = mission ? `${base.url}/missao/${mission.id}` : null;


  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (missions.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-4 py-12 text-center text-sm text-muted-foreground">
          <p>
            Nenhuma missão criada ainda. Escolha a publicação que você quer que o time compartilhe — o
            link rastreado é gerado na hora.
          </p>
          <div className="flex justify-center">
            <MissionFromPostDialog clientId={clientId} onCreated={setMissionId} />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4" /> Check-in de missões
              </CardTitle>
              <CardDescription>
                Escolha a publicação, copie o link e jogue no grupo. A pessoa abre, confirma nome e
                WhatsApp uma única vez e o sistema reconhece quem ela é na sua estrutura — nas próximas
                missões ela entra direto e o acesso é registrado automaticamente.
              </CardDescription>
            </div>
            <MissionFromPostDialog clientId={clientId} onCreated={setMissionId} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Missão</Label>
            <Select value={missionId} onValueChange={setMissionId}>
              <SelectTrigger className="max-w-xl"><SelectValue placeholder="Selecione a missão" /></SelectTrigger>
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

          {mission && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs">
              <p className="mb-2 font-medium">Publicação desta missão</p>
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
                    Esta missão não tem publicação vinculada — crie uma nova missão a partir de uma
                    publicação para o botão de compartilhar aparecer na tela da pessoa.
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
          <MissionLinksEditor clientId={clientId} missionId={missionId} />
          <MissionLinksPanel clientId={clientId} missionId={missionId} missionTitle={mission?.title ?? null} />
          <MissionCheckinDashboard
            clientId={clientId}
            missionId={missionId}
            missionTitle={mission?.title ?? null}
            missionLink={missionLink}
          />
        </>
      )}
    </div>
  );
}

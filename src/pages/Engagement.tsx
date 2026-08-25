import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Activity,
  Heart,
  MessageCircle,
  Share2,
  Settings,
  Users,
  AlertTriangle,
  UserCog,
  ClipboardCheck,
  Gauge,
  Target,
} from "lucide-react";
import InfluenciadoresTab from "@/components/engagement/InfluenciadoresTab";
import PerfisTimeTab from "@/components/engagement/PerfisTimeTab";
import CobrancaTimeTab from "@/components/engagement/CobrancaTimeTab";
import MonitoramentoTab from "@/components/engagement/MonitoramentoTab";
import PublicoMonitoradoTab from "@/components/engagement/PublicoMonitoradoTab";
import MissionCheckinTab from "@/components/engagement/MissionCheckinTab";



type EngagementConfig = {
  id: string;
  client_id: string;
  like_points: number;
  comment_points: number;
  share_points: number;
  reaction_points: number;
  inactivity_days: number;
};

type EngagementProps = {
  initialTab?: "publico" | "checkin" | "influenciadores" | "time" | "cobranca" | "monitoramento" | "config";
};

export default function Engagement({ initialTab = "publico" }: EngagementProps) {
  const [configForm, setConfigForm] = useState<Partial<EngagementConfig>>({});

  const { data: client } = useQuery({
    queryKey: ["client-active", "engagement"],
    queryFn: async () => {
      const { resolveClientId } = await import("@/lib/resolveClientId");
      const cId = await resolveClientId();
      if (!cId) return null;
      const { data, error } = await supabase.from("clients").select("*").eq("id", cId).maybeSingle();
      if (error) throw error;
      return data;
    }
  });

  const { data: engagementConfig, refetch: refetchConfig } = useQuery({
    queryKey: ["engagement-config", client?.id],
    queryFn: async () => {
      if (!client?.id) return null;
      const { data, error } = await supabase
        .from("engagement_config" as any)
        .select("*")
        .eq("client_id", client.id)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      const config = data as unknown as EngagementConfig | null;
      if (config) setConfigForm(config);
      return config;
    },
    enabled: !!client?.id
  });

  const saveConfig = async () => {
    if (!client?.id) return;
    try {
      const configData = {
        client_id: client.id,
        like_points: configForm.like_points || 1,
        comment_points: configForm.comment_points || 3,
        share_points: configForm.share_points || 5,
        reaction_points: configForm.reaction_points || 1,
        inactivity_days: configForm.inactivity_days || 7
      };
      if (engagementConfig?.id) {
        const { error } = await supabase.from("engagement_config" as any).update(configData).eq("id", engagementConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("engagement_config" as any).insert(configData);
        if (error) throw error;
      }
      toast.success("Configuração salva!");
      refetchConfig();
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar configuração");
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Engajamento</h1>
        <p className="text-sm text-muted-foreground">
          Identifique automaticamente quem mais interage com suas publicações. O sistema detecta influenciadores e apoiadores ativos com base em curtidas, comentários e compartilhamentos — e permite configurar a pontuação de cada tipo de ação.
        </p>
      </div>

      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList className="w-full sm:w-auto flex-wrap h-auto">
          <TabsTrigger value="publico" className="text-xs sm:text-sm gap-1.5">
            <Users className="h-4 w-4" />
            Público monitorado
          </TabsTrigger>
          <TabsTrigger value="checkin" className="text-xs sm:text-sm gap-1.5">
            <Target className="h-4 w-4" />
            Check-in de missões
          </TabsTrigger>
          <TabsTrigger value="influenciadores" className="text-xs sm:text-sm gap-1.5">
            <Activity className="h-4 w-4" />
            Influenciadores
          </TabsTrigger>
          <TabsTrigger value="time" className="text-xs sm:text-sm gap-1.5">
            <UserCog className="h-4 w-4" />
            Perfis do Time
          </TabsTrigger>
          <TabsTrigger value="cobranca" className="text-xs sm:text-sm gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            Cobrança do Time
          </TabsTrigger>
          <TabsTrigger value="monitoramento" className="text-xs sm:text-sm gap-1.5">
            <Gauge className="h-4 w-4" />
            Publicações e ranking
          </TabsTrigger>
          <TabsTrigger value="config" className="text-xs sm:text-sm gap-1.5">
            <Settings className="h-4 w-4" />
            Config
          </TabsTrigger>
        </TabsList>

        <TabsContent value="publico">
          {client?.id ? (
            <PublicoMonitoradoTab clientId={client.id} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum cliente vinculado a este usuário.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="checkin">
          {client?.id ? (
            <MissionCheckinTab clientId={client.id} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum cliente vinculado a este usuário.
              </CardContent>
            </Card>
          )}
        </TabsContent>



        <TabsContent value="influenciadores">
          {client?.id ? (
            <InfluenciadoresTab clientId={client.id} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum cliente vinculado a este usuário. Esta página exibe influenciadores
                por cliente — acesse com uma conta vinculada a um cliente para visualizar os dados.
              </CardContent>
            </Card>
          )}
        </TabsContent>


        <TabsContent value="time">
          {client?.id ? (
            <PerfisTimeTab clientId={client.id} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum cliente vinculado a este usuário.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cobranca">
          {client?.id ? (
            <CobrancaTimeTab clientId={client.id} clientName={client.name || undefined} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum cliente vinculado a este usuário.
              </CardContent>
            </Card>
          )}
        </TabsContent>




        <TabsContent value="monitoramento">
          {client?.id ? (
            <MonitoramentoTab clientId={client.id} clientName={client.name || undefined} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum cliente vinculado a este usuário.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardHeader className="px-3 sm:px-6">
              <CardTitle>Configuração de Pontuação</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Pontos por tipo de ação — os scores somam Facebook + Instagram
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 px-3 sm:px-6">
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="like_points" className="flex items-center gap-2 text-xs sm:text-sm">
                    <Heart className="h-4 w-4 text-destructive" />
                    Curtida
                  </Label>
                  <Input id="like_points" type="number" min="0"
                    value={configForm.like_points || 1}
                    onChange={(e) => setConfigForm({ ...configForm, like_points: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comment_points" className="flex items-center gap-2 text-xs sm:text-sm">
                    <MessageCircle className="h-4 w-4 text-primary" />
                    Comentário
                  </Label>
                  <Input id="comment_points" type="number" min="0"
                    value={configForm.comment_points || 3}
                    onChange={(e) => setConfigForm({ ...configForm, comment_points: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="share_points" className="flex items-center gap-2 text-xs sm:text-sm">
                    <Share2 className="h-4 w-4 text-emerald-500" />
                    Compartilhar
                  </Label>
                  <Input id="share_points" type="number" min="0"
                    value={configForm.share_points || 5}
                    onChange={(e) => setConfigForm({ ...configForm, share_points: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reaction_points" className="flex items-center gap-2 text-xs sm:text-sm">
                    <Activity className="h-4 w-4 text-violet-500" />
                    Reação
                  </Label>
                  <Input id="reaction_points" type="number" min="0"
                    value={configForm.reaction_points || 1}
                    onChange={(e) => setConfigForm({ ...configForm, reaction_points: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="max-w-xs space-y-2">
                <Label htmlFor="inactivity_days" className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Dias para considerar inativo
                </Label>
                <Input id="inactivity_days" type="number" min="1"
                  value={configForm.inactivity_days || 7}
                  onChange={(e) => setConfigForm({ ...configForm, inactivity_days: parseInt(e.target.value) })}
                />
              </div>

              <Button onClick={saveConfig}>Salvar Configuração</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

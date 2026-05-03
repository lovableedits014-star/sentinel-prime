import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import AIMissionsPanel from "@/components/engagement/AIMissionsPanel";
import { PortalMissionsPanel } from "@/components/engagement/PortalMissionsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Target, AlertCircle } from "lucide-react";

export default function MissoesIA() {
  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ["client"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: owned } = await supabase
        .from("clients").select("id").eq("user_id", user.id).maybeSingle();
      if (owned) return owned;
      const { data: tm } = await supabase
        .from("team_members").select("client_id")
        .eq("user_id", user.id).eq("status", "active").maybeSingle();
      return tm?.client_id ? { id: tm.client_id } : null;
    },
  });

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Missões Inteligentes</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Transforme seguidores em uma rede ativa. A IA sugere missões baseadas nos temas em alta, permitindo que seus apoiadores interajam com posts estratégicos no Facebook e Instagram diretamente pelo portal exclusivo.
          </p>
        </div>
      </div>

      <Tabs defaultValue="sugestoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sugestoes" className="gap-1.5">
            <Sparkles className="w-4 h-4" />
            Sugestões da IA
          </TabsTrigger>
          <TabsTrigger value="missoes" className="gap-1.5">
            <Target className="w-4 h-4" />
            Missões Ativas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sugestoes">
          <AIMissionsPanel />
        </TabsContent>

        <TabsContent value="missoes">
          {clientLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : client?.id ? (
            <PortalMissionsPanel clientId={client.id} />
          ) : (
            <Card>
              <CardContent className="py-10 text-center space-y-2">
                <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">Nenhum cliente vinculado</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Sua conta não está associada a nenhum cliente. Vincule um cliente para gerenciar Missões Ativas.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

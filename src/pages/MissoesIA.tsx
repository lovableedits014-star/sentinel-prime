import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import AIMissionsPanel from "@/components/engagement/AIMissionsPanel";
import { PortalMissionsPanel } from "@/components/engagement/PortalMissionsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Target } from "lucide-react";

export default function MissoesIA() {
  const { data: client } = useQuery({
    queryKey: ["client"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("clients").select("id").eq("user_id", user.id).maybeSingle();
      return data;
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
          {client?.id ? (
            <PortalMissionsPanel clientId={client.id} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

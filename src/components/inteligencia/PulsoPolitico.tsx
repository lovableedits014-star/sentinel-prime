import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Vote, Map as MapIcon } from "lucide-react";
import RadarParlamentar from "./parlamentar/RadarParlamentar";
import ContextoTerritorial from "./territorio/ContextoTerritorial";

export default function PulsoPolitico() {
  const { data: clientId } = useQuery({
    queryKey: ["client-id-current"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      // Tenta team_members primeiro
      const { data: tm } = await supabase
        .from("team_members")
        .select("client_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (tm?.client_id) return tm.client_id as string;
      // Senão, dono do cliente
      const { data: cli } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      return (cli?.id as string | undefined) ?? null;
    },
  });

  return (
    <Tabs defaultValue="radar" className="w-full">
      <TabsList>
        <TabsTrigger value="radar" className="gap-1.5">
          <Vote className="w-3.5 h-3.5" /> Radar Parlamentar (adversários)
        </TabsTrigger>
        <TabsTrigger value="territorio" className="gap-1.5">
          <MapIcon className="w-3.5 h-3.5" /> Contexto Territorial (IBGE)
        </TabsTrigger>
      </TabsList>
      <TabsContent value="radar" className="mt-4">
        <RadarParlamentar clientId={clientId ?? null} />
      </TabsContent>
      <TabsContent value="territorio" className="mt-4">
        <ContextoTerritorial />
      </TabsContent>
    </Tabs>
  );
}
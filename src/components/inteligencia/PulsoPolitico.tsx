import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Vote, Map as MapIcon, Brain } from "lucide-react";
import RadarParlamentar from "./parlamentar/RadarParlamentar";
import ContextoTerritorial from "./territorio/ContextoTerritorial";
import BandeiraAutismoMS from "./bandeira/BandeiraAutismoMS";

export default function PulsoPolitico() {
  const { data: clientId } = useQuery({
    queryKey: ["client-id-current-active"],
    queryFn: async () => {
      const { resolveClientId } = await import("@/lib/resolveClientId");
      return await resolveClientId();
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
        <TabsTrigger value="autismo" className="gap-1.5">
          <Brain className="w-3.5 h-3.5" /> Bandeira: Autismo · MS
        </TabsTrigger>
      </TabsList>
      <TabsContent value="radar" className="mt-4">
        <RadarParlamentar clientId={clientId ?? null} />
      </TabsContent>
      <TabsContent value="territorio" className="mt-4">
        <ContextoTerritorial />
      </TabsContent>
      <TabsContent value="autismo" className="mt-4">
        <BandeiraAutismoMS />
      </TabsContent>
    </Tabs>
  );
}
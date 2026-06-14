import { useState } from "react";
import { Sparkles, Camera } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";
import CampaignFrameGenerator from "@/components/campaign-frame/CampaignFrameGenerator";
import FrameEditor from "@/components/campaign-frame/FrameEditor";

export default function FotosCampanha() {
  const { data: clientId } = useCurrentClientId();
  const [tab, setTab] = useState<"individual" | "lote">("lote");

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Fotos de Campanha</h1>
            <p className="text-sm text-muted-foreground">
              Monte fotos com moldura oficial. Modo individual ou em lote para várias fotos de uma vez.
            </p>
          </div>
        </div>
      </header>

      {!clientId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Sem cliente vinculado. Vincule um cliente para usar o gerador de fotos.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-4">
            <CampaignFrameGenerator clientId={clientId} variant="button" triggerLabel="Abrir em janela" />
          </div>
          <FrameEditor clientId={clientId} defaultTab={tab} />
        </>
      )}
    </div>
  );
}

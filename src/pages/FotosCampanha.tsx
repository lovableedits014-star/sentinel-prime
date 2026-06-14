import { useEffect, useState } from "react";
import { Camera, Link2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";
import CampaignFrameGenerator from "@/components/campaign-frame/CampaignFrameGenerator";
import FrameEditor from "@/components/campaign-frame/FrameEditor";
import GalleryManager from "@/components/campaign-frame/GalleryManager";

export default function FotosCampanha() {
  const { data: clientId } = useCurrentClientId();
  const [tab, setTab] = useState<"editor" | "galerias">("editor");
  const [publicSlug, setPublicSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("public_slug")
        .eq("id", clientId)
        .maybeSingle();
      setPublicSlug((data as any)?.public_slug ?? null);
    })();
  }, [clientId]);

  const hubUrl =
    typeof window !== "undefined" && clientId
      ? `${window.location.origin}/g/${publicSlug || clientId}`
      : "";

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Fotos de Campanha</h1>
            <p className="text-sm text-muted-foreground">
              Monte fotos individuais, em lote ou publique galerias por evento.
            </p>
          </div>
        </div>
        {clientId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              navigator.clipboard.writeText(hubUrl);
              toast.success("Link público do candidato copiado");
            }}
          >
            <Link2 className="w-4 h-4" /> Copiar link público
          </Button>
        )}
      </header>

      {!clientId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Sem cliente vinculado. Vincule um cliente para usar o gerador de fotos.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="editor">Editor (individual/lote)</TabsTrigger>
            <TabsTrigger value="galerias">Galerias públicas</TabsTrigger>
          </TabsList>
          <TabsContent value="editor" className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <CampaignFrameGenerator clientId={clientId} variant="button" triggerLabel="Abrir em janela" />
            </div>
            <FrameEditor clientId={clientId} defaultTab="lote" />
          </TabsContent>
          <TabsContent value="galerias" className="mt-4">
            <GalleryManager clientId={clientId} publicSlug={publicSlug} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

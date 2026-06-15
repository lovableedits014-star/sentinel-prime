import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import CampaignFrameGenerator from "@/components/campaign-frame/CampaignFrameGenerator";
import PublicMaterialsTab from "@/components/campaign-materials/PublicMaterialsTab";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Download, ArrowDown, Gift } from "lucide-react";

export default function FotoPublica() {
  const { clientId } = useParams<{ clientId: string }>();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState<string>("Campanha");
  const [materialCount, setMaterialCount] = useState<number>(0);
  const materialsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const [{ data: ident }, { data: client }, { count }] = await Promise.all([
        supabase.from("candidate_identity").select("logo_url").eq("client_id", clientId).maybeSingle(),
        supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
        supabase
          .from("campaign_materials")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .eq("status", "published"),
      ]);
      if (ident?.logo_url) setLogoUrl(ident.logo_url);
      if (client?.name) setCandidateName(client.name);
      setMaterialCount(count ?? 0);
    })();
  }, [clientId]);

  if (!clientId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-6 max-w-md text-center">
          <p className="text-sm text-muted-foreground">Link inválido.</p>
        </Card>
      </div>
    );
  }

  const scrollToMaterials = () => {
    materialsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={candidateName} className="w-10 h-10 object-contain" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Foto oficial da campanha</p>
            <h1 className="text-base font-semibold truncate">{candidateName}</h1>
          </div>
          {materialCount > 0 && (
            <Button
              size="sm"
              variant="default"
              onClick={scrollToMaterials}
              className="shrink-0 gap-1.5 animate-pulse"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Baixar materiais</span>
              <span className="sm:hidden">Materiais</span>
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold">Gere sua foto de perfil</h2>
          <p className="text-sm text-muted-foreground">
            Envie sua foto e baixe a versão com a moldura oficial para usar no WhatsApp e redes sociais.
          </p>
        </div>
        <CampaignFrameGenerator clientId={clientId} variant="showcase" />

        {materialCount > 0 && (
          <button
            type="button"
            onClick={scrollToMaterials}
            className="w-full rounded-xl border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-colors p-4 flex items-center gap-3 text-left"
          >
            <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              <Gift className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base">
                👇 Baixe {materialCount} material{materialCount > 1 ? "is" : ""} de campanha
              </p>
              <p className="text-xs text-muted-foreground">
                Imagens, vídeos e PDFs prontos para compartilhar no WhatsApp
              </p>
            </div>
            <ArrowDown className="w-5 h-5 text-primary shrink-0 animate-bounce" />
          </button>
        )}

        <div ref={materialsRef} className="scroll-mt-20 space-y-3 pt-2">
          <div className="flex items-center gap-2 border-b pb-2">
            <Download className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">Materiais para baixar e compartilhar</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Clique em "Baixar" e depois compartilhe nos seus grupos. Toque no botão verde para enviar direto no WhatsApp.
          </p>
          <PublicMaterialsTab clientId={clientId} clientName={candidateName} />
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground">
        Compartilhe este link com amigos e apoiadores.
      </footer>
    </div>
  );
}

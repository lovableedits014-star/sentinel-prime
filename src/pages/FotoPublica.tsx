import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import CampaignFrameGenerator from "@/components/campaign-frame/CampaignFrameGenerator";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export default function FotoPublica() {
  const { clientId } = useParams<{ clientId: string }>();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState<string>("Campanha");

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const [{ data: ident }, { data: client }] = await Promise.all([
        supabase.from("candidate_identity").select("logo_url").eq("client_id", clientId).maybeSingle(),
        supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
      ]);
      if (ident?.logo_url) setLogoUrl(ident.logo_url);
      if (client?.name) setCandidateName(client.name);
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
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Foto oficial da campanha</p>
            <h1 className="text-base font-semibold truncate">{candidateName}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold">Gere sua foto de perfil</h2>
          <p className="text-sm text-muted-foreground">
            Envie sua foto e baixe a versão com a moldura oficial para usar no WhatsApp e redes sociais.
          </p>
        </div>
        <CampaignFrameGenerator clientId={clientId} variant="showcase" />
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground">
        Compartilhe este link com amigos e apoiadores.
      </footer>
    </div>
  );
}

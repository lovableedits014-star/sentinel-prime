import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Image as ImageIcon, ArrowRight, FileText } from "lucide-react";
import CampaignFrameGenerator from "@/components/campaign-frame/CampaignFrameGenerator";
import PublicMaterialsTab from "@/components/campaign-materials/PublicMaterialsTab";

interface Gallery {
  id: string;
  slug: string;
  nome: string;
  event_date: string | null;
  cover_url: string | null;
}

export default function GaleriaPublica() {
  const { clientSlug } = useParams<{ clientSlug: string }>();
  const [client, setClient] = useState<{ id: string; name: string; logo_url: string | null } | null>(
    null,
  );
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [previews, setPreviews] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!clientSlug) return;
    (async () => {
      setLoading(true);
      const { data: c } = await supabase
        .rpc("get_public_client_by_slug", { _slug: clientSlug })
        .maybeSingle();
      if (!c) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setClient(c as any);
      const { data: gs } = await supabase
        .from("campaign_photo_galleries")
        .select("id,slug,nome,event_date,cover_url")
        .eq("client_id", (c as any).id)
        .eq("status", "published")
        .order("event_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      const list = (gs ?? []) as any as Gallery[];
      setGalleries(list);

      if (list.length) {
        const { data: items } = await supabase
          .from("campaign_photo_gallery_items")
          .select("gallery_id,public_url,order_index")
          .in("gallery_id", list.map((g) => g.id))
          .order("order_index");
        const m: Record<string, number> = {};
        const p: Record<string, string[]> = {};
        for (const it of items ?? []) {
          const gid = (it as any).gallery_id;
          m[gid] = (m[gid] ?? 0) + 1;
          if (!p[gid]) p[gid] = [];
          if (p[gid].length < 9) p[gid].push((it as any).public_url);
        }
        setCounts(m);
        setPreviews(p);
      }
      setLoading(false);
    })();
  }, [clientSlug]);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-6 max-w-md text-center">
          <p className="text-sm text-muted-foreground">Página não encontrada.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <p className="text-xs text-muted-foreground">Galeria oficial</p>
          <h1 className="text-base font-semibold truncate">{client?.name ?? "Campanha"}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* Featured: gerar sua foto */}
        {client && (
          <section className="space-y-3">
            <div className="text-center">
              <h2 className="text-xl font-bold">Crie sua foto de perfil</h2>
              <p className="text-sm text-muted-foreground">
                Use a moldura oficial em segundos.
              </p>
            </div>
            <CampaignFrameGenerator clientId={client.id} variant="showcase" />
          </section>
        )}

        {/* Galerias */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Eventos e fotos</h2>
            <span className="text-xs text-muted-foreground">{galleries.length} galeria(s)</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : galleries.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                <ImageIcon className="w-10 h-10 mx-auto opacity-40 mb-2" />
                Nenhuma galeria publicada ainda. Volte em breve!
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {galleries.map((g) => (
                <Link
                  key={g.id}
                  to={`/g/${clientSlug}/${g.slug}`}
                  className="group block rounded-lg overflow-hidden border bg-card hover:shadow-md transition-shadow"
                >
                  <div className="aspect-video bg-muted relative p-1">
                    {(previews[g.id]?.length ?? 0) > 0 ? (
                      <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-full h-full">
                        {Array.from({ length: 9 }).map((_, i) => {
                          const url = previews[g.id]?.[i];
                          return (
                            <div key={i} className="bg-muted overflow-hidden">
                              {url && (
                                <img
                                  src={url}
                                  alt=""
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <ImageIcon className="w-8 h-8 opacity-40" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-medium truncate">{g.nome}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      {counts[g.id] ?? 0} fotos
                      {g.event_date && (
                        <> · {new Date(g.event_date + "T00:00:00").toLocaleDateString("pt-BR")}</>
                      )}
                      <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground">
        Compartilhe este link com amigos e apoiadores.
      </footer>
    </div>
  );
}

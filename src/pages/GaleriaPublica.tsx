import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Camera,
  Image as ImageIcon,
  ArrowRight,
  FileText,
  Download,
  ArrowDown,
  Gift,
} from "lucide-react";
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
  const [materialCount, setMaterialCount] = useState<number>(0);
  const [tab, setTab] = useState<"eventos" | "materiais">("eventos");
  const tabsRef = useRef<HTMLDivElement>(null);

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
      const clientId = (c as any).id;

      const [{ data: gs }, { count: matCount }] = await Promise.all([
        supabase
          .from("campaign_photo_galleries")
          .select("id,slug,nome,event_date,cover_url")
          .eq("client_id", clientId)
          .eq("status", "published")
          .order("event_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("campaign_materials")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .eq("status", "published"),
      ]);
      const list = (gs ?? []) as any as Gallery[];
      setGalleries(list);
      setMaterialCount(matCount ?? 0);

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

  const goToMateriais = () => {
    setTab("materiais");
    setTimeout(() => {
      tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Galeria oficial</p>
            <h1 className="text-base font-semibold truncate">{client?.name ?? "Campanha"}</h1>
          </div>
          {materialCount > 0 && (
            <Button
              size="sm"
              onClick={goToMateriais}
              className="shrink-0 gap-1.5 animate-pulse"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Baixar materiais</span>
              <span className="sm:hidden">Materiais</span>
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
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

        {/* CTA destacado para materiais */}
        {materialCount > 0 && (
          <button
            type="button"
            onClick={goToMateriais}
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

        {/* Conteúdo: Eventos + Materiais */}
        <section ref={tabsRef} className="scroll-mt-20">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "eventos" | "materiais")}>
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="eventos">
                <Camera className="w-4 h-4 mr-1.5" />Eventos
              </TabsTrigger>
              <TabsTrigger value="materiais" className="relative">
                <FileText className="w-4 h-4 mr-1.5" />
                Materiais
                {materialCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="ml-1.5 h-5 px-1.5 text-[10px] font-bold"
                  >
                    {materialCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="eventos" className="mt-4 space-y-3">
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
            </TabsContent>

            <TabsContent value="materiais" className="mt-4 space-y-3">
              <div className="flex items-center gap-2 border-b pb-2">
                <Download className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">Materiais para baixar e compartilhar</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Clique em <strong>Baixar</strong> e depois compartilhe nos seus grupos. Toque no
                botão verde para enviar direto no WhatsApp.
              </p>
              {client && (
                <PublicMaterialsTab clientId={client.id} clientName={client.name} />
              )}
            </TabsContent>
          </Tabs>
        </section>
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground">
        Compartilhe este link com amigos e apoiadores.
      </footer>
    </div>
  );
}

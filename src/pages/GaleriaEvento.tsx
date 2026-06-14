import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Download,
  Search,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import CampaignFrameGenerator from "@/components/campaign-frame/CampaignFrameGenerator";

interface Item {
  id: string;
  original_file_name: string | null;
  public_url: string;
  order_index: number;
}

interface Gallery {
  id: string;
  slug: string;
  nome: string;
  event_date: string | null;
  cover_url: string | null;
}

export default function GaleriaEvento() {
  const { clientSlug, gallerySlug } = useParams<{ clientSlug: string; gallerySlug: string }>();
  const [client, setClient] = useState<{ id: string; name: string; logo_url: string | null } | null>(
    null,
  );
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [query, setQuery] = useState("");
  const [lightbox, setLightbox] = useState<Item | null>(null);
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    if (!clientSlug || !gallerySlug) return;
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
      const { data: g } = await supabase
        .from("campaign_photo_galleries")
        .select("id,slug,nome,event_date,cover_url")
        .eq("client_id", (c as any).id)
        .eq("slug", gallerySlug)
        .eq("status", "published")
        .maybeSingle();
      if (!g) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setGallery(g as any);
      const { data: its } = await supabase
        .from("campaign_photo_gallery_items")
        .select("id,original_file_name,public_url,order_index")
        .eq("gallery_id", (g as any).id)
        .order("order_index");
      setItems((its ?? []) as any);
      setLoading(false);
    })();
  }, [clientSlug, gallerySlug]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((it) => (it.original_file_name ?? "").toLowerCase().includes(q));
  }, [items, query]);

  const downloadOne = async (it: Item) => {
    try {
      const resp = await fetch(it.public_url);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (it.original_file_name?.replace(/\.[^.]+$/, "") || "foto") + "-campanha.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.open(it.public_url, "_blank");
    }
  };

  const downloadAll = async () => {
    if (!items.length) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const resp = await fetch(it.public_url);
        const blob = await resp.blob();
        const safe = (it.original_file_name?.replace(/\.[^.]+$/, "") || `foto-${i + 1}`).replace(
          /[^a-z0-9-_]+/gi,
          "_",
        );
        zip.file(`${String(i + 1).padStart(2, "0")}-${safe}.png`, blob);
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${gallery?.slug ?? "galeria"}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      toast.error("Falha ao gerar ZIP");
    } finally {
      setZipping(false);
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-6 max-w-md text-center">
          <p className="text-sm text-muted-foreground">Galeria não encontrada.</p>
          {clientSlug && (
            <Link to={`/g/${clientSlug}`} className="text-primary text-sm underline mt-2 inline-block">
              Voltar
            </Link>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {client?.logo_url ? (
            <img src={client.logo_url} alt={client.name} className="w-9 h-9 object-contain" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <Link
              to={`/g/${clientSlug}`}
              className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> {client?.name}
            </Link>
            <h1 className="text-base font-semibold truncate">{gallery?.nome}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">
              {gallery?.event_date &&
                new Date(gallery.event_date + "T00:00:00").toLocaleDateString("pt-BR")}{" "}
              · {items.length} fotos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8 h-9 w-44"
              />
            </div>
            <Button size="sm" className="gap-1.5" onClick={downloadAll} disabled={zipping || !items.length}>
              <Download className="w-4 h-4" />
              {zipping ? "Gerando…" : "Baixar todas (ZIP)"}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <ImageIcon className="w-10 h-10 mx-auto opacity-40 mb-2" />
              {items.length === 0 ? "Galeria ainda sem fotos." : "Nada encontrado."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {filtered.map((it) => (
              <button
                key={it.id}
                onClick={() => setLightbox(it)}
                className="group relative rounded-md overflow-hidden border bg-card aspect-square"
              >
                <img
                  src={it.public_url}
                  alt={it.original_file_name ?? ""}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                {it.original_file_name && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] px-1.5 py-1 truncate">
                    {it.original_file_name}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {client && (
          <section className="pt-6 border-t">
            <div className="text-center mb-3">
              <h3 className="text-base font-bold">Quer a sua foto com a moldura?</h3>
              <p className="text-xs text-muted-foreground">Gere a sua em segundos.</p>
            </div>
            <CampaignFrameGenerator clientId={client.id} variant="showcase" />
          </section>
        )}
      </main>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white p-2 rounded-full bg-black/40 hover:bg-black/60"
            onClick={() => setLightbox(null)}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
          <div
            className="max-w-2xl w-full bg-background rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={lightbox.public_url} alt="" className="w-full max-h-[75vh] object-contain bg-black" />
            <div className="p-3 flex items-center justify-between gap-3">
              <p className="text-sm truncate">{lightbox.original_file_name ?? "Foto"}</p>
              <Button size="sm" className="gap-1.5" onClick={() => downloadOne(lightbox)}>
                <Download className="w-4 h-4" /> Baixar PNG
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
